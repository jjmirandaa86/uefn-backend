import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pingDatabase } from "../db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const router = express.Router();

/**
 * GET /health
 * Comprueba que la API responde y que MySQL está conectado.
 */
router.get("/health", async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: e.message,
    });
  }
});

/**
 * Sirve uploads y procesed bajo /media/* (p. ej. imageUrl de capturas); cache corta en imágenes.
 */
export function createMediaMiddleware() {
  return express.static(ROOT, {
    fallthrough: true,
    setHeaders(res, filePath) {
      if (/\.(png|jpe?g|webp|gif)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      }
    },
  });
}

/**
 * Manejador global de errores: responde JSON con status y mensaje.
 */
export function errorHandler(err, _req, res, _next) {
  console.error("[uefn-backend]", err);
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || "internal error",
  });
}

export default router;
