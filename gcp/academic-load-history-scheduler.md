# Cloud Scheduler — corte oficial carga académica

Referencia operativa. Crear jobs en el proyecto GCP de Orbit.

## Job 1 — Import oficial 17:00 America/Bogota

- Schedule: `0 17 * * *`
- Time zone: `America/Bogota`
- Target: Cloud Run Job que ejecuta:

```text
node scripts/import-academic-workload-from-json.mjs \
  --official \
  --source ${ACADEMIC_LOAD_JSON_PATH} \
  --imported-by cloud-scheduler \
  --no-email
```

Prerrequisito: el scrap ACA deja el JSON en `${ACADEMIC_LOAD_JSON_PATH}` (o GCS) antes de las 17:00.

## Job 2 — Alerta ausencia de corte 17:30

- Schedule: `30 17 * * *`
- Time zone: `America/Bogota`
- Target:

```text
node scripts/check-academic-load-official-cut.mjs --notify
```

Variables: `ACADEMIC_LOAD_ALERT_EMAILS`, SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).

## Job 3 — Purga mensual (opcional)

- Schedule: `0 3 1 * *`
- Time zone: `America/Bogota`

```text
node scripts/purge-academic-load-snapshots.mjs --months 24
```
