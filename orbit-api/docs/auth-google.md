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
    "roleCode": "...",
    "roleName": "...",
    "orbitAccess": "full"
  }
}
```

`orbitAccess` puede ser `"lite"` o `"full"`. Los usuarios LITE solo acceden a docentes y resumen acotado; el resto de roles autorizados tienen `"full"`.

### Requisitos

- `GOOGLE_CLIENT_ID`: el Client ID de tu app en Google.
- `JWT_SECRET`: secreto para firmar JWT.
- `JWT_EXPIRES_IN` (opcional): por defecto `7d`.
- `ORBIT_LITE_ROLE_ID` (opcional): id del rol LITE en `role`; por defecto `9`.

### Dominio de correo

Solo cuentas **`@cun.edu.co`** verificadas por Google. Si el email no cumple, el endpoint responde **403**.

### Autorización ORBIT

Debe existir una fila activa en `person` cuyo `email` o `edu_email` coincida con el del token, y el rol debe ser uno de:

- **LITE** (por `role_id` = `ORBIT_LITE_ROLE_ID` o nombre/código `LITE`)
- **COORDINADOR** (nombre o código que comience con `COORDINADOR`, sin distinguir mayúsculas)
- **AUXILIAR ADMINISTRATIVO DE OPERACIONES**
- **DESARROLLADOR**

Si no hay persona, el rol no está en la lista, o un LITE no tiene `school_id` y al menos un programa (`program_id` o `person_program_assignments.programs_id`), el login responde **403** con un mensaje en español.

### Rutas protegidas

El resto de endpoints bajo `/api` requieren cabecera `Authorization: Bearer <JWT>`. Algunos endpoints adicionales requieren acceso completo (no LITE); un LITE recibirá **403** en esos casos.

### Login por correo (solo desarrollo local)

`POST /api/auth/local-email`

Body:

```json
{ "email": "persona@ejemplo.com" }
```

Misma respuesta que Google (`token` + `user` con `orbitAccess`). No usa Google; busca `person` por `email` o `edu_email` (insensible a mayúsculas), con las **mismas reglas de rol** que el login con Google. **No** exige dominio `@cun.edu.co`.

**No está disponible en producción** salvo configuración explícita. El endpoint responde **404** si está deshabilitado.

Habilitación (cualquiera basta):

- `NODE_ENV=development`, o
- `ALLOW_LOCAL_EMAIL_AUTH=1` (o `true` / `yes`)

En producción usa solo Google. En local, el frontend puede mostrar el formulario cuando corres en modo desarrollo (`import.meta.env.DEV`).
