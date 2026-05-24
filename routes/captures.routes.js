import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  countCapturesByEstado,
  countProcessedCaptures,
  findCaptureById,
  findCaptureByUserEmotionDay,
  insertEmotionCapture,
  listCapturesByEstado,
  listProcessedCaptures,
  NEW_ESTADO,
  updateCaptureProcessed,
} from "../repositories/captures.repository.js";
import {
  capturePhotoUpload,
  mapCaptureResponse,
  normalizeConfidence,
  normalizeFaceUser,
  parseCaptureId,
  toMysqlDatetimeUtc,
} from "../utils/captureHelpers.js";
import {
  calendarDayInAppTz,
  dateFolderFromCapture,
} from "../utils/appTimezone.js";
import { clampLimit, clampOffset } from "../utils/pagination.js";
import { resolveProcessedRelativePath } from "../utils/processedImages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const UPLOADS_DIR = path.resolve(ROOT, process.env.UPLOADS_DIR || "uploads");
const PROCESSED_DIR = process.env.PROCESSED_DIR || "procesed";
const router = express.Router();

/**
 * GET /api/captures/processed?limit=20&offset=0&faceUser=face-0001
 * Lista capturas con estado procesado para miniaturas (momentos divertidos).
 */
router.get("/processed", async (req, res, next) => {
  try {
    const limit = clampLimit(req.query.limit);
    const offset = clampOffset(req.query.offset);
    const faceUser = req.query.faceUser
      ? normalizeFaceUser(req.query.faceUser)
      : undefined;

    const [rows, total] = await Promise.all([
      listProcessedCaptures({ limit, offset, faceUser }),
      countProcessedCaptures({ faceUser }),
    ]);

    const items = [];
    for (const row of rows) {
      const relativePath = await resolveProcessedRelativePath(
        ROOT,
        PROCESSED_DIR,
        row,
      );
      if (!relativePath) continue;

      items.push({
        ...mapCaptureResponse(row, relativePath),
        rutaAlmacenamiento: relativePath,
      });
    }

    res.json({
      ok: true,
      items,
      pagination: {
        limit,
        offset,
        total,
        count: items.length,
        hasNewer: offset > 0,
        hasOlder: offset + limit < total,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/captures/new?limit=20&offset=0&faceUser=face-0001
 * Lista capturas con estado_procesamiento = nuevo (fila completa en JSON).
 */
router.get("/new", async (req, res, next) => {
  try {
    const limit = clampLimit(req.query.limit);
    const offset = clampOffset(req.query.offset);
    const faceUser = req.query.faceUser
      ? normalizeFaceUser(req.query.faceUser)
      : undefined;

    const [rows, total] = await Promise.all([
      listCapturesByEstado({ limit, offset, faceUser, estado: NEW_ESTADO }),
      countCapturesByEstado({ faceUser, estado: NEW_ESTADO }),
    ]);

    const items = rows.map((row) => {
      const rel = row.ruta_almacenamiento
        ? String(row.ruta_almacenamiento).replace(/\\/g, "/")
        : null;
      return mapCaptureResponse(row, rel);
    });

    res.json({
      ok: true,
      estado: NEW_ESTADO,
      items,
      pagination: {
        limit,
        offset,
        total,
        count: items.length,
        hasNewer: offset > 0,
        hasOlder: offset + limit < total,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/captures/:id
 * Detalle de una captura (incluye rutas divertidas y modify_at).
 */
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseCaptureId(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, error: "id inválido" });
      return;
    }

    const row = await findCaptureById(id);
    if (!row) {
      res.status(404).json({ ok: false, error: "Captura no encontrada" });
      return;
    }

    const relativePath = await resolveProcessedRelativePath(
      ROOT,
      PROCESSED_DIR,
      row,
    );

    res.json({
      ok: true,
      capture: mapCaptureResponse(row, relativePath),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH /api/captures/:id/processed
 * Body JSON: {
 *   estadoProcesamiento?,
 *   rutaAlmacenamientoDivertida?,
 *   rutaAbsolutaDivertida?
 * }
 * Actualiza rutas de foto procesada y modify_at.
 */
router.patch("/:id/processed", async (req, res, next) => {
  try {
    const id = parseCaptureId(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, error: "id inválido" });
      return;
    }

    const existing = await findCaptureById(id);
    if (!existing) {
      res.status(404).json({ ok: false, error: "Captura no encontrada" });
      return;
    }

    const body = req.body ?? {};
    const estadoProcesamiento =
      body.estadoProcesamiento !== undefined
        ? String(body.estadoProcesamiento).trim().slice(0, 32)
        : undefined;

    let rutaAlmacenamientoDivertida =
      body.rutaAlmacenamientoDivertida !== undefined
        ? String(body.rutaAlmacenamientoDivertida)
            .trim()
            .replace(/\\/g, "/")
            .slice(0, 512)
        : undefined;

    let rutaAbsolutaDivertida =
      body.rutaAbsolutaDivertida !== undefined
        ? String(body.rutaAbsolutaDivertida).trim().slice(0, 1024)
        : undefined;

    if (rutaAlmacenamientoDivertida && rutaAbsolutaDivertida === undefined) {
      rutaAbsolutaDivertida = path.resolve(ROOT, rutaAlmacenamientoDivertida);
    }

    if (
      estadoProcesamiento === undefined &&
      rutaAlmacenamientoDivertida === undefined &&
      rutaAbsolutaDivertida === undefined
    ) {
      res.status(400).json({
        ok: false,
        error:
          "Indica al menos uno: estadoProcesamiento, rutaAlmacenamientoDivertida, rutaAbsolutaDivertida",
      });
      return;
    }

    const updated = await updateCaptureProcessed(id, {
      estadoProcesamiento,
      rutaAlmacenamientoDivertida,
      rutaAbsolutaDivertida,
      modifyAt: toMysqlDatetimeUtc(new Date().toISOString()),
    });

    if (!updated) {
      res
        .status(400)
        .json({ ok: false, error: "No se pudo actualizar la captura" });
      return;
    }

    const row = await findCaptureById(id);
    const relativePath = await resolveProcessedRelativePath(
      ROOT,
      PROCESSED_DIR,
      row,
    );

    res.json({
      ok: true,
      capture: mapCaptureResponse(row, relativePath),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/captures
 * multipart/form-data: metadata (JSON string), photo (image file)
 */
router.post("/", capturePhotoUpload, async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "Falta el archivo photo" });
      return;
    }

    let metadata = {};
    try {
      metadata =
        typeof req.body.metadata === "string"
          ? JSON.parse(req.body.metadata)
          : (req.body.metadata ?? {});
    } catch {
      res.status(400).json({ ok: false, error: "metadata JSON inválido" });
      return;
    }

    const nombreArchivo = metadata.nombreArchivo || `capture-${Date.now()}.png`;
    const emocion = metadata.emocion ?? "desconocida";
    const faceUser = metadata.user ?? "unknown";
    const fechaCaptura = metadata.fechaCaptura || new Date().toISOString();
    const fechaCapturaDb = toMysqlDatetimeUtc(fechaCaptura);
    const captureCalendarDay = calendarDayInAppTz(fechaCaptura);
    const estadoProcesamiento = NEW_ESTADO;
    const nivelConfianza = normalizeConfidence(metadata.nivelConfianza);
    const faceMatchThreshold = Number(metadata.faceMatchThreshold ?? 0.6);

    const existing = await findCaptureByUserEmotionDay(
      faceUser,
      emocion,
      captureCalendarDay,
    );

    if (existing) {
      res.status(200).json({
        ok: true,
        skipped: true,
        message: "Ya existe captura para este usuario y emoción hoy",
        id: existing.id,
        metadata: {
          nombreArchivo: existing.nombre_archivo,
          emocion,
          user: faceUser,
          rutaAlmacenamiento: existing.ruta_almacenamiento,
        },
      });
      return;
    }

    const folder = dateFolderFromCapture(captureCalendarDay);
    const dir = path.join(UPLOADS_DIR, folder);
    await fs.mkdir(dir, { recursive: true });

    const photoPath = path.join(dir, nombreArchivo);
    const rutaAlmacenamiento = path.relative(ROOT, photoPath);
    const rutaAbsoluta = photoPath;

    const record = {
      nombreArchivo,
      emocion,
      fechaCaptura: fechaCapturaDb,
      captureCalendarDay,
      estadoProcesamiento,
      nivelConfianza,
      faceUser,
      faceMatchThreshold: Number.isFinite(faceMatchThreshold)
        ? faceMatchThreshold
        : 0.6,
      rutaAlmacenamiento,
      rutaAbsoluta,
      mimeType: req.file.mimetype || "image/png",
      tamanoBytes: req.file.size,
    };

    await fs.writeFile(photoPath, req.file.buffer);

    let id;
    try {
      id = await insertEmotionCapture(record);
    } catch (insertErr) {
      await fs.unlink(photoPath).catch(() => {});
      if (insertErr?.code === "ER_DUP_ENTRY") {
        const duplicate = await findCaptureByUserEmotionDay(
          faceUser,
          emocion,
          captureCalendarDay,
        );
        res.status(200).json({
          ok: true,
          skipped: true,
          message: "Captura duplicada",
          id: duplicate?.id,
        });
        return;
      }
      throw insertErr;
    }

    res.status(201).json({
      ok: true,
      skipped: false,
      id,
      capture: {
        id,
        nombreArchivo: record.nombreArchivo,
        emocion: record.emocion,
        fechaCaptura: metadata.fechaCaptura,
        captureCalendarDay: record.captureCalendarDay,
        estadoProcesamiento: record.estadoProcesamiento,
        nivelConfianza: record.nivelConfianza,
        user: record.faceUser,
        faceMatchThreshold: record.faceMatchThreshold,
        rutaAlmacenamiento,
        rutaAbsoluta,
        tamanoBytes: record.tamanoBytes,
      },
    });
  } catch (e) {
    next(e);
  }
});

export default router;
