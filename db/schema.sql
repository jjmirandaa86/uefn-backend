CREATE DATABASE IF NOT EXISTS uefn
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE uefn;

CREATE TABLE IF NOT EXISTS emotion_captures (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_archivo VARCHAR(255) NOT NULL,
  emocion VARCHAR(64) NOT NULL,
  fecha_captura DATETIME(3) NOT NULL,
  capture_calendar_day CHAR(10) NOT NULL COMMENT 'YYYY-MM-DD en APP_TIMEZONE',
  estado_procesamiento VARCHAR(32) NOT NULL DEFAULT 'nuevo',
  nivel_confianza TINYINT UNSIGNED NULL,
  face_user VARCHAR(64) NOT NULL,
  face_match_threshold DECIMAL(4, 2) NOT NULL DEFAULT 0.60,
  ruta_almacenamiento VARCHAR(512) NOT NULL,
  ruta_absoluta VARCHAR(1024) NOT NULL,
  ruta_almacenamiento_divertida VARCHAR(512) NULL,
  ruta_absoluta_divertida VARCHAR(1024) NULL,
  mime_type VARCHAR(64) NOT NULL DEFAULT 'image/png',
  tamano_bytes INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modify_at DATETIME(3) NULL,
  UNIQUE KEY uq_user_emocion_day (face_user, emocion, capture_calendar_day),
  KEY idx_fecha_captura (fecha_captura),
  KEY idx_estado (estado_procesamiento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS emotion_recent_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  emocion VARCHAR(64) NOT NULL,
  nivel_confianza TINYINT UNSIGNED NULL,
  face_user VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_face_user_created (face_user, created_at),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
