# Histórico de carga académica — especificación aprobada

**Fecha:** 2026-09-03  
**Base:** propuesta v2.0 + mediciones en GCP (`core`)

## Mediciones (fase 0)

| Métrica | Valor |
|---|---|
| Filas en `academic_load` | **9 290** |
| Heap (`pg_relation_size`) | 1 253 376 B (~1.2 MB) |
| Total (`pg_total_relation_size`) | 2 179 072 B (~2.1 MB) |
| PostgreSQL | 18.4 |
| Duplicados en `(person_id, subject_code, group_code, period_code)` | **29** |

La clave lógica documentada en `carga-academica.md` sigue siendo la base de negocio. Para hash/delta/restore se incluye `aca_group_id` (nullable) como discriminante, porque el importador ya lo usa en el upsert y existen filas duplicadas sin ese campo.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Alcance | Escenario B: snapshot de asignaciones + nombres desnormalizados + `row_hash` + `aca_group_id` |
| Momento del snapshot | Desde staging, luego swap a vigente, misma transacción |
| Sin cambios | Siempre escribir snapshot; `has_changes` informativo |
| Corte oficial | `--official` → `daily_1700` + `is_official=true`; manual → `adhoc` |
| Retención | 24 meses de cortes diarios; no purgar `recovery`; conservar último OK por `period_code` cuando sea posible |
| UI / API | Fuera de esta entrega (solo SQL + scripts CLI) |
| Circuit breaker | ±30 % vs último `row_count` OK, salvo `--force` |
| Zona horaria | `timestamptz` + `fecha_carga` en `America/Bogota` |

## Preguntas 17.2 (estado)

1. Filas reales — **cerrado** (9 290).
2. Clave de negocio — **cerrado** con `aca_group_id` en hash.
3. Alcance A/B/C — **B**.
4. Estudiantes — **no** en esta fase.
5. Import manual 15:00 — **adhoc**, no oficial.
6. Ediciones manuales entre corridas — no cubiertas hasta el siguiente corte.
7–8. Retención — 24 meses; recovery y cortes de cierre se conservan vía tipo/`period_code`.
9. JSON parcial — circuit breaker ±30 %.
10–13. GCP / PG 18 / script Node / Cloud Scheduler — asumido.
14–17. Consulta vía SQL/CLI; UI posterior; jurídica pendiente de validación institucional.
