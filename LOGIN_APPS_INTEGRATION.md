# Login central — integración en Nova / Actas / Acervo

Tabla destino (ya existe en DB Orbit/core):

`logs.login_apps (id, correo, fecha, hora, app_login)`

`app_login` permitido: `actas` | `orbit` | `nova` | `acervo`

Fecha/hora se guardan en timezone `America/Bogota`.
Duplicados OK (cada login = una fila).

---

## 1) Variables de entorno (las 3 apps)

Apuntan a la DB de **Orbit** (no a la DB local de cada app):

```env
LOGIN_LOGS_DB_HOST=136.113.128.135
LOGIN_LOGS_DB_PORT=5432
LOGIN_LOGS_DB_NAME=core
LOGIN_LOGS_DB_USER=user-core
LOGIN_LOGS_DB_PASSWORD=1h1l3.o3<Vtd:N"D
LOGIN_LOGS_DB_SSL=true
```

Usar el password de Orbit de `.env.apps` (bloque ORBIT).

---

## 2) NOVA (NestJS)

### Archivo nuevo: `src/auth/central-login-log.service.ts`

```ts
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

@Injectable()
export class CentralLoginLogService implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("LOGIN_LOGS_DB_HOST");
    if (!host) {
      this.pool = null;
      return;
    }

    const ssl =
      (this.config.get<string>("LOGIN_LOGS_DB_SSL") ?? "true") === "true"
        ? { rejectUnauthorized: false }
        : undefined;

    this.pool = new Pool({
      host,
      port: Number(this.config.get<string>("LOGIN_LOGS_DB_PORT") ?? 5432),
      database: this.config.get<string>("LOGIN_LOGS_DB_NAME") ?? "core",
      user: this.config.get<string>("LOGIN_LOGS_DB_USER"),
      password: String(
        this.config.get<string>("LOGIN_LOGS_DB_PASSWORD") ?? "",
      ).replace(/^'|'$/g, ""),
      ssl,
      max: 2,
      connectionTimeoutMillis: 5000,
    });
  }

  async onModuleDestroy() {
    await this.pool?.end().catch(() => undefined);
  }

  /** Fire-and-forget. No tumba el login si falla. */
  record(email: string, appLogin: "nova" | "actas" | "acervo" | "orbit" = "nova") {
    const correo = String(email ?? "").trim().toLowerCase();
    if (!correo || !this.pool) return;

    void this.pool
      .query(
        `
        INSERT INTO logs.login_apps (correo, fecha, hora, app_login)
        VALUES (
          $1,
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date,
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::time,
          $2
        )
        `,
        [correo, appLogin],
      )
      .catch((error) => {
        console.warn("[CentralLoginLog] No se pudo registrar login:", error);
      });
  }
}
```

### Registrar en el módulo de auth

En `auth.module.ts`:

- importar `CentralLoginLogService`
- agregarlo a `providers`

### Enganchar en `auth.service.ts`

En el constructor:

```ts
private readonly centralLoginLogs: CentralLoginLogService,
```

Dentro de `signUser`, junto al `loginLogs.recordLogin` existente:

```ts
this.centralLoginLogs.record(user.email, "nova");
```

---

## 3) ACTAS (NestJS)

### Archivo nuevo: `src/.../central-login-log.service.ts`

(mismo contenido que Nova; solo cambia el default de `appLogin` a `"actas"` si quieres)

### Enganchar en `AuthService.issueTokenForUser`

Al final, **antes** del `return { accessToken, user: ... }`:

```ts
this.centralLoginLogs.record(scopedUser.email, "actas");
```

Así cubre Google + login DEV (ambos pasan por `issueTokenForUser`).

Opcional: también en `login()` (password), al final antes del return, si quieren auditar ese flujo también:

```ts
this.centralLoginLogs.record(user.email, "actas");
```

---

## 4) ACERVO (Express)

### Archivo nuevo: `server/src/services/centralLoginLog.js` (ajusta la ruta)

```js
import pg from 'pg';

const {
  LOGIN_LOGS_DB_HOST,
  LOGIN_LOGS_DB_PORT = '5432',
  LOGIN_LOGS_DB_NAME = 'core',
  LOGIN_LOGS_DB_USER,
  LOGIN_LOGS_DB_PASSWORD = '',
  LOGIN_LOGS_DB_SSL = 'true',
} = process.env;

let pool = null;

function getPool() {
  if (!LOGIN_LOGS_DB_HOST) return null;
  if (pool) return pool;

  pool = new pg.Pool({
    host: LOGIN_LOGS_DB_HOST,
    port: Number(LOGIN_LOGS_DB_PORT),
    database: LOGIN_LOGS_DB_NAME,
    user: LOGIN_LOGS_DB_USER,
    password: String(LOGIN_LOGS_DB_PASSWORD).replace(/^'|'$/g, ''),
    ssl:
      LOGIN_LOGS_DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  return pool;
}

/** Fire-and-forget. No tumba el login si falla. */
export function recordAppLogin(email, appLogin = 'acervo') {
  const correo = String(email ?? '').trim().toLowerCase();
  const p = getPool();
  if (!correo || !p) return;

  void p
    .query(
      `
      INSERT INTO logs.login_apps (correo, fecha, hora, app_login)
      VALUES (
        $1,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::time,
        $2
      )
      `,
      [correo, appLogin],
    )
    .catch((error) => {
      console.warn('[centralLoginLog] No se pudo registrar login:', error);
    });
}
```

### Enganchar en `POST /google`

Después de `await updateLastAccess(user.id);` y **antes** de firmar cookie / `res.json`:

```js
import { recordAppLogin } from '../services/centralLoginLog.js';

// ...
await updateLastAccess(user.id);
recordAppLogin(user.email, 'acervo');
const token = signToken(userForToken(user));
// ...
```

---

## 5) Verificación rápida (desde Orbit/core)

```sql
SELECT
  id,
  correo,
  to_char(fecha, 'DD-MM-YYYY') AS fecha,
  to_char(hora, 'HH24:MI') AS hora,
  app_login
FROM logs.login_apps
ORDER BY id DESC
LIMIT 20;
```

---

## Notas

- El insert es **async / fire-and-forget**: si la DB de logs falla, el login sigue.
- Orbit ya escribe con `app_login = 'orbit'`.
- Si `LOGIN_LOGS_DB_*` no está configurado, el helper no hace nada (no rompe la app).
- Dependencia: `pg` (Nova/Actas/Acervo suelen tenerla; si no, `npm i pg`).
