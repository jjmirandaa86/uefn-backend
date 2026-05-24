import pool from "../db/pool.js";
import { clampPagination } from "../utils/pagination.js";

/**
 * Busca captura del mismo usuario y emoción en el mismo día de negocio (APP_TIMEZONE).
 * @param {string} faceUser
 * @param {string} emocion
 * @param {string} captureCalendarDay YYYY-MM-DD en zona de la app
 */
export async function findCaptureByUserEmotionDay(
  faceUser,
  emocion,
  captureCalendarDay,
) {
  const [rows] = await pool.execute(
    `SELECT id, nombre_archivo, ruta_almacenamiento, fecha_captura, capture_calendar_day
     FROM emotion_captures
     WHERE face_user = :faceUser
       AND emocion = :emocion
       AND capture_calendar_day = :captureCalendarDay
     LIMIT 1`,
    { faceUser, emocion, captureCalendarDay },
  );
  return rows[0] ?? null;
}

/**
 * @param {{
 *   nombreArchivo: string;
 *   emocion: string;
 *   fechaCaptura: string;
 *   captureCalendarDay: string;
 *   estadoProcesamiento: string;
 *   nivelConfianza: number | null;
 *   faceUser: string;
 *   faceMatchThreshold: number;
 *   rutaAlmacenamiento: string;
 *   rutaAbsoluta: string;
 *   mimeType: string;
 *   tamanoBytes: number;
 * }} row
 */
export async function insertEmotionCapture(row) {
  const [result] = await pool.execute(
    `INSERT INTO emotion_captures (
      nombre_archivo, emocion, fecha_captura, capture_calendar_day,
      estado_procesamiento, nivel_confianza, face_user, face_match_threshold,
      ruta_almacenamiento, ruta_absoluta, mime_type, tamano_bytes
    ) VALUES (
      :nombreArchivo, :emocion, :fechaCaptura, :captureCalendarDay,
      :estadoProcesamiento, :nivelConfianza, :faceUser, :faceMatchThreshold,
      :rutaAlmacenamiento, :rutaAbsoluta, :mimeType, :tamanoBytes
    )`,
    {
      nombreArchivo: row.nombreArchivo,
      emocion: row.emocion,
      fechaCaptura: row.fechaCaptura,
      captureCalendarDay: row.captureCalendarDay,
      estadoProcesamiento: row.estadoProcesamiento,
      nivelConfianza: row.nivelConfianza,
      faceUser: row.faceUser,
      faceMatchThreshold: row.faceMatchThreshold,
      rutaAlmacenamiento: row.rutaAlmacenamiento,
      rutaAbsoluta: row.rutaAbsoluta,
      mimeType: row.mimeType,
      tamanoBytes: row.tamanoBytes,
    },
  );
  return result.insertId;
}

/**
 * @param {number | string} id
 */
export async function findCaptureById(id) {
  const [rows] = await pool.execute(
    `SELECT
       id,
       nombre_archivo,
       emocion,
       fecha_captura,
       estado_procesamiento,
       nivel_confianza,
       face_user,
       face_match_threshold,
       ruta_almacenamiento,
       ruta_absoluta,
       ruta_almacenamiento_divertida,
       ruta_absoluta_divertida,
       mime_type,
       tamano_bytes,
       created_at,
       modify_at
     FROM emotion_captures
     WHERE id = :id
     LIMIT 1`,
    { id: Number(id) },
  );
  return rows[0] ?? null;
}

/**
 * Actualiza rutas divertidas y/o estado tras procesar la foto.
 * @param {number | string} id
 * @param {{
 *   estadoProcesamiento?: string;
 *   rutaAlmacenamientoDivertida?: string;
 *   rutaAbsolutaDivertida?: string;
 *   modifyAt: string;
 * }} data
 */
export async function updateCaptureProcessed(id, data) {
  const sets = ["modify_at = :modifyAt"];
  const params = {
    id: Number(id),
    modifyAt: data.modifyAt,
  };

  if (data.estadoProcesamiento !== undefined) {
    sets.push("estado_procesamiento = :estadoProcesamiento");
    params.estadoProcesamiento = data.estadoProcesamiento;
  }
  if (data.rutaAlmacenamientoDivertida !== undefined) {
    sets.push("ruta_almacenamiento_divertida = :rutaAlmacenamientoDivertida");
    params.rutaAlmacenamientoDivertida = data.rutaAlmacenamientoDivertida;
  }
  if (data.rutaAbsolutaDivertida !== undefined) {
    sets.push("ruta_absoluta_divertida = :rutaAbsolutaDivertida");
    params.rutaAbsolutaDivertida = data.rutaAbsolutaDivertida;
  }

  if (sets.length === 1) {
    return false;
  }

  const [result] = await pool.execute(
    `UPDATE emotion_captures
     SET ${sets.join(", ")}
     WHERE id = :id`,
    params,
  );
  return result.affectedRows > 0;
}

const PROCESSED_ESTADO = process.env.PROCESSED_ESTADO?.trim() || "procesado";

export const NEW_ESTADO = process.env.NEW_ESTADO?.trim() || "nuevo";

const CAPTURE_ROW_SELECT = `
       id,
       nombre_archivo,
       emocion,
       fecha_captura,
       estado_procesamiento,
       nivel_confianza,
       face_user,
       face_match_threshold,
       ruta_almacenamiento,
       ruta_absoluta,
       ruta_almacenamiento_divertida,
       ruta_absoluta_divertida,
       mime_type,
       tamano_bytes,
       created_at,
       modify_at`;

const PROCESSED_LIST_SELECT = `
       id,
       nombre_archivo,
       emocion,
       fecha_captura,
       estado_procesamiento,
       nivel_confianza,
       face_user,
       ruta_almacenamiento,
       ruta_almacenamiento_divertida,
       ruta_absoluta_divertida,
       modify_at,
       mime_type`;

function appendFaceUserFilter(faceUser, params) {
  if (!faceUser) return "";
  params.faceUser = faceUser;
  return " AND face_user = :faceUser";
}

async function countCapturesByEstadoQuery({ faceUser, estado }) {
  const params = { estado };
  const userSql = appendFaceUserFilter(faceUser, params);

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM emotion_captures
     WHERE estado_procesamiento = :estado${userSql}`,
    params,
  );
  return Number(rows[0]?.total) || 0;
}

async function listCapturesByEstadoQuery({
  limit,
  offset,
  faceUser,
  estado,
  selectSql,
}) {
  const { safeLimit, safeOffset } = clampPagination(limit, offset);
  const params = { estado, safeOffset };
  const userSql = appendFaceUserFilter(faceUser, params);

  const [rows] = await pool.execute(
    `SELECT${selectSql}
     FROM emotion_captures
     WHERE estado_procesamiento = :estado${userSql}
     ORDER BY fecha_captura DESC, id DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params,
  );
  return rows;
}

/**
 * @param {{ faceUser?: string; estado?: string }} opts
 */
export async function countProcessedCaptures({
  faceUser,
  estado = PROCESSED_ESTADO,
} = {}) {
  return countCapturesByEstadoQuery({ faceUser, estado });
}

/**
 * Capturas procesadas, más recientes primero.
 * @param {{ limit?: number; offset?: number; faceUser?: string; estado?: string }} opts
 */
export async function listProcessedCaptures({
  limit,
  offset = 0,
  faceUser,
  estado = PROCESSED_ESTADO,
} = {}) {
  return listCapturesByEstadoQuery({
    limit,
    offset,
    faceUser,
    estado,
    selectSql: PROCESSED_LIST_SELECT,
  });
}

/**
 * @param {{ faceUser?: string; estado?: string }} opts
 */
export async function countCapturesByEstado({
  faceUser,
  estado = NEW_ESTADO,
} = {}) {
  return countCapturesByEstadoQuery({ faceUser, estado });
}

/**
 * Capturas por estado (p. ej. nuevo), fila completa, más recientes primero.
 * @param {{ limit?: number; offset?: number; faceUser?: string; estado?: string }} opts
 */
export async function listCapturesByEstado({
  limit,
  offset = 0,
  faceUser,
  estado = NEW_ESTADO,
} = {}) {
  return listCapturesByEstadoQuery({
    limit,
    offset,
    faceUser,
    estado,
    selectSql: CAPTURE_ROW_SELECT,
  });
}
