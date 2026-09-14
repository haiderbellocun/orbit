@{
  # Configuración NO secreta y versionada para todos los despliegues.
  Project = "it-fab-contenido-edu-6"
  Region = "us-central1"

  BackendService = "orbit-backend"
  FrontendService = "orbit-frontend"
  BackendUrl = "https://orbit-backend-526995286786.us-central1.run.app"
  FrontendUrl = "https://orbit-frontend-526995286786.us-central1.run.app"

  GoogleClientId = "526995286786-c292djsqta9pgassddcrlecocpf2rgfo.apps.googleusercontent.com"
  DbSchema = "core"

  # Acceso total. Sara, Cindy y Lorena NO van aquí: su grant especial excluye Carga y Balance.
  OrbitAccessAllowlist = @(
    "camilo_quintero@cun.edu.co"
    "haider_bello@cun.edu.co"
    "raul_valencia@cun.edu.co"
    "zuany_acuna@cun.edu.co"
  )
  OrbitVacancyAdminAllowlist = @(
    "camilo_quintero@cun.edu.co"
    "yesid_rocha@cun.edu.co"
    "sara_murillofo@cun.edu.co"
    "cindy_russi@cun.edu.co"
    "lorena_gomez@cun.edu.co"
  )
  OrbitRoleManagementAllowlist = @(
    "camilo_quintero@cun.edu.co"
    "haider_bello@cun.edu.co"
    "zuany_acuna@cun.edu.co"
    "sara_murillofo@cun.edu.co"
    "cindy_russi@cun.edu.co"
    "lorena_gomez@cun.edu.co"
  )
  VacancyNotifyEmails = @(
    "camilo_quintero@cun.edu.co"
    "sara_murillofo@cun.edu.co"
    "cindy_russi@cun.edu.co"
    "lorena_gomez@cun.edu.co"
  )

  # Mantiene el flujo de login por correo que actualmente usa producción.
  AllowLocalEmailAuth = "1"
  AllowLocalEmailLogin = "true"
}
