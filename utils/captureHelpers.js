import multer from "multer";
import { toMysqlDatetimeUtc } from "./appTimezone.js";
import { getPublicApiUrl } from "./publicApiUrl.js";

export function normalizeFaceUser(value, fallback = undefined) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 64);
  return normalized || fallback;
}

export function normalizeConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(1, Math.round(n)));
}

export function normalizeEmotion(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 64);
}

export function parseCaptureId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

export function mapCaptureResponse(row, relativePath) {
  const rel =
    relativePath ??
    row.ruta_almacenamiento_divertida ??
    row.ruta_almacenamiento;
  const relNorm = rel ? String(rel).replace(/\\/g, "/") : null;

  return {
    id: row.id,
    nombreArchivo: row.nombre_archivo,
    emocion: row.emocion,
    fechaCaptura: row.fecha_captura,
    estadoProcesamiento: row.estado_procesamiento,
    nivelConfianza: row.nivel_confianza,
    faceUser: row.face_user,
    faceMatchThreshold: row.face_match_threshold,
    rutaAlmacenamiento: row.ruta_almacenamiento,
    rutaAbsoluta: row.ruta_absoluta,
    rutaAlmacenamientoDivertida: row.ruta_almacenamiento_divertida,
    rutaAbsolutaDivertida: row.ruta_absoluta_divertida,
    mimeType: row.mime_type,
    tamanoBytes: row.tamano_bytes,
    createdAt: row.created_at,
    modifyAt: row.modify_at,
    imageUrl: relNorm ? `${getPublicApiUrl()}/media/${relNorm}` : null,
  };
}

/** @deprecated Usar toMysqlDatetimeUtc desde appTimezone.js */
export function toMysqlDatetime(iso) {
  return toMysqlDatetimeUtc(iso);
}

export { toMysqlDatetimeUtc };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      cb(new Error("Solo se permiten imágenes"));
      return;
    }
    cb(null, true);
  },
});

export const capturePhotoUpload = upload.single("photo");
