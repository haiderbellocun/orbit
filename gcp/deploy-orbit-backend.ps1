# Despliegue backend Orbit en Cloud Run (desde orbit-api/).
# Ejecutar desde la raíz del repo:  .\gcp\deploy-orbit-backend.ps1

$ErrorActionPreference = "Stop"

$PROJECT = "it-fab-contenido-edu-6"
$REGION = "us-central1"
$SERVICE = "orbit-backend"
$FRONTEND_URL = "https://orbit-frontend-526995286786.us-central1.run.app"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $RepoRoot "orbit-api")

gcloud config set project $PROJECT

# Redeploys conservan DB/secretos ya configurados en el servicio.
# CORS_ORIGIN debe coincidir con el frontend en producción.
# SMTP y VACANCY_NOTIFY_EMAILS: configurar en Secret Manager y referenciar con
#   --set-secrets o --update-env-vars en el primer despliegue (no commitear contraseñas).
# VACANCY_NOTIFY_EMAILS omitido aquí: las comas rompen --update-env-vars en gcloud.
# Valor por defecto en vacancyNotifyService.ts; para override usar consola/Secret Manager.
gcloud run deploy $SERVICE `
  --source . `
  --project $PROJECT `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --update-env-vars "CORS_ORIGIN=$FRONTEND_URL,ALLOW_LOCAL_EMAIL_AUTH=1,ORBIT_FRONTEND_URL=$FRONTEND_URL,SMTP_SERVICE=gmail,SMTP_HOST=smtp.gmail.com,SMTP_PORT=587"

Write-Host ""
Write-Host "Backend: https://orbit-backend-526995286786.us-central1.run.app"
Write-Host "Health:  https://orbit-backend-526995286786.us-central1.run.app/health"
