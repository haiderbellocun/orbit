# Orbit

Plataforma interna CUN para operación académica y de planta: dashboard, Planta Activa, carga académica, balance de carga (horas sustantivas), vacantes, panel informativo y novedades.

Monorepo con frontend React (Vite) y API Express + PostgreSQL, desplegado en Google Cloud Run.

| Servicio | URL |
|----------|-----|
| Frontend | https://orbit-frontend-526995286786.us-central1.run.app |
| Backend | https://orbit-backend-526995286786.us-central1.run.app |
| GCP project | `it-fab-contenido-edu-6` · región `us-central1` |

---

## Estructura

```text
Orbit/
├── orbit/                 # Frontend (React 19 + Vite + Tailwind)
├── orbit-api/             # Backend (Express + TypeScript + pg)
├── gcp/                   # Scripts y Cloud Build de despliegue
├── docs/                  # ANS y docs transversales
└── LOGIN_APPS_INTEGRATION.md   # Log de logins central (Nova/Actas/Acervo/Orbit)
```

| Ruta | Contenido |
|------|-----------|
| `orbit/src/components/views/` | Vistas de la app |
| `orbit-api/src/routes/` | Routers HTTP bajo `/api` |
| `orbit-api/src/db/` | Conexión, migraciones y seeds |
| `orbit-api/src/lib/` | Capabilities, roles, acceso Planta Activa |
| `orbit-api/docs/` | Auth Google, carga académica (BI) |
| `docs/ANS-vacantes.md` | ANS del módulo Vacantes |

---

## Módulos (UI)

| Vista | Descripción | Capability típica |
|-------|-------------|-------------------|
| Command Center | Dashboard / home | `view:home` |
| Planta Activa | Personas activas por área (edición acotada) | `view:planta_activa` |
| Carga Académica | Asignaciones docente × materia × grupo (proyección ACA) | `view:academic_load` |
| Balance carga | Horas sustantivas / cátedra | `view:substantive_hours` |
| Vacantes | Ciclo de vida de vacantes y requisición | `view:vacancies` |
| Panel informativo | Bitácora / cambios de vacantes | `vacancies:informative_panel` |
| Novedades | News scope por área/rol | `view:news` |

Acceso actual (reborn): allowlist de correos + grants de Planta Activa / admin vacantes. Detalle en [`orbit-api/docs/auth-google.md`](orbit-api/docs/auth-google.md).

---

## API (backend)

Prefijo: `/api` · salud: `GET /health`

| Router | Dominio |
|--------|---------|
| `auth` | Google OAuth → JWT; login local (solo dev) |
| `dashboard` | Resumen Command Center |
| `catalog` | Catálogos CORE |
| `personal` | Personal / colaboradores |
| `plantaActiva` | Planta Activa |
| `workforce_events` | Eventos de fuerza laboral |
| `notifications` | Campana in-app + correo vacantes |
| `vacancies` | Vacantes, import Excel, panel informativo |
| `reinstatements` | Reintegros |
| `academic_load` | Carga académica |
| `substantive_hours` | Horas sustantivas |

Auth: `Authorization: Bearer <JWT>`. Middleware de capabilities por path.

---

## Requisitos

- Node.js 20+ (recomendado)
- PostgreSQL accesible (local o Cloud SQL)
- Cuenta Google OAuth (Client ID web) para login `@cun.edu.co`
- `gcloud` autenticado solo si vas a desplegar

---

## Arranque local

### 1. Backend (`orbit-api`)

```powershell
cd orbit-api
copy .env.example .env
# Completa DB_*, GOOGLE_CLIENT_ID, JWT_SECRET, ORBIT_FRONTEND_URL
npm install
npm run migrate          # y demás migrate:* según esquema
npm run dev              # http://localhost:4000
```

Comprobar:

```powershell
curl http://127.0.0.1:4000/health
```

### 2. Frontend (`orbit`)

```powershell
cd orbit
copy .env.example .env.local
# VITE_API_URL=http://localhost:4000/api
# VITE_GOOGLE_CLIENT_ID=<mismo Client ID que el API>
npm install
npm run dev              # http://localhost:3000
```

En desarrollo el API puede aceptar `POST /api/auth/local-email` (`NODE_ENV=development` o `ALLOW_LOCAL_EMAIL_AUTH=1`).

---

## Variables de entorno

### Frontend (`orbit/.env.local`)

| Variable | Uso |
|----------|-----|
| `VITE_API_URL` | Base del API (ej. `http://localhost:4000/api`) |
| `VITE_GOOGLE_CLIENT_ID` | OAuth web Client ID |
| `VITE_IMPORT_API_URL` | Opcional; API solo para import Excel |
| `VITE_ALLOW_LOCAL_EMAIL_LOGIN` | Muestra login por correo fuera de `npm run dev` |
| `GEMINI_API_KEY` | Solo si usas features Gemini / AI Studio |

### Backend (`orbit-api/.env`)

| Variable | Uso |
|----------|-----|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL |
| `DB_SCHEMA` | `search_path` (ej. `core`) |
| `DB_SSL` | `true` si la DB exige TLS |
| `PORT` | HTTP (local `4000`; Cloud Run inyecta el suyo) |
| `GOOGLE_CLIENT_ID` | Mismo Client ID que el frontend |
| `JWT_SECRET` | Firma del JWT de sesión |
| `ORBIT_FRONTEND_URL` | Redirect post-login (ej. `http://localhost:3000`) |
| `ORBIT_ACCESS_ALLOWLIST` | Correos con acceso total (reborn) |
| `ORBIT_LITE_ROLE_ID` | Id del rol LITE en catálogo |
| `CORS_ORIGIN` | Origen del SPA en producción |
| `SMTP_*`, `VACANCY_NOTIFY_EMAILS` | Notificaciones de vacantes |

Plantillas: [`orbit/.env.example`](orbit/.env.example), [`orbit-api/.env.example`](orbit-api/.env.example), [`orbit-api/env.production.example`](orbit-api/env.production.example).

**No commits de secretos** (`.env`, passwords, app passwords SMTP).

---

## Scripts útiles (`orbit-api`)

| Script | Descripción |
|--------|-------------|
| `npm run dev` | API con reload |
| `npm run build` / `npm start` | Build y arranque producción |
| `npm run migrate` … `migrate:*` | Migraciones por dominio |
| `npm run seed` … `seed:v4` | Seeds |
| `npm test` | Tests de capabilities y validación de carga |
| `npm run test:smtp` | Prueba de correo |
| `npm run template:person` | Genera plantilla Excel de personas |

---

## Despliegue (Cloud Run)

Desde la **raíz del repo**:

```powershell
.\gcp\deploy-orbit-backend.ps1
.\gcp\deploy-orbit-frontend.ps1
# o ambos:
.\gcp\deploy-orbit-all.ps1
```

Detalle (Docker, flags Cloud SQL, checklist de errores, 413 en Excel): [`orbit-api/README_DEPLOY.md`](orbit-api/README_DEPLOY.md).

Cloud Build: `gcp/cloudbuild-orbit-backend.yaml`, `gcp/cloudbuild-orbit-frontend.yaml`.

---

## Documentación adicional

| Documento | Tema |
|-----------|------|
| [orbit-api/docs/auth-google.md](orbit-api/docs/auth-google.md) | Login Google, JWT, capabilities, allowlist |
| [orbit-api/docs/carga-academica.md](orbit-api/docs/carga-academica.md) | Modelo y métricas de carga académica |
| [docs/ANS-vacantes.md](docs/ANS-vacantes.md) | ANS del ciclo de vacantes |
| [orbit-api/README_DEPLOY.md](orbit-api/README_DEPLOY.md) | Despliegue Cloud Run |
| [LOGIN_APPS_INTEGRATION.md](LOGIN_APPS_INTEGRATION.md) | Registro central de logins en `logs.login_apps` |
| [orbit/README.md](orbit/README.md) | Notas del frontend |

Acceso acotado Planta Activa (correos por área): `orbit-api/src/lib/plantaActivaAccess.ts`.

---

## Stack

- **Frontend:** React 19, Vite 6, TypeScript, Tailwind 4, Motion, Google OAuth, dnd-kit
- **Backend:** Express, TypeScript, `pg`, JWT, Google Auth Library, ExcelJS/XLSX, Nodemailer, Multer
- **Infra:** Cloud Run, Cloud SQL (PostgreSQL), Artifact Registry / build desde source, Secret Manager (recomendado para passwords)
