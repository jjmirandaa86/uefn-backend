import pool from "../db/pool.js";
import { dayBoundsUtc, resolveAppCalendarDay, toMysqlDatetimeUtc } from "../utils/appTimezone.js";
import { clampLimit } from "../utils/pagination.js";

/**
 * @param {string} calendarDay YYYY-MM-DD
 * @param {string} [faceUser]
 */
function historyDayRangeParams(calendarDay, faceUser) {
  const { startUtc, endUtc } = dayBoundsUtc(calendarDay);
  const params = {
    startAt: toMysqlDatetimeUtc(startUtc),
    endAt: toMysqlDatetimeUtc(endUtc),
  };
  let userSql = "";
  if (faceUser) {
    userSql = " AND face_user = :faceUser";
    params.faceUser = faceUser;
  }
  return { userSql, params };
}

/**
 * @param {{
 *   emocion: string;
 *   nivelConfianza: number | null;
 *   faceUser: string;
 * }} row
 */
export async function insertRecentHistory(row) {
  const [result] = await pool.execute(
    `INSERT INTO emotion_recent_history (emocion, nivel_confianza, face_user)
     VALUES (:emocion, :nivelConfianza, :faceUser)`,
    {
      emocion: row.emocion,
      nivelConfianza: row.nivelConfianza,
      faceUser: row.faceUser,
    },
  );
  return result.insertId;
}

/**
 * @param {{ faceUser?: string; limit?: number }} opts
 */
export async function listRecentHistory({ faceUser, limit } = {}) {
  const safeLimit = clampLimit(limit);

  if (faceUser) {
    const [rows] = await pool.execute(
      `SELECT id, emocion, nivel_confianza, face_user, created_at
       FROM emotion_recent_history
       WHERE face_user = :faceUser
       ORDER BY created_at DESC, id DESC
       LIMIT ${safeLimit}`,
      { faceUser },
    );
    return rows;
  }

  const [rows] = await pool.query(
    `SELECT id, emocion, nivel_confianza, face_user, created_at
     FROM emotion_recent_history
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
  );
  return rows;
}

/**
 * Resumen del día (por DATE(created_at)).
 * @param {{ date?: string; faceUser?: string }} [opts] date = YYYY-MM-DD
 */
export async function getHistorySummaryForDate({ date, faceUser } = {}) {
  const day = resolveAppCalendarDay(date);
  const { userSql, params } = historyDayRangeParams(day, faceUser);

  const [statsRows] = await pool.execute(
    `SELECT
       COUNT(*) AS total,
       ROUND(AVG(nivel_confianza)) AS avgConfidence,
       MAX(created_at) AS lastAt
     FROM emotion_recent_history
     WHERE created_at >= :startAt AND created_at < :endAt${userSql}`,
    params,
  );

  const [dominantRows] = await pool.execute(
    `SELECT emocion, COUNT(*) AS cnt
     FROM emotion_recent_history
     WHERE created_at >= :startAt AND created_at < :endAt${userSql}
     GROUP BY emocion
     ORDER BY cnt DESC, emocion ASC
     LIMIT 1`,
    params,
  );

  const stats = statsRows[0] ?? {};
  const dominant = dominantRows[0] ?? null;

  return {
    date: day,
    total: Number(stats.total) || 0,
    avgConfidence:
      stats.avgConfidence != null ? Number(stats.avgConfidence) : null,
    lastAt: stats.lastAt ?? null,
    dominantEmotion: dominant?.emocion ?? null,
  };
}

/**
 * Conteo por emoción en un día (DATE(created_at)).
 * @param {{ date?: string; faceUser?: string }} [opts]
 */
export async function getTodayEmotionCounts({ date, faceUser } = {}) {
  const day = resolveAppCalendarDay(date);
  const { userSql, params } = historyDayRangeParams(day, faceUser);

  const [totalRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM emotion_recent_history
     WHERE created_at >= :startAt AND created_at < :endAt${userSql}`,
    params,
  );

  const [rows] = await pool.execute(
    `SELECT emocion, COUNT(*) AS cnt
     FROM emotion_recent_history
     WHERE created_at >= :startAt AND created_at < :endAt${userSql}
     GROUP BY emocion
     ORDER BY cnt DESC, emocion ASC`,
    params,
  );

  return {
    date: day,
    total: Number(totalRows[0]?.total) || 0,
    byEmotion: rows.map((row) => ({
      emocion: row.emocion,
      count: Number(row.cnt) || 0,
    })),
  };
}

/**
 * Estadísticas globales de emotion_recent_history (todos los registros).
 */
export async function getEmotionHistoryStats() {
  const [totalRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM emotion_recent_history`,
  );
  const total = Number(totalRows[0]?.total) || 0;

  const [rows] = await pool.query(
    `SELECT
       emocion,
       COUNT(*) AS cnt,
       ROUND(AVG(nivel_confianza)) AS avgConfidence,
       MIN(created_at) AS firstAt,
       MAX(created_at) AS lastAt
     FROM emotion_recent_history
     GROUP BY emocion
     ORDER BY cnt DESC, emocion ASC`,
  );

  return {
    total,
    byEmotion: rows.map((row) => ({
      emocion: row.emocion,
      count: Number(row.cnt) || 0,
      avgConfidence:
        row.avgConfidence != null ? Number(row.avgConfidence) : null,
      firstAt: row.firstAt ?? null,
      lastAt: row.lastAt ?? null,
    })),
  };
}

export async function findRecentHistoryById(id) {
  const [rows] = await pool.execute(
    `SELECT id, emocion, nivel_confianza, face_user, created_at
     FROM emotion_recent_history
     WHERE id = :id
     LIMIT 1`,
    { id: Number(id) },
  );
  return rows[0] ?? null;
}
