#!/usr/bin/env bash
# Comprueba contenedores y GET /health dentro de uefn-backend.
set -euo pipefail

CONTAINER="${CONTAINER:-uefn-backend}"
NGINX_CONTAINER="${NGINX_CONTAINER:-nginx-proxy}"
API_DOMAIN="${API_DOMAIN:-playface-api.acertijo.dev}"
CHECK_PUBLIC="${CHECK_PUBLIC:-true}"

echo "=== Health check post-deploy ==="

echo "Contenedores:"
docker ps \
  --filter "name=${CONTAINER}" \
  --filter "name=${NGINX_CONTAINER}" \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "❌ Contenedor ${CONTAINER} no está en ejecución."
  exit 1
fi

echo ""
echo "Health local (dentro de ${CONTAINER}):"
docker exec "${CONTAINER}" node -e "
  import http from 'http';
  const port = process.env.API_PORT || 3000;
  http.get('http://127.0.0.1:' + port + '/health', (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log(body);
      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  }).on('error', (err) => {
    console.error(err);
    process.exit(1);
  });
"

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
