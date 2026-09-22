<div align="center">

<img src="https://i.ibb.co/1SR92PZ/LOGO-ORBIT-512-Mesa-de-trabajo-1-02-02.png" alt="Orbit" width="140" />

# Orbit — Documentación completa

**Plataforma interna CUN** · operación académica y de planta

[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-8B5CF6?style=for-the-badge&logo=react&logoColor=white)](orbit/)
[![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20TS-D946EF?style=for-the-badge&logo=nodedotjs&logoColor=white)](orbit-api/)
[![Database](https://img.shields.io/badge/DB-PostgreSQL-06B6D4?style=for-the-badge&logo=postgresql&logoColor=white)](#6--base-de-datos)
[![Cloud](https://img.shields.io/badge/Deploy-Cloud%20Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](#11--despliegue)

| | |
|:--|:--|
| 🖥️ **Frontend** | https://orbit-frontend-526995286786.us-central1.run.app |
| ⚙️ **Backend** | https://orbit-backend-526995286786.us-central1.run.app |
| ☁️ **GCP** | `it-fab-contenido-edu-6` · `us-central1` |

**Paleta de marca:** `violet` · `fuchsia` · `cyan`

</div>

---

## 📑 Tabla de contenidos

| | Sección |
|:-:|:--------|
| 🎯 | [1. Visión general](#1--visión-general) |
| 📁 | [2. Estructura del monorepo](#2--estructura-del-monorepo) |
| 🏗️ | [3. Arquitectura](#3--arquitectura) |
| ⚛️ | [4. Frontend](#4--frontend-orbit) |
| 🟢 | [5. Backend](#5--backend-orbit-api) |
| 🗄️ | [6. Base de datos](#6--base-de-datos) |
| 🔐 | [7. Autenticación y autorización](#7--autenticación-y-autorización) |
| 🧩 | [8. Variables de entorno](#8--variables-de-entorno) |
| 🚀 | [9. Arranque local](#9--arranque-local) |
| 🧬 | [10. Migraciones, seeds y scripts](#10--migraciones-seeds-y-scripts) |
| ☁️ | [11. Despliegue](#11--despliegue) |
| 📚 | [12. Documentación relacionada](#12--documentación-relacionada) |
| 🛠️ | [13. Stack](#13--stack) |

---

## 1. 🎯 Visión general

Orbit concentra en un solo producto:

| Icono | Módulo UI | Color | Qué resuelve |
|:-----:|-----------|:-----:|--------------|
| ⚡ | **Command Center** | ![violet](https://img.shields.io/badge/-violet-8B5CF6?style=flat-square) | Métricas: docentes, vacantes, contrataciones, aging, novedades del día |
| 🏢 | **Planta Activa** | ![fuchsia](https://img.shields.io/badge/-fuchsia-D946EF?style=flat-square) | Maestro de personas; alta/edición; inactivar puede abrir vacante |
| 🎓 | **Carga Académica** | ![indigo](https://img.shields.io/badge/-indigo-6366F1?style=flat-square) | Proyección ACA (docente × materia × grupo × periodo) |
| ⏱️ | **Balance carga** | ![cyan](https://img.shields.io/badge/-cyan-06B6D4?style=flat-square) | Horas sustantivas y preparación de clase |
| 💼 | **Vacantes** | ![amber](https://img.shields.io/badge/-amber-F59E0B?style=flat-square) | Ciclo operativo + REQ + notas + Excel + notificaciones |
| 🛡️ | **Panel informativo** | ![slate](https://img.shields.io/badge/-slate-64748B?style=flat-square) | Bitácora / audit de vacantes (capability + feature flag) |
| 💬 | **Novedades** | ![emerald](https://img.shields.io/badge/-emerald-10B981?style=flat-square) | Eventos de fuerza laboral + bitácora de estados |

> 💡 El **backend** es la fuente de verdad. El frontend **no usa React Router**: navega por estado React (`View`) y llama al API con JWT.

---

## 2. 📁 Estructura del monorepo

```text
Orbit/
├── 📘 README.md                      # Este documento
├── 🔗 LOGIN_APPS_INTEGRATION.md      # Log central de logins
├── 📂 docs/
│   └── 📋 ANS-vacantes.md
├── ☁️ gcp/                           # Deploy Cloud Run / Cloud Build
├── ⚛️ orbit/                         # Frontend SPA (violet)
│   ├── src/components/views/         # Pantallas
│   ├── src/components/layout/        # Sidebar, TopBar, campana…
│   ├── src/lib/                      # api, permissions, helpers
│   └── src/config/brand.tsx          # Logos + colores + iconos
└── 🟢 orbit-api/                     # Backend API (fuchsia)
    ├── src/routes/                   # Routers HTTP
    ├── src/middleware/               # JWT + capabilities
    ├── src/db/                       # connection, migrate*, seed*
    ├── src/services/                 # Notify, Excel, bulk
    └── docs/                         # auth-google, carga-académica
```

---

## 3. 🏗️ Arquitectura

```mermaid
flowchart LR
  subgraph FE["🟣 Frontend · orbit"]
    SPA["React SPA<br/>:3000"]
  end
  subgraph BE["🩷 Backend · orbit-api"]
    API["Express /api<br/>:4000"]
    HL["💚 /health"]
  end
  subgraph EXT["⚪ Externos"]
    GO["🔐 Google OAuth"]
    SMTP["✉️ SMTP"]
  end
  subgraph DB["🩵 PostgreSQL"]
    PG[("Cloud SQL / local<br/>multi-schema")]
  end

  SPA -->|"HTTPS + Bearer JWT"| API
  SPA --> GO
  GO -->|"idToken"| API
  API --> PG
  API --> SMTP
  HL --> PG
```

### 🔄 Flujo de sesión

| Paso | Icono | Qué ocurre |
|:----:|:-----:|------------|
| 1 | 👤 | Login Google `@cun.edu.co` en el SPA |
| 2 | 🎫 | Frontend envía `idToken` → `POST /api/auth/google` |
| 3 | ✅ | API verifica, busca `person`, allowlist/grants, firma JWT |
| 4 | 💾 | SPA guarda `orbit_jwt` + `orbit_user` en `localStorage` |
| 5 | 🔁 | Cada `/api/*` revalida auth + capabilities |
| 6 | 🧭 | UI filtra menú y pantallas según capabilities |

🔔 **Notificaciones:** al crear vacante → `orbit.notification` + email SMTP (si hay credenciales). La campana hace polling del unread.

---

## 4. ⚛️ Frontend (`orbit/`)

### 4.1 Stack y build

| Icono | Capa | Tecnología |
|:-----:|------|------------|
| ⚛️ | UI | React 19 + TypeScript |
| ⚡ | Build | Vite 6 |
| 🎨 | Estilos | Tailwind CSS 4 |
| 🔐 | Auth UI | `@react-oauth/google` |
| 🦸 | Iconos | `@heroicons/react` |
| ✨ | Motion | `motion` |
| 🧲 | DnD | `@dnd-kit/*` |

- Alias `@` → raíz del frontend
- ❌ Sin `server.proxy` → llamadas directas a `VITE_API_URL`
- 🚀 Dev: puerto **3000** · host `0.0.0.0`

### 4.2 Bootstrap y “routing”

> ⚠️ **No usa React Router.** Navegación = `useState<View>` en `App.tsx`.

1. `main.tsx` → `GoogleOAuthProvider` → `App`
2. Vista inicial: `login`
3. JWT válido → restaura sesión
4. Login OK → shell + tutorial
5. Vista no permitida → `getDefaultView(capabilities)`
6. Vacante detalle → `selectedVacancy` + `vacancy-detail`

### 4.3 Vistas de negocio

#### Menú lateral (`NAV_ITEMS`)

| | View id | Componente | Descripción |
|:-:|---------|------------|-------------|
| ⚡ | `home` | `HomeView` | Command Center + `GET /dashboard/summary` |
| 🏢 | `planta-activa` | `PlantaActivaView` | Personas; filtros; grants por área |
| 🎓 | `academic-load` | `AcademicLoadView` | Carga académica (lectura) |
| ⏱️ | `substantive-hours` | `SubstantiveHoursView` | Balance de carga |
| 💼 | `vacancies` | `VacanciesView` | Vacantes + chart + Excel |
| 🛡️ | `vacancy-informative-panel` | `VacancyInformativePanelView` | Audit (feature flag) |
| 💬 | `news` | `NewsView` | Novedades / workforce |

#### Otras vistas

| | View id | Notas |
|:-:|---------|-------|
| 🔑 | `login` | Google + email local (dev) |
| 📄 | `vacancy-detail` | Detalle, historial, admin |
| 🔓 | `reinstatements` | Reintegros |
| 📜 | `audit` | Mock / legacy |
| 📚 | `programs` | Demo |

### 4.4 Layout

| Icono | Componente | Rol |
|:-----:|------------|-----|
| 📌 | `Sidebar` | Nav filtrada; expand/collapse; drawer móvil |
| 🔝 | `TopBar` | ⌘/Ctrl+K, tutorial, campana, logout |
| 🏷️ | `Header` | Título / acciones de página |
| 🔍 | `CommandPalette` | Búsqueda vistas + personas + vacantes |
| 🔔 | `NotificationBell` | Poll ~60s; deep-link a vacante |

### 4.5 `lib/` y permisos UI

| Archivo | Rol |
|---------|-----|
| 🌐 `api.ts` | Cliente HTTP + sesión JWT + endpoints |
| 🛂 `permissions.ts` | Capabilities, gating de vistas, landing |
| 🏢 `plantaActivaAccess.ts` | Grants por correo (áreas) |
| 💼 `vacancyFormHelpers.ts` | Labels, bloqueos, Zoho REQ |
| 📅 `vacancyActiveDays.ts` | Días activos (Bogotá) |
| 💬 `workforceEventLabels.ts` | Labels/badges de novedades |
| 🎨 `config/brand.tsx` | Logos, colores, mapa de iconos |

💾 Sesión: `orbit_jwt`, `orbit_user`. Ante **401** → limpia sesión.

### 4.6 Login en UI

| Modo | Badge | Flujo |
|------|:-----:|-------|
| Google | ![prod](https://img.shields.io/badge/PROD-8B5CF6?style=flat-square) | `GoogleLogin` → `POST /auth/google` |
| Email local | ![dev](https://img.shields.io/badge/DEV-06B6D4?style=flat-square) | Visible si `DEV` o `VITE_ALLOW_LOCAL_EMAIL_LOGIN` |

### 4.7 Tipos principales

`View` · `PlantaPerson` · `Vacancy` / `VacancyDetail` · `VacancyOperationStatus` · `OrbitNotification` (+ tipos en `lib/api.ts`)

---

## 5. 🟢 Backend (`orbit-api/`)

### 5.1 Entry point

Orden de montaje:

| # | Capa | Notas |
|:-:|------|-------|
| 1️⃣ | `cors()` | Permisivo por defecto |
| 2️⃣ | `express.json()` | Body JSON |
| 3️⃣ | 🔓 `authRouter` | Público |
| 4️⃣ | 🔐 `orbitAuthMiddleware` | JWT |
| 5️⃣ | 🛂 `orbitCapabilityByPathMiddleware` | Capability por path |
| 6️⃣ | 📦 Routers de negocio | Bajo §5.3 |

- 💚 **`GET /health`** — sin auth · DB OK `200` / fail `503`
- 🩹 Boot: `runStartupSchemaPatches()` (idempotente)
- 🔌 Puerto: `PORT` o **4000**

### 5.2 Middleware de auth

**Token:** `Authorization: Bearer` · GET también `?access_token=`

**Reborn:** capabilities se **recalculan por email** en cada request (allowlist / planta / vacancy-admin).

| Prefijo | Capability |
|---------|------------|
| `/catalog` | ✅ autenticado |
| `/dashboard` | `view:home` |
| `/planta-activa` | `view:planta_activa` |
| `/vacancies`, `/reinstatements` | `view:vacancies` |
| `/academic-load` | `view:academic_load` |
| `/substantive-hours` | `view:substantive_hours` |
| `/workforce-events` | `view:news` |
| `/personal` | `view:news` u `view:home` |
| `/notifications` | solo auth |

Sin capability → ![403](https://img.shields.io/badge/403-Forbidden-EF4444?style=flat-square)

### 5.3 Endpoints por dominio

Leyenda HTTP:

![GET](https://img.shields.io/badge/GET-06B6D4?style=flat-square)
![POST](https://img.shields.io/badge/POST-10B981?style=flat-square)
![PATCH](https://img.shields.io/badge/PATCH-F59E0B?style=flat-square)
![PUT](https://img.shields.io/badge/PUT-8B5CF6?style=flat-square)
![DELETE](https://img.shields.io/badge/DELETE-EF4444?style=flat-square)

Prefijo **`/api`** (salvo `/health`).

#### 🔑 Auth — sin JWT

| Método | Path | Propósito |
|--------|------|-----------|
| ![POST](https://img.shields.io/badge/POST-10B981?style=flat-square) | `/auth/google` | `{ idToken }` → `{ token, user }` |
| ![POST](https://img.shields.io/badge/POST-10B981?style=flat-square) | `/auth/google/gis-callback` | Redirect GIS |
| ![POST](https://img.shields.io/badge/POST-10B981?style=flat-square) | `/auth/local-email` | Solo DEV / flag |

#### ⚡ Dashboard · 📂 Catálogo

| Método | Path | Propósito |
|--------|------|-----------|
| ![GET](https://img.shields.io/badge/GET-06B6D4?style=flat-square) | `/dashboard/summary` | Métricas home |
| ![GET](https://img.shields.io/badge/GET-06B6D4?style=flat-square) | `/catalog/areas` · `schools` · `programs` · `roles` · `academic-lines` | Catálogos CORE |

#### 🏢 Planta · 💬 Novedades · 🔔 Notificaciones

| Método | Path | Propósito |
|--------|------|-----------|
| ![GET](https://img.shields.io/badge/GET-06B6D4?style=flat-square) ![POST](https://img.shields.io/badge/POST-10B981?style=flat-square) ![PATCH](https://img.shields.io/badge/PATCH-F59E0B?style=flat-square) | `/planta-activa` | CRUD personas (+ vacante al inactivar) |
| ![GET](https://img.shields.io/badge/GET-06B6D4?style=flat-square) ![POST](https://img.shields.io/badge/POST-10B981?style=flat-square) ![PATCH](https://img.shields.io/badge/PATCH-F59E0B?style=flat-square) | `/workforce-events/...` | Eventos + status-log |
| ![GET](https://img.shields.io/badge/GET-06B6D4?style=flat-square) ![PATCH](https://img.shields.io/badge/PATCH-F59E0B?style=flat-square) | `/notifications...` | Campana in-app |

#### 💼 Vacantes

| Método | Path | Propósito |
|--------|------|-----------|
| ![GET](https://img.shields.io/badge/GET-06B6D4?style=flat-square) | `/vacancies` · `/:id` · `/export.xlsx` · `/audit-log` | Listado / detalle / Excel / audit |
| ![POST](https://img.shields.io/badge/POST-10B981?style=flat-square) | `/vacancies` · notes · requisition | Crear + notify |
| ![PATCH](https://img.shields.io/badge/PATCH-F59E0B?style=flat-square) | `/:id` · `/close` · `/admin-status` | Update / cierre / admin |
| ![DELETE](https://img.shields.io/badge/DELETE-EF4444?style=flat-square) | `/:id` | Eliminar (`vacancies:admin`) |

También: 🔓 reintegros · 🎓 carga académica · ⏱️ horas sustantivas.

### 5.4–5.5 Libs y services

| Tipo | Módulos |
|------|---------|
| 🧠 Libs | `orbitCapabilities` · `plantaActivaAccess` · `orbitRoles` · `newsScope` · `schoolScope` · `coreSchema` |
| 🛎️ Services | `vacancyNotify` · email template · Excel export · bulk catalog/workload (scripts) |

### 5.6 Import / Excel

- ✅ Export HTTP: `/vacancies/export.xlsx`
- ❌ Sin upload HTTP en routers actuales
- 📜 Scripts offline en `scripts/` + seeds Excel

### 5.7 Errores HTTP

| Código | Color | Uso |
|:------:|:-----:|-----|
| 400 | ![400](https://img.shields.io/badge/400-F59E0B?style=flat-square) | Validación |
| 401 | ![401](https://img.shields.io/badge/401-EF4444?style=flat-square) | JWT / no autorizado |
| 403 | ![403](https://img.shields.io/badge/403-DC2626?style=flat-square) | Sin capability |
| 404 | ![404](https://img.shields.io/badge/404-64748B?style=flat-square) | No encontrado |
| 409 | ![409](https://img.shields.io/badge/409-D946EF?style=flat-square) | Conflicto |
| 500 | ![500](https://img.shields.io/badge/500-991B1B?style=flat-square) | Error interno |
| 503 | ![503](https://img.shields.io/badge/503-0EA5E9?style=flat-square) | Health / CORE down |

---

## 6. 🗄️ Base de datos

PostgreSQL · Cloud SQL (socket `/cloudsql/...` o TCP + SSL).

### 6.1 Conexión

| Variable | Rol |
|----------|-----|
| `DB_HOST` / `DB_PORT` | Host o socket · default `5432` |
| `DB_USER` · `DB_PASSWORD` · `DB_NAME` | Credenciales |
| `DB_SCHEMA` | Primer schema del `search_path` |
| `DB_SSL` · timeouts · `DB_POOL_MAX` | TLS y pool (`pg.Pool`) |

### 6.2 Esquemas (leyenda de color)

| Color | Schema | Dominio |
|:-----:|--------|---------|
| ![core](https://img.shields.io/badge/core-8B5CF6?style=for-the-badge) | `core` | Catálogo + personas |
| ![aca](https://img.shields.io/badge/academic__workload-6366F1?style=for-the-badge) | `academic_workload` | Materias, grupos, carga |
| ![sub](https://img.shields.io/badge/substantive__hours-06B6D4?style=for-the-badge) | `substantive_hours` | Horas / categorías |
| ![vac](https://img.shields.io/badge/vacancies-F59E0B?style=for-the-badge) | `vacancies` | Vacantes + REQ + audit |
| ![wf](https://img.shields.io/badge/workforce__events-10B981?style=for-the-badge) | `workforce_events` | Novedades |
| ![orb](https://img.shields.io/badge/orbit-D946EF?style=for-the-badge) | `orbit` | Notificaciones |
| ![log](https://img.shields.io/badge/logs-64748B?style=for-the-badge) | `logs` | Imports + login apps |
| ![pub](https://img.shields.io/badge/public%20legacy-94A3B8?style=for-the-badge) | `public` | Tablas antiguas |

> 📌 Dump SQL ≈ `core` + `academic_workload` + `logs` + `substantive_hours`.  
> `vacancies` · `workforce_events` · `orbit` llegan por migraciones.

### 6.3–6.8 Tablas por dominio

**🟣 CORE** — `area` · `school` · `program` · `role` · `person` ⭐ · `user` · `city` · `contract_type` · `hierarchy` · `person_program_assignments`

**🔵 Carga** — `subject` · `class_group` · `class_preparation` · `academic_load`

**🩵 Horas** — `category` · `assignment` · `assignment_task`

**🟠 Vacantes** — `vacancy` · `requisition` · `vacancy_operation_note` · `vacancy_status_history` · `vacancy_change_log`

**🟢 Novedades** — `event_type` · `event` · `event_status_log`

**🩷 / ⬜** — `orbit.notification` · `logs.logs_orbit_docentes` · `logs.login_apps`

### 🟠 Pipeline de estados — Vacantes

| Estado | Badge |
|--------|-------|
| `open` | ![open](https://img.shields.io/badge/open-22C55E?style=flat-square) |
| `selected` | ![selected](https://img.shields.io/badge/selected-06B6D4?style=flat-square) |
| `requisition_sent` | ![req](https://img.shields.io/badge/requisition__sent-8B5CF6?style=flat-square) |
| `internal_movement` | ![mov](https://img.shields.io/badge/internal__movement-F59E0B?style=flat-square) |
| `hired` | ![hired](https://img.shields.io/badge/hired-10B981?style=flat-square) |
| `closed` | ![closed](https://img.shields.io/badge/closed-64748B?style=flat-square) |
| `cancelled` | ![can](https://img.shields.io/badge/cancelled-EF4444?style=flat-square) |
| `cancelled_by_capital` | ![cbc](https://img.shields.io/badge/cancelled__by__capital-DC2626?style=flat-square) |

```text
open → selected → requisition_sent → internal_movement
                                          ↓
                         hired | closed | cancelled | cancelled_by_capital
```

### 🟢 Estados — Novedades (workforce)

| Badge | Estado |
|:-----:|--------|
| ![PENDING](https://img.shields.io/badge/PENDING-F59E0B?style=flat-square) | Pendiente |
| ![APPROVED](https://img.shields.io/badge/APPROVED-10B981?style=flat-square) | Aprobado |
| ![REJECTED](https://img.shields.io/badge/REJECTED-EF4444?style=flat-square) | Rechazado |
| ![TAKEN](https://img.shields.io/badge/TAKEN-06B6D4?style=flat-square) | Tomado |
| ![NOT_TAKEN](https://img.shields.io/badge/NOT__TAKEN-64748B?style=flat-square) | No tomado (default) |
| ![CANCELLED](https://img.shields.io/badge/CANCELLED-DC2626?style=flat-square) | Cancelado |

Tipos seed: `LICENCIA` · `PERMISO` · `SANCION` · `INCAPACIDAD` · `OTRO`

### 6.10 Diagrama conceptual

```mermaid
erDiagram
  AREA ||--o{ SCHOOL : tiene
  SCHOOL ||--o{ PROGRAM : tiene
  SCHOOL ||--o{ PERSON : asigna
  PERSON ||--o| USER : login
  PERSON ||--o{ ACADEMIC_LOAD : carga
  PERSON ||--o{ VACANCY : crea
  PERSON ||--o{ EVENT : novedad
  PERSON ||--o{ NOTIFICATION : recibe
  VACANCY ||--o| REQUISITION : req
  VACANCY ||--o{ STATUS_HISTORY : historial
  EVENT ||--o{ STATUS_LOG : bitacora
```

---

## 7. 🔐 Autenticación y autorización

### 7.1 Capabilities

| Capability | Icono | Módulo |
|------------|:-----:|--------|
| `view:home` | ⚡ | Command Center |
| `view:planta_activa` | 🏢 | Planta Activa |
| `view:academic_load` | 🎓 | Carga académica |
| `view:substantive_hours` | ⏱️ | Balance carga |
| `view:vacancies` | 💼 | Vacantes / reintegros |
| `vacancies:informative_panel` | 🛡️ | Panel informativo |
| `vacancies:admin` | 👑 | Eliminar / forzar estado |
| `view:news` | 💬 | Novedades |

### 7.2 Modelo reborn

Puede entrar quien esté en:

1. 👑 `ORBIT_ACCESS_ALLOWLIST` — admin total  
2. 🏢 Grant Planta Activa (`plantaActivaAccess.ts`)  
3. 💼 `ORBIT_VACANCY_ADMIN_ALLOWLIST`

📘 Detalle: [`orbit-api/docs/auth-google.md`](orbit-api/docs/auth-google.md)

### 7.3 JWT

🎫 Firmado con `JWT_SECRET` · expira a las **2 horas** · middleware **recalcula** capabilities por email.

---

## 8. 🧩 Variables de entorno

### ⚛️ Frontend (`.env.local`)

| Variable | Uso |
|----------|-----|
| `VITE_API_URL` | Base API |
| `VITE_GOOGLE_CLIENT_ID` | OAuth |
| `VITE_ALLOW_LOCAL_EMAIL_LOGIN` | Login email fuera de DEV |
| `VITE_ORBIT_*_ALLOWLIST` | Caps extra en cliente (opcional) |

### 🟢 Backend (`.env`)

| Grupo | Variables |
|-------|-----------|
| 🗄️ DB | `DB_HOST` · `DB_PORT` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` · `DB_SCHEMA` · `DB_SSL` |
| 🔐 Auth | `GOOGLE_CLIENT_ID` · `JWT_SECRET` · `ORBIT_*` · `ALLOW_LOCAL_EMAIL_AUTH` |
| 🌐 App | `PORT` · `ORBIT_FRONTEND_URL` · `CORS_ORIGIN` |
| ✉️ Mail | `SMTP_*` · `VACANCY_NOTIFY_EMAILS` |

⚠️ **Nunca** commits de `.env` reales ni passwords.

---

## 9. 🚀 Arranque local

### 🟢 Backend

```powershell
cd orbit-api
copy .env.example .env
# Completar DB_*, GOOGLE_CLIENT_ID, JWT_SECRET, ORBIT_FRONTEND_URL
npm install
npm run dev   # → :4000
```

💚 Salud: `curl http://127.0.0.1:4000/health`

### ⚛️ Frontend

```powershell
cd orbit
copy .env.example .env.local
# VITE_API_URL=http://localhost:4000/api
npm install
npm run dev   # → :3000
```

🌐 Abrir http://localhost:3000

---

## 10. 🧬 Migraciones, seeds y scripts

| Script | Efecto |
|--------|--------|
| `migrate` / `v2` / `v3` | Legacy `public` |
| `migrate:core` | 🟣 Catálogo CORE |
| `migrate:vacancies*` | 🟠 Schema vacantes |
| `migrate:workforce-events` | 🟢 Novedades |
| `migrate:notifications` | 🩷 Campana |
| `migrate:audit` / `login-apps` | ⬜ Logs |
| `migrate:substantive-hours-*` | 🩵 Horas |
| `migrate:academic-load-aca-group-id` | 🔵 `aca_group_id` |

🩹 Boot: `startupSchemaPatches.ts`  
🌱 Seeds `seed`…`seed:v4` → tablas **legacy**  
🧪 `npm test` · `test:smtp` · `template:person`

---

## 11. ☁️ Despliegue

```powershell
.\gcp\deploy-orbit-backend.ps1
.\gcp\deploy-orbit-frontend.ps1
# o ambos:
.\gcp\deploy-orbit-all.ps1
```

| | |
|:-:|:--|
| ⚛️ | Frontend Cloud Run |
| 🟢 | Backend Cloud Run |
| 🔐 | Secrets en Secret Manager |
| 📘 | Checklist: [`orbit-api/README_DEPLOY.md`](orbit-api/README_DEPLOY.md) |

---

## 12. 📚 Documentación relacionada

| Icono | Documento | Tema |
|:-----:|-----------|------|
| 🔐 | [auth-google.md](orbit-api/docs/auth-google.md) | Login, JWT, capabilities |
| 🎓 | [carga-academica.md](orbit-api/docs/carga-academica.md) | Modelo BI carga |
| 📊 | [ESTADO_PROYECTO.md](ESTADO_PROYECTO.md) | Estado general y porcentaje de avance |
| 👥 | [second-in-command.md](orbit-api/docs/second-in-command.md) | Segundos al mando |
| 📋 | [ANS-vacantes.md](docs/ANS-vacantes.md) | ANS vacantes |
| ☁️ | [README_DEPLOY.md](orbit-api/README_DEPLOY.md) | Deploy Cloud Run |
| 🔗 | [LOGIN_APPS_INTEGRATION.md](LOGIN_APPS_INTEGRATION.md) | Logins centrales |
| ⚛️ | [orbit/README.md](orbit/README.md) | Frontend corto |

---

## 13. 🛠️ Stack

| Capa | Badge | Tecnologías |
|------|:-----:|-------------|
| Frontend | ![fe](https://img.shields.io/badge/FE-8B5CF6?style=flat-square) | React 19 · Vite 6 · TS · Tailwind 4 · Motion · Google OAuth |
| Backend | ![be](https://img.shields.io/badge/BE-D946EF?style=flat-square) | Express · TS · pg · JWT · ExcelJS · Nodemailer |
| Database | ![db](https://img.shields.io/badge/DB-06B6D4?style=flat-square) | PostgreSQL · Cloud SQL · multi-schema |
| Infra | ![cloud](https://img.shields.io/badge/Cloud-4285F4?style=flat-square) | Cloud Run · Cloud Build · Secret Manager |

---

<div align="center">

**Orbit** · violet · fuchsia · cyan

*Documento vivo del monorepo. Actualiza esta guía junto con cambios de API, schema o acceso.*

</div>
