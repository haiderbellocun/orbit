# Despliegue frontend Orbit en Cloud Run (desde orbit/).
# Ejecutar desde la raíz del repo:  .\gcp\deploy-orbit-frontend.ps1
#
# VITE_* se inyectan en el BUILD (Vite las embebe en el bundle). En Cloud Run
# --source no sirve --set-env-vars de runtime para VITE_*; usa --set-build-env-vars.

$ErrorActionPreference = "Stop"

$GcpDir = $PSScriptRoot
$RepoRoot = Split-Path -Parent $GcpDir
. (Join-Path $GcpDir "deploy-common.ps1")
$Config = Get-OrbitDeployConfig
Assert-OrbitDeployPrerequisites $Config

$buildVars = @(
  "VITE_API_URL=$($Config.BackendUrl.TrimEnd('/'))/api"
  "VITE_GOOGLE_CLIENT_ID=$($Config.GoogleClientId)"
  "VITE_ALLOW_LOCAL_EMAIL_LOGIN=$($Config.AllowLocalEmailLogin)"
  "VITE_ORBIT_ACCESS_ALLOWLIST=$($Config.OrbitAccessAllowlist -join ';')"
  "VITE_ORBIT_VACANCY_ADMIN_ALLOWLIST=$($Config.OrbitVacancyAdminAllowlist -join ';')"
  "VITE_ORBIT_ROLE_MANAGEMENT_ALLOWLIST=$($Config.OrbitRoleManagementAllowlist -join ';')"
) -join ','

Push-Location (Join-Path $RepoRoot "orbit")
try {
  & gcloud run deploy $Config.FrontendService `
    --source . `
    --project $Config.Project `
    --region $Config.Region `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --set-build-env-vars $buildVars
  if ($LASTEXITCODE -ne 0) { throw "Falló el despliegue del frontend ($LASTEXITCODE)." }
} finally { Pop-Location }

Write-Host ""
Write-Host "Frontend: $($Config.FrontendUrl)"
