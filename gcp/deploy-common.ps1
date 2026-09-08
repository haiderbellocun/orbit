Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-OrbitDeployConfig {
  param([string]$ConfigPath = (Join-Path $PSScriptRoot "orbit-deploy.config.psd1"))

  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "No existe el archivo de configuración: $ConfigPath"
  }
  $config = Import-PowerShellDataFile -LiteralPath $ConfigPath

  # Overrides útiles para CI u otro proyecto, sin editar archivos versionados.
  $overrides = @{
    Project = "ORBIT_GCP_PROJECT"
    Region = "ORBIT_GCP_REGION"
    BackendService = "ORBIT_BACKEND_SERVICE"
    FrontendService = "ORBIT_FRONTEND_SERVICE"
    BackendUrl = "ORBIT_BACKEND_URL"
    FrontendUrl = "ORBIT_FRONTEND_URL"
    GoogleClientId = "ORBIT_GOOGLE_CLIENT_ID"
    DbSchema = "ORBIT_DB_SCHEMA"
  }
  foreach ($key in $overrides.Keys) {
    $value = [Environment]::GetEnvironmentVariable($overrides[$key])
    if (-not [string]::IsNullOrWhiteSpace($value)) { $config[$key] = $value.Trim() }
  }

  foreach ($required in @("Project", "Region", "BackendService", "FrontendService", "BackendUrl", "FrontendUrl", "GoogleClientId", "DbSchema")) {
    if ([string]::IsNullOrWhiteSpace([string]$config[$required])) {
      throw "Falta '$required' en $ConfigPath"
    }
  }
  return $config
}

function Assert-OrbitDeployPrerequisites {
  param([hashtable]$Config)
  if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw "gcloud no está instalado o no está disponible en PATH."
  }
  $account = (& gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($account)) {
    throw "No hay una cuenta activa de gcloud. Ejecuta: gcloud auth login"
  }
  Write-Host "Cuenta:  $account"
  Write-Host "Proyecto: $($Config.Project)"
  Write-Host "Región:   $($Config.Region)"
}

function ConvertTo-YamlScalar {
  param([AllowEmptyString()][string]$Value)
  return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

function New-OrbitBackendFlagsFile {
  param([hashtable]$Config)
  $path = Join-Path ([IO.Path]::GetTempPath()) ("orbit-deploy-{0}.yaml" -f ([guid]::NewGuid().ToString("N")))
  $envVars = [ordered]@{
    NODE_ENV = "production"
    CORS_ORIGIN = $Config.FrontendUrl.TrimEnd('/')
    ORBIT_FRONTEND_URL = $Config.FrontendUrl.TrimEnd('/')
    DB_SCHEMA = $Config.DbSchema
    ALLOW_LOCAL_EMAIL_AUTH = $Config.AllowLocalEmailAuth
    ORBIT_ACCESS_ALLOWLIST = ($Config.OrbitAccessAllowlist -join ',')
    ORBIT_VACANCY_ADMIN_ALLOWLIST = ($Config.OrbitVacancyAdminAllowlist -join ',')
    ORBIT_ROLE_MANAGEMENT_ALLOWLIST = ($Config.OrbitRoleManagementAllowlist -join ',')
    SMTP_SERVICE = "gmail"
    SMTP_HOST = "smtp.gmail.com"
    SMTP_PORT = "587"
    VACANCY_NOTIFY_EMAILS = ($Config.VacancyNotifyEmails -join ',')
  }
  $lines = [Collections.Generic.List[string]]::new()
  $lines.Add("--update-env-vars:")
  foreach ($entry in $envVars.GetEnumerator()) {
    $lines.Add("  $($entry.Key): $(ConvertTo-YamlScalar ([string]$entry.Value))")
  }
  [IO.File]::WriteAllLines($path, $lines, [Text.UTF8Encoding]::new($false))
  return $path
}
