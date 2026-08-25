# Orbit — Frontend

SPA de Orbit (React + Vite). Forma parte del monorepo; la documentación completa está en el [README raíz](../README.md).

## Desarrollo

```powershell
cd orbit
copy .env.example .env.local
npm install
npm run dev
```

App en http://localhost:3000 (puerto fijo del script Vite).

### Variables mínimas

| Variable | Ejemplo |
|----------|---------|
| `VITE_API_URL` | `http://localhost:4000/api` |
| `VITE_GOOGLE_CLIENT_ID` | Client ID OAuth web (mismo que `GOOGLE_CLIENT_ID` del API) |

Ver `.env.example` para opciones de import Excel y login local.

El API debe estar corriendo en paralelo (`orbit-api`, puerto 4000 por defecto).

## Scripts

| Comando | Uso |
|---------|-----|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |
| `npm run lint` | `tsc --noEmit` |

## Vistas

Definidas en `src/types.ts` (`NAV_ITEMS`): Command Center, Planta Activa, Carga Académica, Balance carga, Vacantes, Panel informativo, Novedades.

Código de pantallas: `src/components/views/`.

## Despliegue

```powershell
# Desde la raíz del monorepo
.\gcp\deploy-orbit-frontend.ps1
```

Producción: https://orbit-frontend-526995286786.us-central1.run.app
