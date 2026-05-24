#!/usr/bin/env bash
# Ejecuta npm run db:init una sola vez cuando el contenedor uefn-backend ya está arriba.
set -euo pipefail

MARKER=/app/projects/uefn-backend/.db_initialized
CONTAINER=uefn-backend
MAX_ATTEMPTS=15
SLEEP_SEC=2
EXEC_TIMEOUT_SEC=12

echo "=== Comprobando MySQL y schema (db:init) ==="

if [ -f "${MARKER}" ]; then
  echo "Schema ya inicializado (${MARKER} existe). Omitiendo db:init."
  exit 0
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "❌ Contenedor ${CONTAINER} no está en ejecución."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "mysql"; then
  echo "❌ Contenedor mysql no está en ejecución."
  docker ps --format 'table {{.Names}}\t{{.Status}}'
  exit 1
fi

echo "DB_HOST en ${CONTAINER}:"
docker exec "${CONTAINER}" printenv DB_HOST DB_PORT DB_USER DB_NAME 2>/dev/null || true

mysql_ping_from_backend() {
  timeout "${EXEC_TIMEOUT_SEC}" docker exec "${CONTAINER}" node --input-type=module -e "
    import mysql from 'mysql2/promise';
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'mysql',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      connectTimeout: 8000,
    });
    await conn.ping();
    await conn.end();
    console.log('mysql-ok');
  " 2>&1
}

echo "Esperando conexión a MySQL desde ${CONTAINER} (máx. $((MAX_ATTEMPTS * SLEEP_SEC))s)..."
ready=0
last_err=""
for i in $(seq 1 "${MAX_ATTEMPTS}"); do
  out="$(mysql_ping_from_backend || true)"
  if echo "${out}" | grep -q mysql-ok; then
    ready=1
    break
  fi
  last_err="${out}"
  echo "  intento ${i}/${MAX_ATTEMPTS}..."
  sleep "${SLEEP_SEC}"
done

if [ "${ready}" -ne 1 ]; then
  echo "❌ MySQL no respondió a tiempo."
  echo "Último error:"
  echo "${last_err:-sin salida}"
  echo "--- logs mysql (últimas 15 líneas) ---"
  docker logs --tail 15 mysql 2>&1 || true
  exit 1
fi

echo "Ejecutando db:init (primera vez)..."
timeout 120 docker exec "${CONTAINER}" npm run db:init
mkdir -p /app/projects/uefn-backend
touch "${MARKER}"
echo "✅ Schema inicializado y marcador creado."
