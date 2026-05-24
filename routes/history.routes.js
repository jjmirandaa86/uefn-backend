import express from "express";
import {
  findRecentHistoryById,
  getEmotionHistoryStats,
  getHistorySummaryForDate,
  getTodayEmotionCounts,
  insertRecentHistory,
  listRecentHistory,
} from "../repositories/history.repository.js";
import {
  normalizeConfidence,
  normalizeEmotion,
  normalizeFaceUser,
} from "../utils/captureHelpers.js";

const router = express.Router();

/**
 * POST /api/history
 * Body JSON: { emocion, nivelConfianza, faceUser }
 * Registra una detección de emoción en el historial reciente.
 */
router.post("/", async (req, res, next) => {
  try {
    const emocion = normalizeEmotion(req.body.emocion);
    const faceUser = normalizeFaceUser(
      req.body.faceUser ?? req.body.user,
      "unknown",
    );

    if (!emocion) {
      res.status(400).json({ ok: false, error: "emocion es requerida" });
      return;
    }

    const nivelConfianza = normalizeConfidence(req.body.nivelConfianza);

    const id = await insertRecentHistory({
      emocion,
      nivelConfianza,
      faceUser,
    });

    const row = await findRecentHistoryById(id);

    res.status(201).json({
      ok: true,
      history: {
        id: row.id,
        emocion: row.emocion,
        nivelConfianza: row.nivel_confianza,
        faceUser: row.face_user,
        createdAt: row.created_at,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/history/stats
 * Devuelve totales, conteos por emoción y promedios de confianza de todo el historial.
 */
router.get("/stats", async (req, res, next) => {
  try {
    const stats = await getEmotionHistoryStats();

    res.json({
      ok: true,
      total: stats.total,
      byEmotion: stats.byEmotion.map((row) => ({
        emocion: row.emocion,
        count: row.count,
        avgConfidence: row.avgConfidence,
        sharePercent:
          stats.total > 0
            ? Math.round((row.count / stats.total) * 1000) / 10
            : 0,
        firstAt: row.firstAt,
        lastAt: row.lastAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/history/summary/today?date=YYYY-MM-DD&faceUser=face-0001
 * Resumen del día: detecciones, emoción dominante, confianza promedio y última detección.
 */
router.get("/summary/today", async (req, res, next) => {
  try {
    const date =
      typeof req.query.date === "string" ? req.query.date.trim() : undefined;
    const faceUser = req.query.faceUser
      ? normalizeFaceUser(req.query.faceUser)
      : undefined;

    const summary = await getHistorySummaryForDate({ date, faceUser });

    res.json({
      ok: true,
      summary: {
        date: summary.date,
        deteccionesHoy: summary.total,
        emocionDominante: summary.dominantEmotion,
        promedioConfianza: summary.avgConfidence,
        ultimaDeteccion: summary.lastAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/history/today/by-emotion?date=YYYY-MM-DD&faceUser=face-0001
 * Conteo y porcentaje de cada emoción detectada en el día indicado (hoy por defecto).
 */
router.get("/today/by-emotion", async (req, res, next) => {
  try {
    const date =
      typeof req.query.date === "string" ? req.query.date.trim() : undefined;
    const faceUser = req.query.faceUser
      ? normalizeFaceUser(req.query.faceUser)
      : undefined;

    const data = await getTodayEmotionCounts({ date, faceUser });

    res.json({
      ok: true,
      date: data.date,
      total: data.total,
      byEmotion: data.byEmotion.map((row) => ({
        emocion: row.emocion,
        count: row.count,
        sharePercent:
          data.total > 0
            ? Math.round((row.count / data.total) * 1000) / 10
            : 0,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/history/recent?faceUser=face-0001&limit=30
 * Lista las últimas detecciones, opcionalmente filtradas por usuario y límite.
 */
router.get("/recent", async (req, res, next) => {
  try {
    const faceUser = req.query.faceUser
      ? normalizeFaceUser(req.query.faceUser)
      : undefined;
    const limit = req.query.limit;

    const rows = await listRecentHistory({ faceUser, limit });

    res.json({
      ok: true,
      items: rows.map((row) => ({
        id: row.id,
        emocion: row.emocion,
        nivelConfianza: row.nivel_confianza,
        faceUser: row.face_user,
        createdAt: row.created_at,
      })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
