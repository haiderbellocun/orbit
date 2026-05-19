# Backend y luego frontend (orden recomendado).
# Ejecutar desde la raíz del repo:  .\gcp\deploy-orbit-all.ps1

$ErrorActionPreference = "Stop"
$GcpDir = $PSScriptRoot

& (Join-Path $GcpDir "deploy-orbit-backend.ps1")
& (Join-Path $GcpDir "deploy-orbit-frontend.ps1")
