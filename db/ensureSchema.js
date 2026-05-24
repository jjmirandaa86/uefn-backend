import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function dropColumnIfExists(conn, db, column) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'emotion_captures' AND COLUMN_NAME = ?`,
    [db, column],
  );
  if (cols.length > 0) {
    await conn.query(
      `ALTER TABLE \`${db}\`.emotion_captures DROP COLUMN \`${column}\``,
    );
  }
}

async function addColumnIfNotExists(conn, db, column, definition) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'emotion_captures' AND COLUMN_NAME = ?`,
    [db, column],
  );
  if (cols.length === 0) {
    await conn.query(
      `ALTER TABLE \`${db}\`.emotion_captures ADD COLUMN ${definition}`,
    );
  }
}

/**
 * Índice legacy: (face_user, emocion) — bloqueaba una sola captura por emoción.
 * Índice correcto: (face_user, emocion, día de fecha_captura).
 */
async function ensureCaptureCalendarDayColumn(conn, db) {
  await addColumnIfNotExists(
    conn,
    db,
    "capture_calendar_day",
    "`capture_calendar_day` CHAR(10) NULL COMMENT 'YYYY-MM-DD APP_TIMEZONE' AFTER `fecha_captura`",
  );

  const tz = process.env.APP_TIMEZONE || "Australia/Sydney";
  await conn.query(
    `UPDATE \`${db}\`.emotion_captures
     SET capture_calendar_day = DATE_FORMAT(
       CONVERT_TZ(fecha_captura, '+00:00', ?),
       '%Y-%m-%d'
     )
     WHERE capture_calendar_day IS NULL OR capture_calendar_day = ''`,
    [tz],
  );
}

async function ensureUserEmotionDayUniqueIndex(conn, db) {
  const [indexes] = await conn.query(
    `SHOW INDEX FROM \`${db}\`.emotion_captures WHERE Key_name = 'uq_user_emocion_day'`,
  );

  if (indexes.length > 0) {
    const columnNames = [...new Set(indexes.map((row) => row.Column_name))];
    const usesCalendarDay = columnNames.includes("capture_calendar_day");
    if (!usesCalendarDay) {
      await conn.query(
        `ALTER TABLE \`${db}\`.emotion_captures DROP INDEX uq_user_emocion_day`,
      );
    } else {
      return;
    }
  }

  await conn.query(
    `ALTER TABLE \`${db}\`.emotion_captures
     ADD UNIQUE KEY uq_user_emocion_day (face_user, emocion, capture_calendar_day)`,
  );
}

/**
 * Crea la BD/tabla si no existen y aplica migraciones ligeras.
 */
export async function ensureSchema() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  const db = process.env.DB_NAME || "uefn";

  try {
    await conn.query(sql);
    await dropColumnIfExists(conn, db, "metadata_json");
    await dropColumnIfExists(conn, db, "capture_date");
    await addColumnIfNotExists(
      conn,
      db,
      "ruta_almacenamiento_divertida",
      "`ruta_almacenamiento_divertida` VARCHAR(512) NULL AFTER `ruta_absoluta`",
    );
    await addColumnIfNotExists(
      conn,
      db,
      "ruta_absoluta_divertida",
      "`ruta_absoluta_divertida` VARCHAR(1024) NULL AFTER `ruta_almacenamiento_divertida`",
    );
    await addColumnIfNotExists(
      conn,
      db,
      "modify_at",
      "`modify_at` DATETIME(3) NULL AFTER `created_at`",
    );
    await ensureCaptureCalendarDayColumn(conn, db);
    await ensureUserEmotionDayUniqueIndex(conn, db);
  } finally {
    await conn.end();
  }
}
