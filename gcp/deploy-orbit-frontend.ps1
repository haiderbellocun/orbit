# Despliegue frontend Orbit en Cloud Run (desde orbit/).
# Ejecutar desde la raíz del repo:  .\gcp\deploy-orbit-frontend.ps1
#
# VITE_* se inyectan en el BUILD (Vite las embebe en el bundle). En Cloud Run
# --source no sirve --set-env-vars de runtime para VITE_*; usa --set-build-env-vars.

$ErrorActionPreference = "Stop"

$PROJECT = "it-fab-contenido-edu-6"
$REGION = "us-central1"
$SERVICE = "orbit-frontend"
$VITE_API_URL = "https://orbit-backend-526995286786.us-central1.run.app/api"
$VITE_GOOGLE_CLIENT_ID = "526995286786-c292djsqta9pgassddcrlecocpf2rgfo.apps.googleusercontent.com"
$VITE_ALLOW_LOCAL_EMAIL_LOGIN = "true"
# Usar ; (no ,): --set-build-env-vars separa variables por coma.
$VITE_ORBIT_ACCESS_ALLOWLIST = "camilo_quintero@cun.edu.co;haider_bello@cun.edu.co;raul_valencia@cun.edu.co;zuany_acuna@cun.edu.co"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $RepoRoot "orbit")

gcloud config set project $PROJECT

gcloud run deploy $SERVICE `
  --source . `
  --project $PROJECT `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --set-build-env-vars "VITE_API_URL=$VITE_API_URL,VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID,VITE_ALLOW_LOCAL_EMAIL_LOGIN=$VITE_ALLOW_LOCAL_EMAIL_LOGIN,VITE_ORBIT_ACCESS_ALLOWLIST=$VITE_ORBIT_ACCESS_ALLOWLIST"

Write-Host ""
Write-Host "Frontend: https://orbit-frontend-526995286786.us-central1.run.app"
