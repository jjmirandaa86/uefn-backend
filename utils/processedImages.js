import fs from "node:fs/promises";
import path from "node:path";
import { dateFolderFromCapture } from "./dateFolders.js";

/**
 * @param {string} root
 * @param {string} relative
 */
async function fileExists(root, relative) {
  try {
    await fs.access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

/**
 * Resuelve la ruta relativa al proyecto de una imagen procesada.
 * Soporta: {processedDir}/{fecha}/imagenes/{archivo} y {processedDir}/{fecha}/{archivo}.
 *
 * @param {string} root
 * @param {string} processedDir
 * @param {{
 *   nombre_archivo: string;
 *   fecha_captura: string | Date;
 *   ruta_almacenamiento?: string | null;
 * }} record
 * @returns {Promise<string | null>}
 */
export async function resolveProcessedRelativePath(root, processedDir, record) {
  const divertida = String(record.ruta_almacenamiento_divertida ?? "")
    .trim()
    .replace(/\\/g, "/");

  if (divertida && (await fileExists(root, divertida))) {
    return divertida;
  }

  const stored = String(record.ruta_almacenamiento ?? "")
    .trim()
    .replace(/\\/g, "/");

  if (stored) {
    const lowered = stored.toLowerCase();
    if (
      lowered.includes("processed/") ||
      lowered.includes("procesed/") ||
      lowered.startsWith(`${processedDir.toLowerCase()}/`)
    ) {
      if (await fileExists(root, stored)) return stored;
    }
  }

  const dateFolder = dateFolderFromCapture(record.fecha_captura);
  const fileName = record.nombre_archivo;

  const candidates = [
    `${processedDir}/${dateFolder}/imagenes/${fileName}`,
    `${processedDir}/${dateFolder}/${fileName}`,
    `processed/${dateFolder}/imagenes/${fileName}`,
    `processed/${dateFolder}/${fileName}`,
    `procesed/${dateFolder}/imagenes/${fileName}`,
    `procesed/${dateFolder}/${fileName}`,
  ];

  for (const rel of candidates) {
    if (await fileExists(root, rel)) return rel;
  }

  return null;
}
