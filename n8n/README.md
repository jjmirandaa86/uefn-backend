# n8n — Procesar capturas de emoción

## Importar

1. Abre **https://n8n.acertijo.dev** → **Workflows** → **Import from File**
2. Archivo: `uefn-process-emotion-captures.json`

## URLs (nodo Config)

| Variable | Producción |
|----------|------------|
| `backendUrl` | `https://playface-api.acertijo.dev` |
| `frontendUrl` | `https://playface.acertijo.dev` |
| `n8nUrl` | `https://n8n.acertijo.dev` |
| `backendRoot` | `/app/projects/uefn-backend` (ruta en el servidor para guardar `procesed/`) |

En local, cambia `backendRoot` a tu carpeta del repo `uefn-backend`.

## Antes de ejecutar

| Paso | Acción |
|------|--------|
| 1 | Backend accesible en `backendUrl` |
| 2 | Credencial **OpenAI API** en el nodo **OpenAI caricatura** |
| 3 | n8n debe poder escribir en `backendRoot/procesed/` (mismo volumen que `uefn-backend` en el droplet) |
| 4 | IP de n8n en `RATE_LIMIT_WHITELIST_IPS` del backend (si aplica rate limit) |

## Flujo

```
GET /api/captures/new (paginado, estado_procesamiento = nuevo)
  → por cada registro:
    descargar imagen (imageUrl → /media/...)
    → OpenAI images/edits (prompt con emocion + nivelConfianza)
    → guardar en procesed/{fecha}/imagenes/
    → PATCH /api/captures/:id/processed
       (estado_procesamiento = procesado, ruta_almacenamiento_divertida, modify_at en servidor)
```

## Campos de BD usados

| Campo API | Columna | Uso |
|-----------|---------|-----|
| `emocion` | `emocion` | Sustituye `{{ emocion }}` en el prompt |
| `nivelConfianza` | `nivel_confianza` | Sustituye `{{ porcentaje }}` en el prompt |
| `rutaAlmacenamiento` | `ruta_almacenamiento` | Origen de la imagen vía `/media/` |
| `rutaAlmacenamientoDivertida` | `ruta_almacenamiento_divertida` | Ruta de salida tras OpenAI |
| `estadoProcesamiento` | `estado_procesamiento` | `nuevo` → `procesado` |

## APIs

- `GET /api/captures/new` — filas con `estado_procesamiento = nuevo`
- `PATCH /api/captures/:id/processed` — actualiza rutas y estado; `modify_at` lo asigna el backend

## Programar

Sustituye **Inicio manual** por **Schedule Trigger** (ej. cada 5 minutos).
