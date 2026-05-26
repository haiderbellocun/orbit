# Despliegue backend Orbit en Cloud Run (desde orbit-api/).
# Ejecutar desde la raíz del repo:  .\gcp\deploy-orbit-backend.ps1

$ErrorActionPreference = "Stop"

$PROJECT = "it-fab-contenido-edu-6"
$REGION = "us-central1"
$SERVICE = "orbit-backend"
$FRONTEND_URL = "https://orbit-frontend-526995286786.us-central1.run.app"

$GcpDir = $PSScriptRoot
$RepoRoot = Split-Path -Parent $GcpDir
Set-Location (Join-Path $RepoRoot "orbit-api")

gcloud config set project $PROJECT

# Redeploys conservan DB/secretos ya configurados en el servicio.
# CORS_ORIGIN debe coincidir con el frontend en producción.
# SMTP y VACANCY_NOTIFY_EMAILS: configurar en Secret Manager y referenciar con
#   --set-secrets o --update-env-vars en el primer despliegue (no commitear contraseñas).
# Env vars vía --flags-file (YAML): las comas de VACANCY_NOTIFY_EMAILS rompen --update-env-vars en PowerShell.
$DeployFlagsFile = Join-Path $GcpDir "orbit-backend-deploy-flags.yaml"
gcloud run deploy $SERVICE `
  --source . `
  --project $PROJECT `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --flags-file $DeployFlagsFile

Write-Host ""
Write-Host "Backend: https://orbit-backend-526995286786.us-central1.run.app"
Write-Host "Health:  https://orbit-backend-526995286786.us-central1.run.app/health"
