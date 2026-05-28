#!/usr/bin/env bash
# Comprueba contenedores y GET /health dentro de uefn-backend.
set -euo pipefail

CONTAINER="${CONTAINER:-uefn-backend}"
NGINX_CONTAINER="${NGINX_CONTAINER:-nginx-proxy}"
API_DOMAIN="${API_DOMAIN:-playface-api.acertijo.dev}"
CHECK_PUBLIC="${CHECK_PUBLIC:-true}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"
SLEEP_SEC="${SLEEP_SEC:-2}"

echo "=== Health check post-deploy ==="

echo "Contenedores:"
docker ps \
  --filter "name=${CONTAINER}" \
  --filter "name=${NGINX_CONTAINER}" \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

if ! docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "❌ Contenedor ${CONTAINER} no existe."
  exit 1
fi

container_status="$(docker inspect -f '{{.State.Status}}' "${CONTAINER}" 2>/dev/null || echo missing)"
if [ "${container_status}" = "restarting" ] || [ "${container_status}" = "exited" ]; then
  echo "❌ Contenedor ${CONTAINER} en estado: ${container_status}"
  echo "--- logs ${CONTAINER} (últimas 40 líneas) ---"
  docker logs --tail 40 "${CONTAINER}" 2>&1 || true
  exit 1
fi

echo ""
echo "DB_HOST en ${CONTAINER}:"
docker exec "${CONTAINER}" printenv DB_HOST DB_PORT DB_USER DB_NAME API_PORT 2>/dev/null || true

echo ""
echo "Health local (dentro de ${CONTAINER}):"
ready=0
last_err=""
for i in $(seq 1 "${MAX_ATTEMPTS}"); do
  status="$(docker inspect -f '{{.State.Status}}' "${CONTAINER}" 2>/dev/null || echo missing)"
  if [ "${status}" != "running" ]; then
    last_err="contenedor en estado ${status}"
    echo "  intento ${i}/${MAX_ATTEMPTS}: ${last_err}"
    sleep "${SLEEP_SEC}"
    continue
  fi

  out="$(docker exec "${CONTAINER}" node --input-type=module -e "
    import http from 'http';
    const port = Number(process.env.API_PORT) || 3000;
    http.get('http://127.0.0.1:' + port + '/health', (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        console.log(body);
        process.exit(res.statusCode === 200 ? 0 : 1);
      });
    }).on('error', (err) => {
      console.error(err.message);
      process.exit(1);
    });
  " 2>&1)" && {
    echo "${out}"
    ready=1
    break
  }
  last_err="${out}"
  echo "  intento ${i}/${MAX_ATTEMPTS}..."
  sleep "${SLEEP_SEC}"
done

if [ "${ready}" -ne 1 ]; then
  echo "❌ Health local no respondió a tiempo."
  echo "Último error:"
  echo "${last_err:-sin salida}"
  echo "--- logs ${CONTAINER} (últimas 40 líneas) ---"
  docker logs --tail 40 "${CONTAINER}" 2>&1 || true
  exit 1
fi

if [ "${CHECK_PUBLIC}" = "true" ] && docker ps --format '{{.Names}}' | grep -qx "${NGINX_CONTAINER}"; then
  echo ""
  echo "Health público (https://${API_DOMAIN}/health):"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "https://${API_DOMAIN}/health" && echo ""
  else
    echo "⚠️  curl no instalado en el host; omitiendo comprobación HTTPS."
  fi
fi

echo ""
echo "✅ Deploy backend completado"
