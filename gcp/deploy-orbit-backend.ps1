# Despliegue backend Orbit en Cloud Run (desde orbit-api/).
# Ejecutar desde la raíz del repo:  .\gcp\deploy-orbit-backend.ps1

$ErrorActionPreference = "Stop"

$GcpDir = $PSScriptRoot
$RepoRoot = Split-Path -Parent $GcpDir
. (Join-Path $GcpDir "deploy-common.ps1")
$Config = Get-OrbitDeployConfig
Assert-OrbitDeployPrerequisites $Config

# Redeploys conservan DB/secretos ya configurados en el servicio.
# CORS_ORIGIN debe coincidir con el frontend en producción.
# SMTP y VACANCY_NOTIFY_EMAILS: configurar en Secret Manager y referenciar con
#   --set-secrets o --update-env-vars en el primer despliegue (no commitear contraseñas).
# Env vars vía --flags-file (YAML): las comas de VACANCY_NOTIFY_EMAILS rompen --update-env-vars en PowerShell.
$DeployFlagsFile = New-OrbitBackendFlagsFile $Config
try {
  Push-Location (Join-Path $RepoRoot "orbit-api")
  try {
    & gcloud run deploy $Config.BackendService `
      --source . `
      --project $Config.Project `
      --region $Config.Region `
      --platform managed `
      --allow-unauthenticated `
      --port 8080 `
      --flags-file $DeployFlagsFile
    if ($LASTEXITCODE -ne 0) { throw "Falló el despliegue del backend ($LASTEXITCODE)." }
  } finally { Pop-Location }
} finally {
  if (Test-Path -LiteralPath $DeployFlagsFile) { Remove-Item -LiteralPath $DeployFlagsFile -Force }
}

Write-Host ""
Write-Host "Backend: $($Config.BackendUrl)"
Write-Host "Health:  $($Config.BackendUrl.TrimEnd('/'))/health"
