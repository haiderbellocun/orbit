-- =====================================================================
--  TABLERO CARGA ACADÉMICA — consultas (PostgreSQL / core-database)
-- =====================================================================
--  Mismas reglas que Orbit:
--   * Periodo vigente: periodos cuyo último grupo terminó hace <= 15 días.
--   * Horas de carga académica (cátedra) por asignación:
--       - Presencial: créditos de la asignatura (1 crédito = 1 h); si la
--         materia no trae créditos, subject.hours_quantity como respaldo.
--       - Virtual (cg.modality V): estudiantes ÷ 50 × 2 (50 est. = 2 h).
--   * Tope de estudiantes virtuales: 520 (tiempo completo) / 250 (medio).
--   * Horas contrato: 21 (medio tiempo) / 42 (tiempo completo) según
--     contract_type; NULL si no se puede inferir.
--   * Preparación de clase: última class_preparation del docente, 2 h por defecto.
--   * Docentes de investigación (área investigativa / Harvey o escuela
--     INVESTIGACION CUN) están ocultos en Orbit:
--       - @detalle_carga y @balance_docente traen la columna es_investigacion
--         (filtrar es_investigacion = false en el tablero).
--       - Los agregados ya los excluyen.
--
--  Notas de datos (nov-2026):
--   * academic_load.program_id viene vacío: el programa sale de program_name.
--   * region/city/campus vienen vacíos: no hay corte por sede todavía.
--   * import_run está vacío: no hay histórico por corte para tendencias.
--
--  Cada bloque "-- @nombre" es una consulta independiente (dataset).
--  Para el tablero bastan @detalle_carga y @balance_docente; el resto son
--  agregados listos por si la herramienta no agrega sola.
-- =====================================================================


-- @detalle_carga ------------------------------------------------------
-- Una fila por asignación (docente × asignatura × grupo). Dataset base.
WITH periodos_vigentes AS (
  SELECT al.period_code
  FROM academic_workload.academic_load al
  JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE al.period_code IS NOT NULL
  GROUP BY al.period_code
  HAVING MAX(cg.end_date) >= CURRENT_DATE - 15
)
SELECT
  al.id                                   AS asignacion_id,
  al.period_code                          AS periodo,
  al.semester                             AS semestre,
  p.id                                    AS docente_id,
  p.document                              AS documento,
  p.full_name                             AS docente,
  COALESCE(p.edu_email, p.email)          AS correo,
  ar.name                                 AS area,
  sch.name                                AS escuela,
  ct.name                                 AS tipo_contrato,
  COALESCE(al.program_name, 'Sin programa') AS programa,
  al.subject_code                         AS cod_asignatura,
  subj.name                               AS asignatura,
  subj.credits_quantity                   AS creditos,
  al.group_code                           AS grupo,
  al.aca_group_id                         AS grupo_aca,
  CASE cg.modality WHEN 'V' THEN 'Virtual' WHEN 'P' THEN 'Presencial'
       ELSE COALESCE(cg.modality, 'Sin dato') END AS modalidad,
  cg.start_date                           AS fecha_inicio,
  cg.end_date                             AS fecha_fin,
  COALESCE(al.enrolled_quantity, cg.enrolled_quantity, 0) AS estudiantes,
  cg.capacity                             AS cupo,
  (CASE WHEN UPPER(TRIM(COALESCE(cg.modality, ''))) = 'V' OR LOWER(TRIM(COALESCE(cg.modality, ''))) LIKE 'vir%'
        THEN ROUND(COALESCE(NULLIF(al.enrolled_quantity, 0), cg.enrolled_quantity, 0)::numeric / 50 * 2, 2)
        ELSE COALESCE(NULLIF(subj.credits_quantity, 0), NULLIF(subj.hours_quantity, 0),
                      NULLIF(al.substantive_hours_quantity, 0), 0)
   END) AS horas_catedra,
  (
    UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
    OR COALESCE(ar.name, '') ILIKE '%investigativ%'
    OR COALESCE(ar.name, '') ILIKE '%harvey%'
    OR UPPER(TRANSLATE(TRIM(COALESCE(ar.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
  )                                       AS es_investigacion
FROM academic_workload.academic_load al
JOIN periodos_vigentes pv ON pv.period_code = al.period_code
JOIN core.person p        ON p.id = al.person_id
LEFT JOIN core.school sch ON sch.id = p.school_id
LEFT JOIN core.area ar    ON ar.id = COALESCE(p.area_id, sch.area_id)
LEFT JOIN core.contract_type ct ON ct.id = p.contract_type_id
LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
LEFT JOIN academic_workload.class_group cg
  ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code;


-- @balance_docente ----------------------------------------------------
-- Una fila por docente activo (con o sin carga vigente): horas contrato,
-- cátedra, preparación, sustantivas, disponibles y estado.
WITH periodos_vigentes AS (
  SELECT al.period_code
  FROM academic_workload.academic_load al
  JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE al.period_code IS NOT NULL
  GROUP BY al.period_code
  HAVING MAX(cg.end_date) >= CURRENT_DATE - 15
),
carga AS (
  SELECT al.person_id,
         COUNT(*)                                   AS grupos,
         COUNT(DISTINCT al.subject_code)            AS asignaturas,
         COUNT(DISTINCT al.program_name)            AS programas,
         SUM(COALESCE(al.enrolled_quantity, 0))     AS estudiantes,
         SUM((CASE WHEN UPPER(TRIM(COALESCE(cg.modality, ''))) = 'V' OR LOWER(TRIM(COALESCE(cg.modality, ''))) LIKE 'vir%'
        THEN ROUND(COALESCE(NULLIF(al.enrolled_quantity, 0), cg.enrolled_quantity, 0)::numeric / 50 * 2, 2)
        ELSE COALESCE(NULLIF(subj.credits_quantity, 0), NULLIF(subj.hours_quantity, 0),
                      NULLIF(al.substantive_hours_quantity, 0), 0)
   END)) AS horas_catedra
  FROM academic_workload.academic_load al
  JOIN periodos_vigentes pv ON pv.period_code = al.period_code
  LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
  LEFT JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  GROUP BY al.person_id
),
docentes AS (
  SELECT p.id
  FROM core.person p
  LEFT JOIN core.role r ON r.id = p.role_id
  WHERE COALESCE(p.is_active, true)
    AND (r.name ILIKE '%DOCENTE%' OR p.id IN (SELECT person_id FROM carga))
),
base AS (
  SELECT
    p.id                                   AS docente_id,
    p.document                             AS documento,
    p.full_name                            AS docente,
    COALESCE(p.edu_email, p.email)         AS correo,
    ar.name                                AS area,
    sch.name                               AS escuela,
    ct.name                                AS tipo_contrato,
    CASE
      WHEN lower(coalesce(ct.work_schedule, '') || ' ' || coalesce(ct.name, ''))
           ~ '(medio|media|1/2|[[:<:]]21[[:>:]])' THEN 21
      WHEN lower(coalesce(ct.work_schedule, '') || ' ' || coalesce(ct.name, ''))
           ~ '(tiempo[[:space:]]*completo|[[:<:]]completo[[:>:]]|[[:<:]]full[[:>:]]|[[:<:]]42[[:>:]])' THEN 42
    END                                    AS horas_contrato,
    COALESCE(c.grupos, 0)                  AS grupos,
    COALESCE(c.asignaturas, 0)             AS asignaturas,
    COALESCE(c.programas, 0)               AS programas,
    COALESCE(c.estudiantes, 0)             AS estudiantes,
    COALESCE(c.horas_catedra, 0)           AS horas_catedra,
    COALESCE(cp.class_preparation_hours, 2) AS horas_preparacion,
    COALESCE(sub.horas, 0)                 AS horas_sustantivas,
    (
      UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
      OR COALESCE(ar.name, '') ILIKE '%investigativ%'
      OR COALESCE(ar.name, '') ILIKE '%harvey%'
      OR UPPER(TRANSLATE(TRIM(COALESCE(ar.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
    )                                      AS es_investigacion
  FROM docentes d
  JOIN core.person p        ON p.id = d.id
  LEFT JOIN core.school sch ON sch.id = p.school_id
  LEFT JOIN core.area ar    ON ar.id = COALESCE(p.area_id, sch.area_id)
  LEFT JOIN core.contract_type ct ON ct.id = p.contract_type_id
  LEFT JOIN carga c ON c.person_id = p.id
  LEFT JOIN LATERAL (
    SELECT cp0.class_preparation_hours
    FROM academic_workload.class_preparation cp0
    WHERE cp0.person_id = p.id
    ORDER BY cp0.updated_at DESC NULLS LAST, cp0.id DESC
    LIMIT 1
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT SUM(a.hours_quantity) AS horas
    FROM substantive_hours.assignment a
    WHERE a.person_id = p.id
  ) sub ON true
)
SELECT
  b.*,
  b.horas_contrato - b.horas_catedra - b.horas_preparacion - b.horas_sustantivas
                                         AS horas_disponibles,
  CASE
    WHEN b.grupos = 0                    THEN 'Sin carga'
    WHEN b.horas_contrato IS NULL        THEN 'Contrato sin horas'
    WHEN b.horas_contrato - b.horas_catedra - b.horas_preparacion - b.horas_sustantivas < 0
                                         THEN 'Sobrecargado'
    WHEN b.horas_contrato - b.horas_catedra - b.horas_preparacion - b.horas_sustantivas = 0
                                         THEN 'Completo'
    ELSE 'Con disponibilidad'
  END                                    AS estado
FROM base b;


-- @kpis ---------------------------------------------------------------
-- Una fila con los indicadores principales del periodo vigente.
WITH periodos_vigentes AS (
  SELECT al.period_code
  FROM academic_workload.academic_load al
  JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE al.period_code IS NOT NULL
  GROUP BY al.period_code
  HAVING MAX(cg.end_date) >= CURRENT_DATE - 15
),
d AS (
  SELECT al.*, cg.modality,
         (CASE WHEN UPPER(TRIM(COALESCE(cg.modality, ''))) = 'V' OR LOWER(TRIM(COALESCE(cg.modality, ''))) LIKE 'vir%'
        THEN ROUND(COALESCE(NULLIF(al.enrolled_quantity, 0), cg.enrolled_quantity, 0)::numeric / 50 * 2, 2)
        ELSE COALESCE(NULLIF(subj.credits_quantity, 0), NULLIF(subj.hours_quantity, 0),
                      NULLIF(al.substantive_hours_quantity, 0), 0)
   END) AS horas
  FROM academic_workload.academic_load al
  JOIN periodos_vigentes pv ON pv.period_code = al.period_code
  JOIN core.person p        ON p.id = al.person_id
  LEFT JOIN core.school sch ON sch.id = p.school_id
  LEFT JOIN core.area ar    ON ar.id = COALESCE(p.area_id, sch.area_id)
  LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
  LEFT JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE NOT (
    UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
    OR COALESCE(ar.name, '') ILIKE '%investigativ%'
    OR COALESCE(ar.name, '') ILIKE '%harvey%'
    OR UPPER(TRANSLATE(TRIM(COALESCE(ar.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
  )
)
SELECT
  string_agg(DISTINCT period_code, ', ')            AS periodos,
  COUNT(DISTINCT person_id)                         AS docentes_con_carga,
  COUNT(*)                                          AS asignaciones,
  COUNT(DISTINCT subject_code)                      AS asignaturas,
  COUNT(DISTINCT program_name)                      AS programas,
  SUM(COALESCE(enrolled_quantity, 0))               AS estudiantes_matriculados,
  SUM(horas)                                        AS horas_catedra,
  ROUND(SUM(horas) / NULLIF(COUNT(DISTINCT person_id), 0), 1)        AS horas_prom_docente,
  ROUND(AVG(COALESCE(enrolled_quantity, 0)), 1)     AS estudiantes_prom_grupo,
  ROUND(100.0 * COUNT(*) FILTER (WHERE modality = 'V')
        / NULLIF(COUNT(*), 0), 1)                   AS pct_virtual
FROM d;


-- @por_escuela --------------------------------------------------------
WITH periodos_vigentes AS (
  SELECT al.period_code
  FROM academic_workload.academic_load al
  JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE al.period_code IS NOT NULL
  GROUP BY al.period_code
  HAVING MAX(cg.end_date) >= CURRENT_DATE - 15
)
SELECT
  COALESCE(ar.name, 'Sin área')                     AS area,
  COALESCE(sch.name, 'Sin escuela')                 AS escuela,
  COUNT(DISTINCT al.person_id)                      AS docentes,
  COUNT(*)                                          AS asignaciones,
  COUNT(DISTINCT al.program_name)                   AS programas,
  SUM(COALESCE(al.enrolled_quantity, 0))            AS estudiantes,
  SUM((CASE WHEN UPPER(TRIM(COALESCE(cg.modality, ''))) = 'V' OR LOWER(TRIM(COALESCE(cg.modality, ''))) LIKE 'vir%'
        THEN ROUND(COALESCE(NULLIF(al.enrolled_quantity, 0), cg.enrolled_quantity, 0)::numeric / 50 * 2, 2)
        ELSE COALESCE(NULLIF(subj.credits_quantity, 0), NULLIF(subj.hours_quantity, 0),
                      NULLIF(al.substantive_hours_quantity, 0), 0)
   END)) AS horas_catedra
FROM academic_workload.academic_load al
JOIN periodos_vigentes pv ON pv.period_code = al.period_code
JOIN core.person p        ON p.id = al.person_id
LEFT JOIN core.school sch ON sch.id = p.school_id
LEFT JOIN core.area ar    ON ar.id = COALESCE(p.area_id, sch.area_id)
LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
LEFT JOIN academic_workload.class_group cg
  ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
WHERE NOT (
  UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
  OR COALESCE(ar.name, '') ILIKE '%investigativ%'
  OR COALESCE(ar.name, '') ILIKE '%harvey%'
  OR UPPER(TRANSLATE(TRIM(COALESCE(ar.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
)
GROUP BY 1, 2
ORDER BY horas_catedra DESC;


-- @por_programa -------------------------------------------------------
WITH periodos_vigentes AS (
  SELECT al.period_code
  FROM academic_workload.academic_load al
  JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE al.period_code IS NOT NULL
  GROUP BY al.period_code
  HAVING MAX(cg.end_date) >= CURRENT_DATE - 15
)
SELECT
  COALESCE(al.program_name, 'Sin programa')         AS programa,
  COUNT(DISTINCT al.person_id)                      AS docentes,
  COUNT(*)                                          AS asignaciones,
  COUNT(DISTINCT al.subject_code)                   AS asignaturas,
  SUM(COALESCE(al.enrolled_quantity, 0))            AS estudiantes,
  SUM((CASE WHEN UPPER(TRIM(COALESCE(cg.modality, ''))) = 'V' OR LOWER(TRIM(COALESCE(cg.modality, ''))) LIKE 'vir%'
        THEN ROUND(COALESCE(NULLIF(al.enrolled_quantity, 0), cg.enrolled_quantity, 0)::numeric / 50 * 2, 2)
        ELSE COALESCE(NULLIF(subj.credits_quantity, 0), NULLIF(subj.hours_quantity, 0),
                      NULLIF(al.substantive_hours_quantity, 0), 0)
   END)) AS horas_catedra
FROM academic_workload.academic_load al
JOIN periodos_vigentes pv ON pv.period_code = al.period_code
JOIN core.person p        ON p.id = al.person_id
LEFT JOIN core.school sch ON sch.id = p.school_id
LEFT JOIN core.area ar    ON ar.id = COALESCE(p.area_id, sch.area_id)
LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
LEFT JOIN academic_workload.class_group cg
  ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
WHERE NOT (
  UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
  OR COALESCE(ar.name, '') ILIKE '%investigativ%'
  OR COALESCE(ar.name, '') ILIKE '%harvey%'
  OR UPPER(TRANSLATE(TRIM(COALESCE(ar.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
)
GROUP BY 1
ORDER BY estudiantes DESC;


-- @por_modalidad ------------------------------------------------------
WITH periodos_vigentes AS (
  SELECT al.period_code
  FROM academic_workload.academic_load al
  JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE al.period_code IS NOT NULL
  GROUP BY al.period_code
  HAVING MAX(cg.end_date) >= CURRENT_DATE - 15
)
SELECT
  CASE cg.modality WHEN 'V' THEN 'Virtual' WHEN 'P' THEN 'Presencial'
       ELSE COALESCE(cg.modality, 'Sin dato') END   AS modalidad,
  COUNT(DISTINCT al.person_id)                      AS docentes,
  COUNT(*)                                          AS asignaciones,
  SUM(COALESCE(al.enrolled_quantity, 0))            AS estudiantes,
  SUM((CASE WHEN UPPER(TRIM(COALESCE(cg.modality, ''))) = 'V' OR LOWER(TRIM(COALESCE(cg.modality, ''))) LIKE 'vir%'
        THEN ROUND(COALESCE(NULLIF(al.enrolled_quantity, 0), cg.enrolled_quantity, 0)::numeric / 50 * 2, 2)
        ELSE COALESCE(NULLIF(subj.credits_quantity, 0), NULLIF(subj.hours_quantity, 0),
                      NULLIF(al.substantive_hours_quantity, 0), 0)
   END)) AS horas_catedra
FROM academic_workload.academic_load al
JOIN periodos_vigentes pv ON pv.period_code = al.period_code
JOIN core.person p        ON p.id = al.person_id
LEFT JOIN core.school sch ON sch.id = p.school_id
LEFT JOIN core.area ar    ON ar.id = COALESCE(p.area_id, sch.area_id)
LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
LEFT JOIN academic_workload.class_group cg
  ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
WHERE NOT (
  UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
  OR COALESCE(ar.name, '') ILIKE '%investigativ%'
  OR COALESCE(ar.name, '') ILIKE '%harvey%'
  OR UPPER(TRANSLATE(TRIM(COALESCE(ar.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
)
GROUP BY 1
ORDER BY asignaciones DESC;


-- @distribucion_horas -------------------------------------------------
-- Cuántos docentes caen en cada rango de horas cátedra.
WITH periodos_vigentes AS (
  SELECT al.period_code
  FROM academic_workload.academic_load al
  JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE al.period_code IS NOT NULL
  GROUP BY al.period_code
  HAVING MAX(cg.end_date) >= CURRENT_DATE - 15
),
por_docente AS (
  SELECT al.person_id,
         SUM((CASE WHEN UPPER(TRIM(COALESCE(cg.modality, ''))) = 'V' OR LOWER(TRIM(COALESCE(cg.modality, ''))) LIKE 'vir%'
        THEN ROUND(COALESCE(NULLIF(al.enrolled_quantity, 0), cg.enrolled_quantity, 0)::numeric / 50 * 2, 2)
        ELSE COALESCE(NULLIF(subj.credits_quantity, 0), NULLIF(subj.hours_quantity, 0),
                      NULLIF(al.substantive_hours_quantity, 0), 0)
   END)) AS horas
  FROM academic_workload.academic_load al
  JOIN periodos_vigentes pv ON pv.period_code = al.period_code
  JOIN core.person p        ON p.id = al.person_id
  LEFT JOIN core.school sch ON sch.id = p.school_id
  LEFT JOIN core.area ar    ON ar.id = COALESCE(p.area_id, sch.area_id)
  LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
  LEFT JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE NOT (
    UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
    OR COALESCE(ar.name, '') ILIKE '%investigativ%'
    OR COALESCE(ar.name, '') ILIKE '%harvey%'
    OR UPPER(TRANSLATE(TRIM(COALESCE(ar.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
  )
  GROUP BY al.person_id
)
SELECT
  CASE
    WHEN horas < 8  THEN '01. 0-7 h'
    WHEN horas < 16 THEN '02. 8-15 h'
    WHEN horas < 24 THEN '03. 16-23 h'
    WHEN horas < 32 THEN '04. 24-31 h'
    WHEN horas < 40 THEN '05. 32-39 h'
    ELSE '06. 40+ h'
  END                AS rango_horas,
  COUNT(*)           AS docentes
FROM por_docente
GROUP BY 1
ORDER BY 1;


-- @grupos_alerta ------------------------------------------------------
-- Grupos con baja matrícula (< 10) o sobrecupo (matriculados > cupo).
WITH periodos_vigentes AS (
  SELECT al.period_code
  FROM academic_workload.academic_load al
  JOIN academic_workload.class_group cg
    ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
  WHERE al.period_code IS NOT NULL
  GROUP BY al.period_code
  HAVING MAX(cg.end_date) >= CURRENT_DATE - 15
)
SELECT
  al.period_code                                    AS periodo,
  sch.name                                          AS escuela,
  al.program_name                                   AS programa,
  al.subject_code                                   AS cod_asignatura,
  subj.name                                         AS asignatura,
  al.group_code                                     AS grupo,
  p.full_name                                       AS docente,
  CASE cg.modality WHEN 'V' THEN 'Virtual' WHEN 'P' THEN 'Presencial'
       ELSE cg.modality END                         AS modalidad,
  COALESCE(al.enrolled_quantity, 0)                 AS estudiantes,
  cg.capacity                                       AS cupo,
  CASE
    WHEN cg.capacity > 0 AND COALESCE(al.enrolled_quantity, 0) > cg.capacity
      THEN 'Sobrecupo'
    WHEN COALESCE(al.enrolled_quantity, 0) = 0 THEN 'Sin estudiantes'
    ELSE 'Baja matrícula'
  END                                               AS alerta
FROM academic_workload.academic_load al
JOIN periodos_vigentes pv ON pv.period_code = al.period_code
JOIN core.person p        ON p.id = al.person_id
LEFT JOIN core.school sch ON sch.id = p.school_id
LEFT JOIN core.area ar    ON ar.id = COALESCE(p.area_id, sch.area_id)
LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
LEFT JOIN academic_workload.class_group cg
  ON cg.subject_code = al.subject_code AND cg.group_code = al.group_code
WHERE (COALESCE(al.enrolled_quantity, 0) < 10
       OR (cg.capacity > 0 AND COALESCE(al.enrolled_quantity, 0) > cg.capacity))
  AND NOT (
    UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
    OR COALESCE(ar.name, '') ILIKE '%investigativ%'
    OR COALESCE(ar.name, '') ILIKE '%harvey%'
    OR UPPER(TRANSLATE(TRIM(COALESCE(ar.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
  )
ORDER BY alerta, estudiantes;
