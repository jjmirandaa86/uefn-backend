#!/usr/bin/env bash
# Ejecuta npm run db:init una sola vez cuando el contenedor uefn-backend ya está arriba.
set -euo pipefail

MARKER=/app/projects/uefn-backend/.db_initialized
CONTAINER=uefn-backend
MAX_ATTEMPTS=30
SLEEP_SEC=3

echo "=== Comprobando MySQL y schema (db:init) ==="

if [ -f "${MARKER}" ]; then
  echo "Schema ya inicializado (${MARKER} existe). Omitiendo db:init."
  exit 0
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "❌ Contenedor ${CONTAINER} no está en ejecución."
  exit 1
fi

echo "Esperando conexión a MySQL desde ${CONTAINER}..."
ready=0
for i in $(seq 1 "${MAX_ATTEMPTS}"); do
  if docker exec "${CONTAINER}" node -e "
    import('./db/pool.js').then(async (m) => {
      await m.pingDatabase();
      console.log('mysql-ok');
    });
  " 2>/dev/null | grep -q mysql-ok; then
    ready=1
    break
  fi
  echo "  intento ${i}/${MAX_ATTEMPTS}..."
  sleep "${SLEEP_SEC}"
done

if [ "${ready}" -ne 1 ]; then
  echo "❌ MySQL no respondió a tiempo. Revisa DB_* en uefn-backend.env y el contenedor mysql."
  exit 1
fi

echo "Ejecutando db:init (primera vez)..."
docker exec "${CONTAINER}" npm run db:init
mkdir -p /app/projects/uefn-backend
touch "${MARKER}"
echo "✅ Schema inicializado y marcador creado."
