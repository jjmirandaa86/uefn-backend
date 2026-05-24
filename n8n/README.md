# n8n — Procesar capturas de emoción

## Importar

1. n8n → **Workflows** → **Import from File**
2. Archivo: `uefn-process-emotion-captures.json`

## Antes de ejecutar

| Paso | Acción |
|------|--------|
| 1 | Backend corriendo (`npm start` en `uefn-backend`, puerto 3006) |
| 2 | En nodo **Config**, ajusta `backendUrl` y `backendRoot` a tu máquina |
| 3 | En nodo **OpenAI caricatura**, asigna credencial **OpenAI API** (API key con acceso a imágenes) |
| 4 | n8n debe poder leer/escribir en `backendRoot` (nodo **Guardar en procesed**) |
| 5 | n8n debe alcanzar `backendUrl` para GET imagen y APIs |

## Flujo

```
GET /api/captures/new  →  por cada registro:
  descargar imagen (uploads vía /media)
  → OpenAI edición (caricatura + emoción + confianza)
  → guardar en procesed/{YYYY-MM-DD}/imagenes/
  → PATCH /api/captures/:id/processed
```

## APIs usadas

- `GET /api/captures/new` — filas con `estado_procesamiento = nuevo`
- `PATCH /api/captures/:id/processed` — actualiza a `procesado` + rutas divertidas (`modifyAt` lo pone el servidor)

## Rutas de archivos

| Carpeta | Uso |
|---------|-----|
| `uefn-backend/uploads/{fecha}/` | Imagen original (entrada OpenAI) |
| `uefn-backend/procesed/{fecha}/imagenes/` | Caricatura generada (salida) |

## OpenAI

- Endpoint: `POST https://api.openai.com/v1/images/edits`
- Modelo por defecto: `gpt-image-1` (cambiar en **Config** si usas otro)
- Si falla el multipart, prueba en el nodo cambiar `image[]` por `image`

## Programar

Sustituye **Inicio manual** por **Schedule Trigger** (ej. cada 5 minutos).
