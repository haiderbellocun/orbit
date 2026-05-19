# Despliegue de Orbit API en Google Cloud Run

Backend Express + TypeScript + PostgreSQL del monorepo Orbit (`orbit-api/`).

## Precondiciones

- Cuenta de Google Cloud con facturación habilitada en el proyecto **it-fab-contenido-edu-6**.
- [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install) instalado y autenticado (`gcloud auth login`).
- API **Cloud Run** y **Artifact Registry** (o **Container Registry**) habilitadas en el proyecto.
- Instancia de **Cloud SQL for PostgreSQL** (o base accesible desde Cloud Run) y red/VPC o conector según tu arquitectura.
- Secreto de contraseña en **Secret Manager** (recomendado); referencia en Cloud Run como variable de entorno o montaje, sin commitear valores reales.

## Estructura del backend

- `src/index.ts` — Punto de entrada HTTP: CORS, JSON, prefijo de API, `/health`.
- `src/routes/` — Routers montados bajo el prefijo configurado (`API_PREFIX`, por defecto `/api`).
- `src/db/connection.ts` — Pool `pg`, `search_path` vía `DB_SCHEMA`, SSL opcional con `DB_SSL`.
- `src/db/migrate*.ts`, `seed*.ts` — Migraciones y seeds (se ejecutan fuera del contenedor o en jobs; no forman parte del `CMD` del contenedor).

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `NODE_ENV` | `production` en Cloud Run. |
| `PORT` | Puerto HTTP; Cloud Run inyecta `PORT` (el contenedor usa `8080` por defecto en la imagen). |
| `API_PREFIX` | Prefijo de las rutas de negocio (por defecto `/api`). |
| `CORS_ORIGIN` | Origen permitido para CORS en producción (URL del frontend). Si no se define, en desarrollo suele usarse CORS permisivo. |
| `DB_HOST` | Host o socket Unix de Cloud SQL, p. ej. `/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME`. |
| `DB_PORT` | Puerto PostgreSQL (por defecto `5432`). |
| `DB_USER` | Usuario de la base (también se acepta `DB_USERNAME` por compatibilidad). |
| `DB_PASSWORD` | Contraseña; **solo en runtime**, nunca en el repositorio. |
| `DB_NAME` | Nombre de la base de datos. |
| `DB_SCHEMA` | Esquema principal; se aplica en `search_path`. |
| `DB_SSL` | `true` para habilitar TLS hacia PostgreSQL (`rejectUnauthorized: false` para compatibilidad con certificados gestionados). |

Valores de ejemplo sin secretos: copia `env.production.example` y sustituye placeholders; no subas `.env` al repositorio.

## Variables sensibles

- `DB_PASSWORD` y cualquier API key deben vivir en **Secret Manager** (o en la configuración de secretos de Cloud Run) y mapearse a variables de entorno en el servicio. No escribas contraseñas en `Dockerfile`, `README`, ni en archivos de ejemplo con valores reales.

## Build local de la imagen

Desde el directorio `orbit-api/`:

```bash
docker build -t orbit-api:local .
```

## Prueba local (sin Docker)

Desde `orbit-api/`:

```bash
npm ci
npm run build
set PORT=8080
set NODE_ENV=production
node dist/index.js
```

En PowerShell, sustituye `set` por:

```powershell
$env:PORT="8080"; $env:NODE_ENV="production"; node dist/index.js
```

Comprueba salud:

```bash
curl http://127.0.0.1:8080/health
```

## Despliegue con scripts PowerShell (`--source`)

Desde la **raíz del monorepo** (proyecto `it-fab-contenido-edu-6`):

```powershell
.\gcp\deploy-orbit-backend.ps1
.\gcp\deploy-orbit-frontend.ps1
# o ambos:
.\gcp\deploy-orbit-all.ps1
```

URLs de producción:

- Frontend: https://orbit-frontend-526995286786.us-central1.run.app
- Backend: https://orbit-backend-526995286786.us-central1.run.app

## Despliegue inicial en Cloud Run (`--source`, manual)

Desde el directorio `orbit-api/` (ajusta conexión a Cloud SQL, secretos y CORS según tu entorno):

```bash
gcloud run deploy orbit-backend --source . --project it-fab-contenido-edu-6 --region us-central1 --allow-unauthenticated
```

Añade según necesites: `--set-env-vars`, `--set-secrets`, `--add-cloudsql-instances`, VPC connector, CPU/memoria, etc.

## Ver logs

```bash
gcloud run services logs read orbit-backend --project it-fab-contenido-edu-6 --region us-central1
```

O en tiempo casi real:

```bash
gcloud beta run services logs tail orbit-backend --project it-fab-contenido-edu-6 --region us-central1
```

## URL del servicio

```bash
gcloud run services describe orbit-backend --project it-fab-contenido-edu-6 --region us-central1 --format="value(status.url)"
```

## Checklist de errores comunes

1. **No escucha en `PORT` / 8080** — Cloud Run envía tráfico al puerto definido en `PORT`. La app usa `Number(process.env.PORT) || 8080` y `listen(..., "0.0.0.0")`. Si sobreescribes `PORT` en el servicio, debe coincidir con el que escucha el proceso.
2. **Falta build** — La imagen ejecuta `dist/index.js`. Si despliegas código sin pasar por `npm run build` en la etapa builder del Dockerfile, el contenedor fallará al arrancar.
3. **Error de conexión a la base** — Revisa `DB_HOST`, `DB_PORT`, usuario, nombre de base, `DB_SSL` y que Cloud Run tenga acceso a Cloud SQL (conector, instancia en `--add-cloudsql-instances`, red privada o IP pública autorizada).
4. **CORS** — El navegador bloqueará llamadas si `CORS_ORIGIN` no coincide exactamente con el origen del frontend (esquema, host y puerto).
5. **Variables faltantes** — Comprueba en la consola de Cloud Run que todas las variables requeridas estén definidas; los defaults solo aplican en desarrollo local para host/puerto/usuario/base/esquema.
6. **Permisos Cloud SQL / Secret Manager** — La cuenta de servicio del revision de Cloud Run necesita roles como **Cloud SQL Client** y acceso de lectura a los secretos referenciados; sin ellos verás errores de permiso en logs.
7. **413 al subir Excel (import)** — En **Cloud Run**, las peticiones **HTTP/1** tienen un tope de cuerpo de unos **32 MiB** (incluye metadatos multipart). Si el `.xlsx` se acerca o supera ese tamaño, el navegador verá **413 Content Too Large** antes de que Express/Multer lo procesen. Opciones: reducir el archivo, o diseñar subida a **Cloud Storage** con URL firmada y que la API solo reciba la referencia al objeto.
