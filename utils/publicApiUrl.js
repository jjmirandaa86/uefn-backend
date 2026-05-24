/** Puerto HTTP del servidor (API_PORT). */
export function getApiPort() {
  const n = Number(process.env.API_PORT);
  return Number.isFinite(n) && n > 0 ? n : 3006;
}

/**
 * URL pública del backend: API_URL (protocolo + host, sin puerto) + API_PORT.
 * Ej.: API_URL=http://localhost + API_PORT=3006 → http://localhost:3006
 */
export function getPublicApiUrl() {
  const port = getApiPort();
  const raw = String(process.env.API_URL || "http://localhost")
    .trim()
    .replace(/\/$/, "");

  try {
    const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    u.port = String(port);
    return u.origin;
  } catch {
    return `http://localhost:${port}`;
  }
}
