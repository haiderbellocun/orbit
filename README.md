# Orbit — Documentación completa

Plataforma interna de la **CUN** para operación académica y de planta: Command Center, Planta Activa, Carga Académica, Balance de carga (horas sustantivas), Vacantes, Panel informativo y Novedades (eventos de fuerza laboral).

Monorepo con **frontend React (Vite)** y **API Express + TypeScript + PostgreSQL**, desplegado en **Google Cloud Run**.

| Servicio | URL |
|----------|-----|
| Frontend | https://orbit-frontend-526995286786.us-central1.run.app |
| Backend | https://orbit-backend-526995286786.us-central1.run.app |
| Proyecto GCP | `it-fab-contenido-edu-6` · región `us-central1` |

---

## Tabla de contenidos

1. [Visión general](#1-visión-general)
2. [Estructura del monorepo](#2-estructura-del-monorepo)
3. [Arquitectura](#3-arquitectura)
4. [Frontend (`orbit/`)](#4-frontend-orbit)
5. [Backend (`orbit-api/`)](#5-backend-orbit-api)
6. [Base de datos](#6-base-de-datos)
7. [Autenticación y autorización](#7-autenticación-y-autorización)
8. [Variables de entorno](#8-variables-de-entorno)
9. [Arranque local](#9-arranque-local)
10. [Migraciones, seeds y scripts](#10-migraciones-seeds-y-scripts)
11. [Despliegue](#11-despliegue)
12. [Documentación relacionada](#12-documentación-relacionada)
13. [Stack](#13-stack)

---

## 1. Visión general

Orbit concentra en un solo producto:

| Módulo UI | Qué resuelve |
|-----------|--------------|
| **Command Center** | Métricas de home: docentes activos, vacantes, contrataciones, aging, novedades del día |
| **Planta Activa** | Maestro de personas por área/escuela; alta/edición; al inactivar ciertos roles puede abrir vacante |
| **Carga Académica** | Lectura de proyección ACA (docente × materia × grupo × periodo) |
| **Balance carga** | Horas sustantivas y preparación de clase por persona |
| **Vacantes** | Ciclo de vida operativo + requisición + notas + export Excel + notificaciones |
| **Panel informativo** | Bitácora / audit de vacantes y requisiciones (capability + flag de feature) |
| **Novedades** | Eventos de fuerza laboral (licencias, permisos, etc.) con bitácora de estados |

El backend es la fuente de verdad. El frontend no usa React Router: navega por estado React (`View`) y llama al API con JWT.

---

## 2. Estructura del monorepo

```text
Orbit/
├── README.md                      # Este documento
├── LOGIN_APPS_INTEGRATION.md      # Log central de logins (Nova/Actas/Acervo/Orbit)
├── docs/
│   └── ANS-vacantes.md            # Acuerdo de nivel de servicio — Vacantes
├── gcp/
│   ├── deploy-orbit-all.ps1
│   ├── deploy-orbit-backend.ps1
│   ├── deploy-orbit-frontend.ps1
│   ├── cloudbuild-orbit-*.yaml
│   └── orbit-backend-deploy-flags.yaml
├── orbit/                         # Frontend SPA
│   ├── src/
│   │   ├── App.tsx                # Shell, auth, switch de vistas
│   │   ├── main.tsx
│   │   ├── types.ts
│   │   ├── components/
│   │   │   ├── layout/            # Sidebar, TopBar, CommandPalette, NotificationBell
│   │   │   ├── views/             # Pantallas de negocio
│   │   │   ├── tutorial/          # Tour guiado
│   │   │   └── common/
│   │   ├── lib/                   # api.ts, permissions, helpers
│   │   └── config/                # Brand e iconos
│   ├── Dockerfile
│   └── README.md
└── orbit-api/                     # Backend API
    ├── src/
    │   ├── index.ts               # Express entry
    │   ├── routes/                # Routers HTTP
    │   ├── middleware/            # JWT + capabilities
    │   ├── lib/                   # Capabilities, roles, scopes
    │   ├── services/              # Notify, Excel export, bulk helpers
    │   ├── db/                    # connection, migrate*, seed*, schema*
    │   └── sql/
    ├── docs/                      # auth-google, carga-académica
    ├── scripts/                   # Imports offline, SMTP test, plantillas
    ├── README_DEPLOY.md
    └── Dockerfile
```

---

## 3. Arquitectura

```text
┌─────────────────────┐         HTTPS / JSON          ┌──────────────────────┐
│  orbit (Vite SPA)   │  ───────────────────────────► │  orbit-api (Express)  │
│  React 19 · puerto  │  Authorization: Bearer JWT    │  /api/* · /health     │
│  3000 (local)       │  ◄─────────────────────────── │  puerto 4000 (local)  │
└─────────────────────┘                               └──────────┬───────────┘
         │                                                       │
         │ Google Identity Services                              │ pg.Pool
         ▼                                                       ▼
┌─────────────────────┐                               ┌──────────────────────┐
│  Google OAuth       │                               │  PostgreSQL           │
│  (idToken → API)    │                               │  Cloud SQL / local    │
└─────────────────────┘                               │  schemas: core, …     │
                                                      └──────────────────────┘
```

**Flujo típico de sesión**

1. Usuario inicia sesión con Google (`@cun.edu.co`) en el SPA.
2. Frontend envía `idToken` a `POST /api/auth/google`.
3. API verifica el token, busca `person`, aplica allowlist/grants, firma JWT y responde `{ token, user }`.
4. SPA guarda `orbit_jwt` + `orbit_user` en `localStorage`.
5. Cada request a `/api/*` (salvo auth) lleva el Bearer; el middleware revalida autorización y capabilities.
6. La UI filtra navegación y pantallas según `capabilities`.

**Notificaciones:** al crear una vacante, el API inserta filas en `orbit.notification` y, si hay SMTP configurado, envía correo. El frontend hace polling del unread count (campana).

---

## 4. Frontend (`orbit/`)

### 4.1 Stack y build

| Capa | Tecnología |
|------|------------|
| UI | React 19 + TypeScript |
| Build | Vite 6 (`@vitejs/plugin-react`) |
| Estilos | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Auth UI | `@react-oauth/google` |
| Iconos | `@heroicons/react` |
| Motion | `motion` |
| DnD | `@dnd-kit/*` |
| Markdown | `react-markdown` |
| Fechas | `date-fns` |

- Alias `@` → raíz del proyecto frontend.
- **No hay `server.proxy`**: el navegador llama directo a `VITE_API_URL`.
- Dev: `npm run dev` → puerto **3000**, host `0.0.0.0`.
- Lint: `tsc --noEmit`.

### 4.2 Bootstrap y “routing”

**No usa React Router.** La navegación es `useState<View>` en `App.tsx`.

1. `main.tsx` monta `GoogleOAuthProvider` → `App`.
2. Vista inicial: `login`.
3. Si hay JWT válido en `localStorage`, restaura sesión y capabilities.
4. Tras login: `TutorialProvider` + shell (Sidebar + TopBar + contenido animado + GuidedTour).
5. Si la vista actual no está permitida por capabilities → redirect a `getDefaultView(capabilities)`.
6. Detalle de vacante: estado `selectedVacancy` + vista `vacancy-detail`.

### 4.3 Vistas de negocio

#### En el menú lateral (`NAV_ITEMS`)

| `View` id | Componente | Descripción |
|-----------|------------|-------------|
| `home` | `HomeView` | Command Center: resumen vía `GET /dashboard/summary`, atajos |
| `planta-activa` | `PlantaActivaView` | Listado/alta/edición de personas; filtros; grants por área |
| `academic-load` | `AcademicLoadView` | Carga académica (lectura), filtros y resumen |
| `substantive-hours` | `SubstantiveHoursView` | Balance de carga: categorías, asignaciones, prep. clase |
| `vacancies` | `VacanciesView` | Listado, filtros, chart de estados, modal crear/editar, export Excel |
| `vacancy-informative-panel` | `VacancyInformativePanelView` | Audit log (puede estar deshabilitado por flag de feature) |
| `news` | `NewsView` | Novedades / workforce events |

#### Otras vistas (switch de `App`, no siempre en nav)

| `View` id | Componente | Notas |
|-----------|------------|-------|
| `login` | `LoginView` | Google + email local (dev) |
| `vacancy-detail` | `VacancyDetailView` | Detalle, historial, notas, admin |
| `reinstatements` | `ReinstatementsView` | Reintegros (capability de vacantes) |
| `audit` | `AuditView` | UI mock / legacy |
| `programs` | `ProgramsView` | Demo de programas |

Soportes: `VacancyManageModal`, `VacancyStatusChart`.

### 4.4 Layout

| Componente | Rol |
|------------|-----|
| `Sidebar` | Navegación filtrada por capabilities; expand/collapse; drawer móvil |
| `TopBar` | Menú móvil, atajo búsqueda (⌘/Ctrl+K), tutorial, campana, logout |
| `Header` | Título / subtítulo / acciones de página |
| `CommandPalette` | Búsqueda de vistas + personas + vacantes (según caps) |
| `NotificationBell` | Poll unread ~60s; marcar leídas; deep-link a vacante |

### 4.5 Capas `lib/` y permisos UI

| Archivo | Rol |
|---------|-----|
| `lib/api.ts` | Cliente HTTP, base URL, sesión JWT, tipado de respuestas, todos los endpoints usados por la UI |
| `lib/permissions.ts` | Constantes de capability, `canAccessView`, `filterNavItems`, `getDefaultView`, helpers admin vacantes |
| `lib/plantaActivaAccess.ts` | Fallback de grants por correo (áreas view/edit) si el JWT no trae detalle |
| `lib/vacancyFormHelpers.ts` | Labels de estado, reglas de bloqueo terminal, URL Zoho REQ |
| `lib/vacancyActiveDays.ts` | Días activos (timezone America/Bogota) |
| `lib/workforceEventLabels.ts` | Labels/badges de estados de novedades |
| `lib/tutorialStorage.ts` | Persistencia del tour por email |
| `lib/plantaPendingFilters.ts` | Handoff de filtros Home → Planta (sessionStorage) |
| `config/brand.tsx` | Nombre, logos, colores, mapa de iconos |

**Sesión en `localStorage`:** `orbit_jwt`, `orbit_user`. Ante `401` del API se limpia la sesión.

### 4.6 Login en UI

- **Google:** `GoogleLogin` → `POST /api/auth/google` con `{ idToken }` → guarda token/user.
- **Email local:** visible si `import.meta.env.DEV` o `VITE_ALLOW_LOCAL_EMAIL_LOGIN=true` → `POST /api/auth/local-email` (el API debe permitirla).

### 4.7 Tipos principales (`types.ts`)

- `View` — ids de pantallas.
- `PlantaPerson` — fila de planta (documento, emails, área/escuela/programa/rol, `can_edit`).
- `Vacancy` / `VacancyDetail` — vacante + requisición + historial + notas.
- `VacancyOperationStatus` — `open` | `selected` | `requisition_sent` | `internal_movement` | `hired` | `closed` | `cancelled` | `cancelled_by_capital`.
- `OrbitNotification` — campana in-app.
- Tipos adicionales de API en `lib/api.ts` (dashboard, catalogs, substantive hours, workforce events).

---

## 5. Backend (`orbit-api/`)

### 5.1 Entry point (`src/index.ts`)

Orden de montaje:

| # | Middleware / router | Notas |
|---|---------------------|-------|
| 1 | `cors()` | CORS por defecto del paquete (permisivo) |
| 2 | `express.json()` | Body JSON |
| 3 | `authRouter` → `/api` | Público (login) |
| 4 | `orbitAuthMiddleware` | JWT obligatorio en el resto de `/api` |
| 5 | `orbitCapabilityByPathMiddleware` | Capability por prefijo de path |
| 6 | Routers de negocio → `/api` | Ver tabla abajo |

- **`GET /health`** (fuera de `/api`, sin auth): comprueba pool DB → `200` o `503`.
- Al arrancar ejecuta `runStartupSchemaPatches()` (idempotente; si falla, loguea y sigue escuchando).

Puerto: `PORT` o **4000**.

### 5.2 Middleware de auth

**Extracción del token**

1. Header `Authorization: Bearer <jwt>`
2. Solo en GET: query `?access_token=` (p. ej. EventSource)

**Verificación**

- Firma con `JWT_SECRET`.
- Payload con `orbitAccess` ∈ `lite` | `full` | `school`.
- En el modelo **reborn** actual, las capabilities se **re-resuelven por email** en cada request (no se confía solo en claims del JWT):
  - Allowlist Orbit → capabilities de super-admin
  - Grant Planta Activa → `view:planta_activa` + extras + áreas view/edit
  - Allowlist admin vacantes → capabilities de vacantes/admin

**Capability por path**

| Prefijo | Capability requerida |
|---------|----------------------|
| `/catalog` | Cualquier usuario autenticado |
| `/personal` | `view:news` o `view:home` |
| `/dashboard` | `view:home` |
| `/planta-activa` | `view:planta_activa` |
| `/vacancies`, `/reinstatements` | `view:vacancies` |
| `/academic-load` | `view:academic_load` |
| `/substantive-hours` | `view:substantive_hours` |
| `/workforce-events` | `view:news` |
| `/notifications` | Solo autenticación (sin check de path) |

Sin capability → `403`.

### 5.3 Endpoints por dominio

Todos bajo **`/api`** salvo `/health`.

#### Auth (`routes/auth.ts`) — sin JWT

| Método | Path | Propósito |
|--------|------|-----------|
| POST | `/auth/google` | Login con `{ idToken }` → `{ token, user }` |
| POST | `/auth/google/gis-callback` | Callback GIS / redirect al frontend |
| POST | `/auth/local-email` | Login por email (solo si `NODE_ENV=development` o `ALLOW_LOCAL_EMAIL_AUTH`) |

Reglas: dominio `@cun.edu.co` (Google); persona activa en catálogo; autorización Orbit (allowlist / planta / vacancy-admin). Registra login en `logs.login_apps`.

#### Dashboard

| Método | Path | Propósito |
|--------|------|-----------|
| GET | `/dashboard/summary` | Métricas del Command Center |

#### Catálogo

| Método | Path | Propósito |
|--------|------|-----------|
| GET | `/catalog/areas` | Áreas activas |
| GET | `/catalog/schools` | Escuelas (`area_id` opcional) |
| GET | `/catalog/programs` | Programas |
| GET | `/catalog/academic-lines` | Líneas académicas distintas |
| GET | `/catalog/roles` | Roles activos |

#### Personal / Planta Activa / Novedades

| Método | Path | Propósito |
|--------|------|-----------|
| GET | `/personal` | Picker paginado de personas (Novedades) |
| GET | `/planta-activa` | Listado filtrado/paginado |
| GET | `/planta-activa/:id` | Detalle |
| POST | `/planta-activa` | Alta (puede crear vacante + notify) |
| PATCH | `/planta-activa/:id` | Edición; inactivar puede abrir vacante (omite docente/LITE/LIDER) |
| GET/POST/PATCH | `/workforce-events/...` | Tipos, eventos, status-log |

Estados de evento: `PENDING` | `APPROVED` | `REJECTED` | `TAKEN` | `NOT_TAKEN` | `CANCELLED`.

#### Notificaciones

| Método | Path | Propósito |
|--------|------|-----------|
| GET | `/notifications` | Lista (unreadOnly, limit) |
| GET | `/notifications/unread-count` | Contador |
| PATCH | `/notifications/:id/read` | Marcar una |
| PATCH | `/notifications/read-all` | Marcar todas |

#### Vacantes

| Método | Path | Propósito |
|--------|------|-----------|
| GET | `/vacancies` | Listado |
| GET | `/vacancies/export.xlsx` | Export Excel |
| POST | `/vacancies` | Crear + notify |
| GET | `/vacancies/audit-log` | Panel informativo |
| GET | `/vacancies/:id` | Detalle (UUID o `public_id`) |
| PATCH | `/vacancies/:id` | Actualizar (bloqueado si estado terminal) |
| PATCH | `/vacancies/:id/close` | Cierre (`hired` / `closed` / `cancelled` / `cancelled_by_capital`) |
| POST | `/vacancies/:id/operation-notes` | Notas operativas |
| POST/PATCH | `/vacancies/:id/requisition` | Requisición |
| DELETE | `/vacancies/:id` | Eliminar (`vacancies:admin`) |
| PATCH | `/vacancies/:id/admin-status` | Cambio forzado de estado (`vacancies:admin`) |

#### Reintegros / Carga / Horas sustantivas

| Método | Path | Propósito |
|--------|------|-----------|
| GET/PUT | `/reinstatements`, `/reinstatements/:id` | Listado y actualización |
| GET | `/academic-load`, `/summary`, `/filter-options`, `/teacher/:document` | Lectura de carga |
| GET/POST/PUT | `/substantive-hours/...` | Categorías, docentes, asignaciones, class-preparation |

### 5.4 Libs clave (`src/lib/`)

| Módulo | Responsabilidad |
|--------|-----------------|
| `orbitCapabilities.ts` | Códigos de capability, allowlists (`ORBIT_ACCESS_ALLOWLIST`, `ORBIT_VACANCY_ADMIN_ALLOWLIST`), mapas de roles (modelo histórico), `SUPER_ADMIN_CAPABILITIES` |
| `plantaActivaAccess.ts` | Grants hardcodeados email → áreas view/edit + capabilities extra |
| `orbitRoles.ts` | Detección LITE/DOCENTE; skip de vacante al inactivar; helpers SQL |
| `newsScope.ts` | Alcance de novedades: `full` / `school` / `area` / `areas` |
| `schoolScope.ts` | Filtro por escuela cuando `orbitAccess === "school"` |
| `coreSchema.ts` | Resuelve si el catálogo vive en `core.*` o `public.*` |

### 5.5 Services (`src/services/`)

| Servicio | Uso |
|----------|-----|
| `vacancyNotifyService.ts` | In-app + email al crear vacante |
| `vacancyEmailTemplate.ts` | Plantilla de correo |
| `vacancyExcelExport.ts` | Workbook ExcelJS para export |
| `catalogService.ts` | Find-or-create de catálogo (scripts/bulk; no router HTTP) |
| `academicWorkloadBulkService.ts` | Upserts de carga (scripts offline) |
| `substantiveCategoryBulkService.ts` | Upsert categorías |

### 5.6 Import / Excel

- **HTTP export:** `GET /api/vacancies/export.xlsx`.
- **No hay endpoint HTTP de upload** de Excel en los routers actuales (aunque existan dependencias `multer`/`xlsx`).
- Cargas masivas: scripts en `orbit-api/scripts/` y seeds que leen Excel local.
- Auditoría histórica de imports docentes: tabla `logs.logs_orbit_docentes`.

### 5.7 Errores HTTP habituales

| Código | Uso típico |
|--------|------------|
| 400 | Validación / id inválido |
| 401 | JWT ausente/inválido o email no autorizado |
| 403 | Sin capability / dominio / alcance |
| 404 | Recurso inexistente o local-email deshabilitado |
| 409 | Conflicto (documento duplicado, vacante bloqueada) |
| 500 | Error no controlado |
| 503 | Health / catálogo CORE no disponible |

No hay error middleware global: cada handler hace `try/catch`.

---

## 6. Base de datos

PostgreSQL. En Cloud Run suele usarse **Cloud SQL** con socket Unix (`DB_HOST=/cloudsql/PROJECT:REGION:INSTANCE`) o host TCP + SSL.

### 6.1 Conexión (`src/db/connection.ts`)

| Variable | Rol |
|----------|-----|
| `DB_HOST` | Host o socket Cloud SQL |
| `DB_PORT` | Default `5432` |
| `DB_USER` / `DB_USERNAME` | Usuario |
| `DB_PASSWORD` | Password (Secret Manager en prod) |
| `DB_NAME` | Nombre de la base (ej. `core`) |
| `DB_SCHEMA` | Primer schema del `search_path` (ej. `core` o `public`) |
| `DB_SSL` | Forzar TLS |
| `DB_CONNECTION_TIMEOUT_MS` | Default 15000 |
| `DB_POOL_MAX` | Default 10 |

- Pool `pg.Pool`.
- `search_path=${DB_SCHEMA},public`.
- SSL: heurística para remoto/Cloud SQL; socket Unix solo si `DB_SSL=true`.
- El código detecta si el catálogo está en schema `core` o `public` (`coreSchema.ts`).

### 6.2 Esquemas lógicos

| Schema | Origen | Dominio |
|--------|--------|---------|
| `core` | Dump + `migrate:core` | Catálogo institucional y personas |
| `academic_workload` | Dump + migraciones puntuales | Materias, grupos, carga académica |
| `substantive_hours` | Dump + migraciones rename/person | Categorías y asignaciones de horas |
| `vacancies` | Migraciones `migrate:vacancies*` | Vacantes, REQ, notas, audit |
| `workforce_events` | `migrate:workforce-events` | Novedades |
| `orbit` | `migrate:notifications` | Notificaciones in-app |
| `logs` | `migrate:audit`, `migrate:login-apps` | Auditoría imports + login apps |
| `public` | Legacy `schema.sql` / v2 / v3 | Tablas antiguas (teachers, etc.) |

> El dump `generated_schema_dump.sql` / `gcp_schema_migration.sql` cubre sobre todo `academic_workload`, `core`, `logs`, `substantive_hours`. Los schemas `vacancies`, `workforce_events` y `orbit` se aplican con migraciones posteriores.

### 6.3 Catálogo CORE (resumen)

| Tabla | Rol |
|-------|-----|
| `area` | Áreas organizacionales |
| `school` | Escuelas (FK área) |
| `program` | Programas (FK escuela) |
| `role` / `role_permission` | Roles y permisos de catálogo |
| `person` | Maestro de personas (documento/email únicos; FKs org; `is_active`) |
| `user` | Cuenta vinculada a `person` (auth provider) |
| `city`, `contract_type`, `hierarchy` | Catálogos auxiliares |
| `campus`, `region` | Presentes en dump (no siempre creados por `migrate_core`) |
| `person_program_assignments` | Programas[] + línea académica por persona (`migrate_core`) |

`person` es el hub: login, planta, vacantes (`created_by`), carga, horas sustantivas, novedades y notificaciones apuntan a ella.

### 6.4 Carga académica (`academic_workload`)

| Tabla | Rol |
|-------|-----|
| `subject` | Materias (`subject_code` PK) |
| `class_group` | Grupo por materia (`subject_code` + `group_code`) |
| `class_preparation` | Horas de preparación por persona |
| `academic_load` | Hecho: persona × periodo × materia × grupo (+ geo, programa, horas sustantivas, `aca_group_id`) |

API de lectura únicamente. Detalle BI: [`orbit-api/docs/carga-academica.md`](orbit-api/docs/carga-academica.md).

### 6.5 Horas sustantivas (`substantive_hours`)

| Tabla | Rol |
|-------|-----|
| `category` | Catálogo de categorías |
| `assignment` | Persona × categoría × horas |
| `assignment_task` | Tareas de una asignación |

Histórico de renombres: `project` → `category`, etc. (`migrate:substantive-hours-rename`).

### 6.6 Vacantes (`vacancies`)

| Tabla | Rol |
|-------|-----|
| `vacancy` | Vacante (UUID + `public_id`, org FKs, cargo, cantidades, `operation_status`, manager) |
| `requisition` | 1:1 con vacante; cumplimiento (terna, PDA, …); `capital_notes` |
| `vacancy_operation_note` | Notas operativas append-only |
| `vacancy_status_history` | Historial de cambios de estado (trigger) |
| `vacancy_change_log` | Audit INSERT/UPDATE/DELETE (retención aunque se borre la vacante) |

**Estados `operation_status`:**  
`open` → `selected` → `requisition_sent` → `internal_movement` → `hired` | `closed` | `cancelled` | `cancelled_by_capital`

Constraints: `quantity > 0`, `0 ≤ hired_quantity ≤ quantity`.

### 6.7 Novedades (`workforce_events`)

| Tabla | Rol |
|-------|-----|
| `event_type` | Catálogo (seed: LICENCIA, PERMISO, SANCION, INCAPACIDAD, OTRO) |
| `event` | Evento ligado a persona + tipo + fechas + status |
| `event_status_log` | Bitácora de estados |

### 6.8 Notificaciones y logs

| Tabla | Rol |
|-------|-----|
| `orbit.notification` | Campana in-app (`type`, `payload` JSONB, `read_at`) |
| `logs.logs_orbit_docentes` | Resumen de imports docentes (JSONB) |
| `logs.login_apps` | Logins centrales: `correo`, `fecha`, `hora`, `app_login` ∈ actas\|orbit\|nova\|acervo |

### 6.9 Legacy `public`

Tablas antiguas (`coordinators`, `teachers`, `vacancies`, `reinstatements`, `news`, `lites`, `academic_load` plana) vía `schema.sql` / `schema_v2.sql`. Los seeds Excel apuntan a este modelo legacy; el producto actual usa los schemas de sección 6.3–6.8.

### 6.10 Diagrama conceptual (simplificado)

```text
core.area ──< core.school ──< core.program
                │
                └──── core.person ──< core.user
                         │
     ┌───────────────────┼───────────────────────────────┐
     │                   │                               │
     ▼                   ▼                               ▼
academic_workload   vacancies.vacancy            workforce_events.event
.academic_load           │                               │
     │                   ├── requisition                 └── event_status_log
     │                   ├── operation_note
     ▼                   └── status_history / change_log
substantive_hours.assignment
orbit.notification (recipient_person_id → person)
logs.login_apps / logs_orbit_docentes
```

---

## 7. Autenticación y autorización

### 7.1 Capabilities

| Código | Uso |
|--------|-----|
| `view:home` | Command Center |
| `view:planta_activa` | Planta Activa |
| `view:academic_load` | Carga académica |
| `view:substantive_hours` | Balance carga |
| `view:vacancies` | Vacantes / reintegros |
| `vacancies:informative_panel` | Panel informativo |
| `vacancies:admin` | Eliminar / forzar estado |
| `view:news` | Novedades + personal picker |

### 7.2 Modelo actual (reborn)

El acceso **no** se decide solo por `role_id`. Puede entrar quien esté en:

1. `ORBIT_ACCESS_ALLOWLIST` (admin total), o
2. Grant de Planta Activa (`plantaActivaAccess.ts`), o
3. `ORBIT_VACANCY_ADMIN_ALLOWLIST`.

Detalle y modelo histórico por roles: [`orbit-api/docs/auth-google.md`](orbit-api/docs/auth-google.md).

### 7.3 JWT

- Firmado con `JWT_SECRET`, expiración `JWT_EXPIRES_IN` (default `7d`).
- Contiene usuario, rol, capabilities y (según caso) datos de planta/áreas.
- En runtime el middleware **vuelve a calcular** capabilities por email.

---

## 8. Variables de entorno

### Frontend (`orbit/.env.local`)

| Variable | Descripción |
|----------|-------------|
| `VITE_API_URL` | Base del API (ej. `http://localhost:4000/api`) |
| `VITE_GOOGLE_CLIENT_ID` | OAuth web Client ID |
| `VITE_ALLOW_LOCAL_EMAIL_LOGIN` | Mostrar login email fuera de `npm run dev` |
| `VITE_ORBIT_ACCESS_ALLOWLIST` | Opcional: unión de caps admin en cliente |
| `VITE_ORBIT_VACANCY_ADMIN_ALLOWLIST` | Opcional: caps admin vacantes en cliente |
| `GEMINI_API_KEY` | Solo si se usan features Gemini (Vite define) |

Plantilla: [`orbit/.env.example`](orbit/.env.example).

### Backend (`orbit-api/.env`)

| Variable | Descripción |
|----------|-------------|
| `DB_*` | Conexión PostgreSQL (ver §6.1) |
| `PORT` | HTTP local (4000) |
| `GOOGLE_CLIENT_ID` | Mismo Client ID que el frontend |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Sesión |
| `ORBIT_FRONTEND_URL` | Redirect post-login / deep links |
| `ORBIT_ACCESS_ALLOWLIST` | Correos admin total |
| `ORBIT_VACANCY_ADMIN_ALLOWLIST` | Correos admin vacantes |
| `ORBIT_LITE_ROLE_ID` | Id rol LITE en catálogo |
| `ORBIT_FULL_ACCESS_ROLE_IDS` | Modelo histórico por roles |
| `ALLOW_LOCAL_EMAIL_AUTH` | Habilita login email fuera de development |
| `CORS_ORIGIN` | Origen SPA (relevante en deploys con CORS estricto) |
| `SMTP_*` / `VACANCY_NOTIFY_EMAILS` | Correo de vacantes nuevas |

Plantillas: [`orbit-api/.env.example`](orbit-api/.env.example), [`orbit-api/env.production.example`](orbit-api/env.production.example).

**Nunca** commits de `.env` reales ni passwords.

---

## 9. Arranque local

### Backend

```powershell
cd orbit-api
copy .env.example .env
# Completar DB_*, GOOGLE_CLIENT_ID, JWT_SECRET, ORBIT_FRONTEND_URL=http://localhost:3000
npm install
# Aplicar migraciones necesarias según el estado de tu DB (ver §10)
npm run dev
```

Salud: `curl http://127.0.0.1:4000/health`

### Frontend

```powershell
cd orbit
copy .env.example .env.local
# VITE_API_URL=http://localhost:4000/api
# VITE_GOOGLE_CLIENT_ID=<mismo Client ID>
npm install
npm run dev
```

Abrir http://localhost:3000

---

## 10. Migraciones, seeds y scripts

### Migraciones (`orbit-api`)

| npm script | Efecto |
|------------|--------|
| `migrate` | Legacy `schema.sql` |
| `migrate:v2` / `migrate:v3` | Legacy lites + columnas teachers |
| `migrate:core` | Catálogo CORE + `person_program_assignments` + `is_active` |
| `migrate:audit` | `logs.logs_orbit_docentes` |
| `migrate:login-apps` | `logs.login_apps` |
| `migrate:vacancies` (+ updates / public-ids / audit-retention / manager-length) | Schema vacantes completo |
| `migrate:workforce-events` | Novedades |
| `migrate:notifications` | `orbit.notification` |
| `migrate:person-is-active` | `person.is_active` |
| `migrate:substantive-hours-person` / `rename` | Modelo horas sustantivas |
| `migrate:academic-load-aca-group-id` | Columna `aca_group_id` |

Al boot: `startupSchemaPatches.ts` (manager length, `hired_quantity`, `internal_movement`, secuencia `user.id`).

### Seeds

`seed` … `seed:v4` cargan Excel legacy hacia tablas `public` antiguas (ruta hardcodeada en scripts). No son el camino principal del schema actual de vacantes/carga.

### Otros

| Comando | Uso |
|---------|-----|
| `npm test` | Capabilities + validación carga académica |
| `npm run test:smtp` | Prueba SMTP |
| `npm run template:person` | Plantilla Excel personas |
| Scripts en `scripts/` | Imports JSON/Excel offline |

---

## 11. Despliegue

Desde la **raíz del monorepo**:

```powershell
.\gcp\deploy-orbit-backend.ps1
.\gcp\deploy-orbit-frontend.ps1
# o:
.\gcp\deploy-orbit-all.ps1
```

- Frontend y backend son servicios Cloud Run separados.
- Secrets (`DB_PASSWORD`, SMTP, etc.) en Secret Manager / config del servicio.
- Checklist de errores (PORT, CORS, Cloud SQL, 413 en Excel grandes): [`orbit-api/README_DEPLOY.md`](orbit-api/README_DEPLOY.md).

Cloud Build: `gcp/cloudbuild-orbit-backend.yaml`, `gcp/cloudbuild-orbit-frontend.yaml`.

---

## 12. Documentación relacionada

| Documento | Contenido |
|-----------|-----------|
| [orbit-api/docs/auth-google.md](orbit-api/docs/auth-google.md) | Login Google, JWT, capabilities, allowlist, roles históricos |
| [orbit-api/docs/carga-academica.md](orbit-api/docs/carga-academica.md) | Modelo y métricas de carga académica (BI) |
| [docs/ANS-vacantes.md](docs/ANS-vacantes.md) | ANS del ciclo de vacantes |
| [orbit-api/README_DEPLOY.md](orbit-api/README_DEPLOY.md) | Deploy Cloud Run en detalle |
| [LOGIN_APPS_INTEGRATION.md](LOGIN_APPS_INTEGRATION.md) | Integración `logs.login_apps` en otras apps |
| [orbit/README.md](orbit/README.md) | Resumen corto del frontend |
| `orbit-api/src/lib/plantaActivaAccess.ts` | Grants Planta Activa por correo |

---

## 13. Stack

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 19, Vite 6, TypeScript, Tailwind 4, Motion, Google OAuth, dnd-kit |
| Backend | Express, TypeScript, `pg`, JWT, Google Auth Library, ExcelJS, Nodemailer |
| Base de datos | PostgreSQL (Cloud SQL en prod), schemas multi-dominio |
| Infra | Cloud Run, Artifact Registry / deploy `--source`, Secret Manager, Cloud Build |

---

*Documento vivo del monorepo Orbit. Si cambias contratos de API, schemas o el modelo de acceso, actualiza esta guía y los docs enlazados en la misma PR.*
