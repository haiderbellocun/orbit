# Runbook: histórico de carga académica

## Resumen

Cada import escribe:

1. `academic_workload.import_run` (bitácora)
2. `academic_workload.academic_load_snapshot` (foto post-corrida)
3. Reemplazo transaccional de `academic_workload.academic_load`

Especificación: [historico-carga-academica-spec.md](./historico-carga-academica-spec.md)

## Migración

```bash
cd orbit-api
npm run migrate:academic-load-history
```

## Import diario (corte oficial 17:00 America/Bogota)

**Contrato:** el JSON ACA debe estar disponible en la ruta configurada **antes** de las 17:00. El scrap de ACA es externo a Orbit.

```bash
node scripts/import-academic-workload-from-json.mjs \
  --official \
  --source "/ruta/carga_del_dia.json" \
  --imported-by "cloud-scheduler" \
  --no-email
```

Flags útiles:

| Flag | Efecto |
|---|---|
| `--official` | `daily_1700` + `is_official=true` |
| `--snapshot-type adhoc\|daily_1700\|recovery` | Tipo (default `adhoc`) |
| `--force` | Omite circuit breaker ±30 % |
| `--dry-run` / `--validate-only` | No escribe histórico ni vigente |

Reintento el mismo día tras fallo: volver a lanzar con `--official`. El índice único solo bloquea un segundo `ok` oficial del mismo `fecha_carga`.

## Consultas

```bash
# As-of
node scripts/query-academic-load-as-of.mjs --at "2026-09-03T17:00:00-05:00"

# Comparar dos runs
node scripts/compare-academic-load-runs.mjs --from 10 --to 11 --out delta.json
```

SQL:

```sql
SELECT academic_workload.f_run_as_of(now());
SELECT * FROM academic_workload.v_ultimo_corte LIMIT 100;
```

## Restauración

```bash
node scripts/restore-academic-load-from-run.mjs --run-id 12 --imported-by ops@cun.edu.co
```

Crea un `import_run` `recovery` + snapshot del estado restaurado. No marca el corte como oficial.

## Retención / purga

```bash
node scripts/purge-academic-load-snapshots.mjs --months 24 --dry-run
node scripts/purge-academic-load-snapshots.mjs --months 24
```

No elimina `recovery` ni el último OK por cada `period_code` en `period_codes`.

## Alerta 17:30

```bash
node scripts/check-academic-load-official-cut.mjs --notify
```

Exit `2` si falta el corte oficial del día. Correo vía `ACADEMIC_LOAD_ALERT_EMAILS` o `VACANCY_NOTIFY_EMAILS` + SMTP.

## Cloud Scheduler (GCP)

Ejemplo de jobs (ajustar proyecto, SA y ruta del JSON):

```bash
# Corte 17:00
gcloud scheduler jobs create http academic-load-official-1700 \
  --location=us-central1 \
  --schedule="0 17 * * *" \
  --time-zone="America/Bogota" \
  --uri="https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT/jobs/academic-load-import:run" \
  --http-method=POST \
  --oauth-service-account-email=SA@PROJECT.iam.gserviceaccount.com

# Alerta 17:30
gcloud scheduler jobs create http academic-load-cut-alert-1730 \
  --location=us-central1 \
  --schedule="30 17 * * *" \
  --time-zone="America/Bogota" \
  --uri="https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT/jobs/academic-load-cut-check:run" \
  --http-method=POST \
  --oauth-service-account-email=SA@PROJECT.iam.gserviceaccount.com
```

El Cloud Run Job de import debe ejecutar el comando `--official` con el JSON del día (GCS montado o descargado en el entrypoint).

## Permisos (recomendado)

- Rol app Orbit: `SELECT` en `import_run` / `academic_load_snapshot`; sin `UPDATE`/`DELETE` en histórico.
- Rol ETL/import: `INSERT` (+ `UPDATE` status en `import_run`).
- Purga: rol admin separado.

Si hoy hay un solo usuario DB, documentar la separación como mejora operativa.

## Criterios de aceptación rápidos

1. Tras un import OK, `academic_load_snapshot` del `import_run_id` coincide en conteo con `academic_load`.
2. Fallo pre-commit no altera vigente.
3. Segundo `--official` OK el mismo día falla por índice único.
4. Circuit breaker rechaza JSON con volumen ±30 % sin `--force`.
5. `f_run_as_of` / compare / restore operan sobre runs de prueba.
