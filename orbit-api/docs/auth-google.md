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
    "roleCode": "ADMIN",
    "roleName": "ADMIN"
  }
}
```

### Requisitos

- `GOOGLE_CLIENT_ID`: el Client ID de tu app en Google.
- `JWT_SECRET`: secreto para firmar JWT.
- `JWT_EXPIRES_IN` (opcional): por defecto `7d`.

### Nota sobre usuarios permitidos

Este API permite login **a cualquier cuenta `@cun.edu.co`** verificada por Google.

Si el email no termina en `@cun.edu.co`, el endpoint responde **403**.

Si existe una fila en `person` con `email` o `edu_email` igual al email del token, el
JWT incluirá `personId` y `role` (si aplica). Si no existe, `personId` será `null`.
