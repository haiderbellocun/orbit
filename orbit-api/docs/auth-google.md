## Login con Google (backend `orbit-api`)

### Endpoint

`POST /api/auth/google`

Body:

```json
{ "idToken": "<GOOGLE_ID_TOKEN>" }
```

Respuesta:

```json
{
  "token": "<JWT>",
  "user": {
    "id": 123,
    "personId": 456,
    "email": "user@domain.com",
    "name": "Nombre Apellido",
    "roleId": 1,
    "roleCode": "...",
    "roleName": "...",
    "orbitAccess": "full",
    "capabilities": ["view:home", "view:teachers", "..."]
  }
}
```

`orbitAccess` puede ser `"lite"` o `"full"`. El JWT incluye `roleId`, `capabilities` (lista explícita de vistas/API permitidas) y, para LITE, `schoolId` y `programIds`.

### Requisitos

- `GOOGLE_CLIENT_ID`: el Client ID de tu app en Google.
- `JWT_SECRET`: secreto para firmar JWT.
- `JWT_EXPIRES_IN` (opcional): por defecto `7d`.
- `ORBIT_LITE_ROLE_ID` (opcional): id del rol LITE en `role`; por defecto `9`.
- `ORBIT_FULL_ACCESS_ROLE_IDS` (opcional): ids con acceso total separados por coma; por defecto `1,13,19,43,44,45,46`.

### Dominio de correo

Solo cuentas **`@cun.edu.co`** verificadas por Google. Si el email no cumple, el endpoint responde **403**.

### Autorización ORBIT (lista cerrada)

Debe existir una fila activa en `person` cuyo `email` o `edu_email` coincida con el del token, y el rol debe estar explícitamente autorizado:

- **Acceso total** (`orbitAccess: "full"`, todas las capabilities): `role_id` en `ORBIT_FULL_ACCESS_ROLE_IDS` (p. ej. 1, **10**, 13, 19, 43–46).
- **Rol 9 (operaciones)**: todos los paneles + datos completos (equivalente a acceso total en módulos actuales).
- **Roles 37 y 38**: solo panel Vacantes (`view:vacancies`).
- **LITE** (`orbitAccess: "lite"`): `role_id` = `ORBIT_LITE_ROLE_ID` (si no es 9) o nombre/código `LITE` / `LIDER`, con `school_id` y al menos un programa (`program_id` o `person_program_assignments.programs_id`). El `role_id` 9 en login ORBIT usa el perfil operaciones, no LITE.

Cualquier otro rol (p. ej. coordinador académico no listado) recibe **403** hasta agregarse al mapa de roles en `orbitCapabilities.ts` o en variables de entorno.

### Capabilities (vistas / APIs)

| Código | Uso |
|--------|-----|
| `view:home` | Dashboard |
| `view:teachers` | Docentes |
| `view:academic_load` | Carga académica |
| `view:coordinators` | Coordinadores |
| `view:lites` | LITEs |
| `view:vacancies` | Vacantes |

La carga masiva (`/api/import/*`) exige `view:teachers` y acceso distinto de LITE (`orbitAccess: "full"`).

### Rutas protegidas

El resto de endpoints bajo `/api` requieren cabecera `Authorization: Bearer <JWT>` con `capabilities` válidas. Sin la capability correspondiente, el cliente recibe **403**.

### Login por correo (solo desarrollo local)

`POST /api/auth/local-email`

Body:

```json
{ "email": "persona@ejemplo.com" }
```

Misma respuesta que Google (`token` + `user` con `orbitAccess` y `capabilities`). No usa Google; busca `person` por `email` o `edu_email` (insensible a mayúsculas), con las **mismas reglas de rol** que el login con Google. **No** exige dominio `@cun.edu.co`.

**No está disponible en producción** salvo configuración explícita. El endpoint responde **404** si está deshabilitado.

Habilitación (cualquiera basta):

- `NODE_ENV=development`, o
- `ALLOW_LOCAL_EMAIL_AUTH=1` (o `true` / `yes`)

En producción usa solo Google. En local, el frontend puede mostrar el formulario cuando corres en modo desarrollo (`import.meta.env.DEV`).
