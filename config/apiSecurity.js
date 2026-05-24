import rateLimit from "express-rate-limit";

/**
 * Límites de peticiones (opción B: por tipo de ruta).
 * Valores leídos desde .env — ver .env.example sección "Rate limiting".
 */

function parseBool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parseIntEnv(key, fallback, { min = 0, max = 100_000 } = {}) {
  const raw = process.env[key];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** @returns {string[]} */
function parseIpWhitelist() {
  const raw = process.env.RATE_LIMIT_WHITELIST_IPS || "";
  return raw
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

/**
 * Configuración efectiva de seguridad / rate limit.
 * @returns {{
 *   enabled: boolean;
 *   trustProxy: boolean;
 *   windowMs: number;
 *   whitelistIps: string[];
 *   globalMax: number;
 *   historyPostMax: number;
 *   capturesPostMax: number;
 *   capturesPatchMax: number;
 *   apiGetMax: number;
 *   mediaGetMax: number;
 * }}
 */
export function loadApiSecurityConfig() {
  return {
    enabled: parseBool(process.env.RATE_LIMIT_ENABLED, true),
    trustProxy: parseBool(process.env.RATE_LIMIT_TRUST_PROXY, true),
    windowMs: parseIntEnv("RATE_LIMIT_WINDOW_MS", 60_000, {
      min: 1000,
      max: 3_600_000,
    }),
    whitelistIps: parseIpWhitelist(),
    /** Techo por IP en toda la API (red de seguridad). */
    globalMax: parseIntEnv("RATE_LIMIT_GLOBAL_MAX", 200, { min: 1 }),
    /** POST /api/history — ~1/s legítimo → 60/min; margen ~100. */
    historyPostMax: parseIntEnv("RATE_LIMIT_HISTORY_POST_MAX", 100, {
      min: 1,
    }),
    /** POST /api/captures — fotos automáticas, mucho menos frecuente. */
    capturesPostMax: parseIntEnv("RATE_LIMIT_CAPTURES_POST_MAX", 18, {
      min: 1,
    }),
    /** PATCH /api/captures/:id/processed — n8n u otros workers. */
    capturesPatchMax: parseIntEnv("RATE_LIMIT_CAPTURES_PATCH_MAX", 60, {
      min: 1,
    }),
    /** GET /api/history/* y GET /api/captures/*. */
    apiGetMax: parseIntEnv("RATE_LIMIT_API_GET_MAX", 120, { min: 1 }),
    /** GET /media/* — miniaturas y imágenes. */
    mediaGetMax: parseIntEnv("RATE_LIMIT_MEDIA_GET_MAX", 240, { min: 1 }),
  };
}

/**
 * @param {import('express').Request} req
 * @param {string[]} whitelistIps
 */
function isWhitelisted(req, whitelistIps) {
  if (!whitelistIps.length) return false;
  const ip = req.ip || req.socket?.remoteAddress || "";
  return whitelistIps.includes(ip);
}

/**
 * @param {ReturnType<typeof loadApiSecurityConfig>} config
 * @param {number} max
 * @param {string} message
 */
function createLimiter(config, max, message) {
  return rateLimit({
    windowMs: config.windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      !config.enabled || isWhitelisted(req, config.whitelistIps),
    handler: (_req, res, _next, options) => {
      const retryAfterSec = Math.ceil(options.windowMs / 1000);
      res.status(429).json({
        ok: false,
        error: message,
        retryAfter: retryAfterSec,
      });
    },
  });
}

/**
 * Crea los middlewares de rate limit según la configuración.
 * @param {ReturnType<typeof loadApiSecurityConfig>} [config]
 */
export function createApiSecurityLimiters(config = loadApiSecurityConfig()) {
  const noop = (_req, _res, next) => next();

  if (!config.enabled) {
    return {
      config,
      global: noop,
      historyPost: noop,
      capturesPost: noop,
      capturesPatch: noop,
      apiRead: noop,
      mediaRead: noop,
      routeByMethod: () => noop,
    };
  }

  const global = createLimiter(
    config,
    config.globalMax,
    "Demasiadas peticiones. Espera un momento e inténtalo de nuevo.",
  );

  const historyPost = createLimiter(
    config,
    config.historyPostMax,
    "Demasiados registros de historial. Reduce la frecuencia o espera.",
  );

  const capturesPost = createLimiter(
    config,
    config.capturesPostMax,
    "Demasiadas capturas de emoción. Espera antes de enviar otra foto.",
  );

  const capturesPatch = createLimiter(
    config,
    config.capturesPatchMax,
    "Demasiadas actualizaciones de capturas. Espera un momento.",
  );

  const apiRead = createLimiter(
    config,
    config.apiGetMax,
    "Demasiadas consultas a la API. Espera antes de seguir navegando.",
  );

  const mediaRead = createLimiter(
    config,
    config.mediaGetMax,
    "Demasiadas descargas de imágenes. Espera un momento.",
  );

  /**
   * @param {{ POST?: import('express').RequestHandler; GET?: import('express').RequestHandler; PATCH?: import('express').RequestHandler }} map
   */
  function routeByMethod(map) {
    return (req, res, next) => {
      const handler = map[req.method];
      if (handler) return handler(req, res, next);
      return next();
    };
  }

  return {
    config,
    global,
    historyPost,
    capturesPost,
    capturesPatch,
    apiRead,
    mediaRead,
    routeByMethod,
  };
}

/**
 * Prepara trust proxy, logging y middlewares por ruta (opción B).
 * @param {import('express').Express} app
 */
export function setupApiSecurity(app) {
  const limiters = createApiSecurityLimiters();
  const { config, global, historyPost, capturesPost, capturesPatch, apiRead, mediaRead, routeByMethod } =
    limiters;

  if (config.trustProxy) {
    app.set("trust proxy", 1);
  }

  if (!config.enabled) {
    console.log(
      "[apiSecurity] Rate limiting desactivado (RATE_LIMIT_ENABLED=false)",
    );
    return {
      config,
      globalMiddleware: (_req, _res, next) => next(),
      historyMiddleware: (_req, _res, next) => next(),
      capturesMiddleware: (_req, _res, next) => next(),
      mediaMiddleware: (_req, _res, next) => next(),
    };
  }

  console.log(
    `[apiSecurity] Rate limit activo — ventana ${config.windowMs}ms | ` +
      `global=${config.globalMax} historyPOST=${config.historyPostMax} ` +
      `capturesPOST=${config.capturesPostMax} capturesPATCH=${config.capturesPatchMax} ` +
      `apiGET=${config.apiGetMax} mediaGET=${config.mediaGetMax}`,
  );

  const globalMiddleware = (req, res, next) => {
    if (req.path === "/health") return next();
    return global(req, res, next);
  };

  return {
    config,
    globalMiddleware,
    historyMiddleware: routeByMethod({ POST: historyPost, GET: apiRead }),
    capturesMiddleware: routeByMethod({
      POST: capturesPost,
      PATCH: capturesPatch,
      GET: apiRead,
    }),
    mediaMiddleware: mediaRead,
  };
}
