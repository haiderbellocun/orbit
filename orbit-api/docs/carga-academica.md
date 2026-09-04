# Carga Académica — Especificación de datos para tableros

Documento de referencia para diseñar **tableros informativos** (BI / dashboards) sobre carga académica en Orbit.

Incluye: definición del dominio, modelo en base de datos, reglas de negocio, calidad de datos, joins recomendados, métricas y estructuras listas para consumir.

> **Histórico:** ver [historico-carga-academica.md](./historico-carga-academica.md) y [historico-carga-academica-spec.md](./historico-carga-academica-spec.md).

---

## 1. Qué es la carga académica

**Carga académica** = asignación de un **docente** a una **materia + grupo** en un **periodo académico**, con contexto de programa, modalidad, cupos y metadatos de oferta.

En Orbit:

| Aspecto | Realidad actual |
|---|---|
| Fuente de verdad | Proyección ACA (importada por JSON) |
| Uso en producto | Consulta / lectura |
| Tipo de dato expuesto | Siempre `projection` |
| Escritura en UI | No existe |
| Uso secundario | Alimenta horas de **cátedra** en Horas Sustantivas |

Granularidad de una fila de negocio:

> 1 docente × 1 materia × 1 grupo × 1 periodo = 1 asignación

---

## 2. Modelo conceptual

```text
core.person (docente)
      │
      │ 1:N
      ▼
academic_workload.academic_load  ──────────────┐
      │                                        │
      │ N:1                                    │ N:1
      ▼                                        ▼
academic_workload.subject          academic_workload.class_group
      ▲                                        │
      └──────────── 1:N ───────────────────────┘

Opcional:
  academic_load.program_id      → core.program
  academic_load.region/city/campus → core.*
  academic_load.class_preparation_id → academic_workload.class_preparation
  person.school_id              → core.school
```

### Entidades

| Entidad | Tabla | Qué representa |
|---|---|---|
| Asignación | `academic_workload.academic_load` | Hecho central del tablero |
| Materia | `academic_workload.subject` | Catálogo de asignaturas |
| Grupo | `academic_workload.class_group` | Oferta concreta (modalidad, cupo, horario) |
| Preparación | `academic_workload.class_preparation` | Horas de prep por docente |
| Docente | `core.person` | Maestro de personas |
| Programa | `core.program` | Catálogo de programas (enlace opcional) |
| Escuela | `core.school` | Dimensión de alcance (vía person/program) |

---

## 3. Estructura en base de datos

Esquema: **`academic_workload`**  
Tablas relacionadas en: **`core`**, **`substantive_hours`**

### 3.1 `academic_workload.academic_load` (hecho)

| Campo | Tipo | Nulo | Descripción para tableros |
|---|---|---|---|
| `id` | integer PK | No | ID interno de la asignación |
| `person_id` | integer FK → `core.person` | No | Docente |
| `period_code` | varchar(50) | No | **Dimensión clave de periodo** |
| `semester` | varchar(50) | Sí | Semestre (si viene de ACA) |
| `program_id` | integer FK → `core.program` | Sí | Programa catalogado (puede estar vacío) |
| `program_name` | varchar(250) | Sí | Nombre de programa denormalizado desde ACA |
| `subject_code` | varchar(50) FK → `subject` | No | Código materia |
| `group_code` | varchar(50) | No | Código grupo (FK compuesto con subject) |
| `enrolled_quantity` | integer ≥ 0 | No | Estudiantes matriculados (default 0) |
| `region_id` | integer FK | Sí | Región (poco poblado en import actual) |
| `city_id` | integer FK | Sí | Ciudad |
| `campus_id` | integer FK | Sí | Campus |
| `substantive_category_id` | integer FK | Sí | Categoría sustantiva (opcional) |
| `substantive_hours_quantity` | numeric(6,2) ≥ 0 | No | Horas traídas del import (ACA `subject.hours_quantity`) |
| `class_preparation_id` | integer FK | Sí | Prep de clase vinculada |
| `created_at` / `updated_at` | timestamp | No | Auditoría técnica |

**Clave lógica de negocio (upsert):**

```text
person_id + subject_code + group_code + period_code
```

> No hay UNIQUE constraint físico con ese nombre en todos los ambientes; la unicidad la garantiza el proceso de importación.

### 3.2 `academic_workload.subject` (dimensión materia)

| Campo | Tipo | Descripción |
|---|---|---|
| `subject_code` | varchar(50) PK | Código materia |
| `name` | varchar(250) | Nombre |
| `credits_quantity` | integer ≥ 0 | Créditos |
| `hours_quantity` | numeric(6,2) ≥ 0 | Horas de materia (usado en cátedra) |
| `is_active` | boolean | Activa / inactiva |
| `created_at` / `updated_at` | timestamp | Auditoría |

**Nota de calidad:** el import crea materias nuevas con `credits_quantity`, pero **no actualiza** materias ya existentes ni siempre popula `hours_quantity`. Para tableros de horas, validar cobertura de `subject.hours_quantity`.

### 3.3 `academic_workload.class_group` (dimensión grupo/oferta)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | integer PK | ID grupo |
| `subject_code` | varchar(50) | Materia |
| `group_code` | varchar(50) | Código de grupo |
| `start_date` / `end_date` | date | Vigencia |
| `start_time` / `end_time` | time | Horario (puede venir vacío) |
| `classroom_name` | varchar(150) | Aula |
| `capacity` | integer ≥ 0 | Cupo |
| `block` | varchar(100) | Bloque |
| `schedule_type` | varchar(100) | Texto de horario / tipo |
| `modality` | varchar(100) | Modalidad cruda (P/V/Presencial/Virtual…) |
| `is_active` | boolean | Activo |
| `created_at` / `updated_at` | timestamp | Auditoría |

**UNIQUE:** `(subject_code, group_code)`

### 3.4 `academic_workload.class_preparation`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | integer PK | ID |
| `person_id` | integer FK → person | Docente |
| `class_preparation_hours` | numeric(6,2) ≥ 0 | Horas de preparación |
| `created_at` / `updated_at` | timestamp | Auditoría |

### 3.5 Dimensiones de `core` útiles para tableros

#### `core.person` (docente)

Campos más usados:

- `id`, `document`, `full_name`
- `school_id`, `program_id`, `area_id`
- `contract_type_id`, `role_id`, `hierarchy_id`
- `city_id`, `region_id`, `campus_id`
- `email`, `edu_email`
- `is_active` (si existe en el ambiente; NULL se trata como activo)

#### `core.program`

- `id`, `code`, `name`, `school_id`, `level`, `modality`, `is_active`

#### `core.school` / `core.area` / `core.contract_type`

Útiles para cortes por escuela, área y dedicación contractual.

---

## 4. Relaciones y joins recomendados

### 4.1 Vista base para tableros (recomendado)

```sql
SELECT
  al.id                         AS load_id,
  al.period_code,
  al.semester,
  al.person_id,
  p.document                    AS teacher_document,
  p.full_name                   AS teacher_name,
  p.school_id                   AS teacher_school_id,
  sch.name                      AS teacher_school_name,
  COALESCE(al.program_name, pr.name) AS program_name,
  al.program_id,
  pr.school_id                  AS program_school_id,
  al.subject_code,
  s.name                        AS subject_name,
  s.credits_quantity,
  s.hours_quantity              AS subject_hours,
  al.group_code,
  cg.modality                   AS modality_raw,
  CASE
    WHEN UPPER(TRIM(cg.modality)) IN ('P') OR LOWER(TRIM(cg.modality)) LIKE 'pres%' THEN 'Presencial'
    WHEN UPPER(TRIM(cg.modality)) IN ('V') OR LOWER(TRIM(cg.modality)) LIKE 'vir%'  THEN 'Virtual'
    ELSE COALESCE(NULLIF(TRIM(cg.modality), ''), 'Sin modalidad')
  END                           AS modality_norm,
  cg.capacity,
  al.enrolled_quantity,
  CASE
    WHEN cg.capacity > 0 THEN ROUND(100.0 * al.enrolled_quantity / cg.capacity, 2)
    ELSE NULL
  END                           AS occupancy_pct,
  al.substantive_hours_quantity AS imported_hours,
  'projection'::text            AS load_type,
  COALESCE(p.is_active, true)   AS teacher_is_active
FROM academic_workload.academic_load al
JOIN core.person p
  ON p.id = al.person_id
LEFT JOIN core.school sch
  ON sch.id = p.school_id
LEFT JOIN core.program pr
  ON pr.id = al.program_id
LEFT JOIN academic_workload.subject s
  ON s.subject_code = al.subject_code
LEFT JOIN academic_workload.class_group cg
  ON cg.subject_code = al.subject_code
 AND cg.group_code = al.group_code;
```

### 4.2 Filtro de docentes activos (alineado al producto)

```sql
COALESCE(p.is_active, true) = true
```

La API de Orbit aplica este filtro en listados y resumen.

### 4.3 Alcance por escuela (si el tablero replica permisos)

Una asignación pertenece al alcance de escuela si:

```sql
p.school_id = :school_id
OR pr.school_id = :school_id
```

---

## 5. Reglas de negocio

### 5.1 Dominio y ciclo de vida

| # | Regla | Implicación para tableros |
|---|---|---|
| R1 | La carga en Orbit es **proyección importada**, no un workflow editable | No modelar estados draft/approved |
| R2 | La recarga estándar **borra toda** `academic_load` y vuelve a cargar | Los tableros reflejan el **último snapshot** importado, no un historial acumulado |
| R3 | Si el docente no existe en `core.person` (match por dígitos de documento), la asignación **se omite** | Puede haber subconteo vs ACA; medir omisiones desde el JSON de progreso del import |
| R4 | Unicidad lógica: docente + materia + grupo + periodo | Contar filas = contar asignaciones |
| R5 | Materias existentes **sí se actualizan** en reimport (`name`, `credits_quantity`, `hours_quantity`) | Cátedra en Horas Sustantivas usa `subject.hours_quantity` actualizado |
| R6 | Grupos existentes se actualizan con `COALESCE` (solo pisa si viene valor nuevo) | Campos de grupo pueden quedar parcialmente viejos |
| R7 | `program_id` suele venir `NULL` en import; se guarda `program_name` | Preferir `COALESCE(program_name, program.name)` |
| R8 | Tipo expuesto siempre `projection` | No segmentar por `current` vs `projection` en UI/API actual |
| R9 | Solo docentes activos en consultas de producto | Decidir si el tablero incluye inactivos (recomendado: parámetro) |
| R10 | Modalidad se normaliza a Presencial/Virtual | Crear dimensión `modality_norm` |

### 5.2 Integridad y validaciones

| Regla | Dónde |
|---|---|
| `enrolled_quantity >= 0` | CHECK DB |
| `substantive_hours_quantity >= 0` | CHECK DB |
| `capacity >= 0` | CHECK DB |
| `credits_quantity >= 0`, `hours_quantity >= 0` | CHECK DB |
| FK persona / subject / class_group = RESTRICT | No se borra persona con carga |
| FK programa / geo / prep = SET NULL | Dimensiones opcionales |

### 5.3 Validaciones al importar (script JSON)

El import (`scripts/import-academic-workload-from-json.mjs`) corre validaciones **antes** de escribir y las deja en el progress JSON (`validation.summary` / `validation.issues`). Por defecto **no bloquean** el cargue (son warnings); usar `--fail-on-validation` para abortar o `--validate-only` para solo auditar.

| Código | Qué detecta | Regla |
|---|---|---|
| `over_capacity` | Matriculados > cupo | `enrolled_quantity > capacity` |
| `schedule_conflict` | Cruce de horario del mismo docente/periodo | Mismo `block` (si ambos tienen), rangos de fecha solapados y `[start_time, end_time)` solapados |
| `hours_overload` | Tope contractual | `cátedra + prep + sustantivas > contrato (42/21)` — mismo balance que Horas Sustantivas |
| `missing_contract_hours` | No se infiere jornada | Sin etiqueta medio/completo en contrato |
| `missing_subject_hours` | Materia sin horas | `subject.hours_quantity` ausente o ≤ 0 |

Además el reimport **actualiza** `subject.hours_quantity` / créditos / nombre y persiste `class_group.start_time` / `end_time` (antes solo iba texto a `schedule_type`).

Aún pendiente:

- Historial versionado de cargas anteriores (salvo backups externos / archivos de import).
- `academic_load.substantive_hours_quantity` (copia del JSON) y `subject.hours_quantity` (cátedra) pueden diferir si el JSON trae valores inconsistentes entre filas de la misma materia.

### 5.4 Reglas de Horas Sustantivas (impacto en tableros cruzados)

Balance semanal aproximado:

```text
horas_contrato
  − horas_cátedra
  − horas_preparación
  − horas_sustantivas_asignadas
= horas_restantes
```

| Concepto | Origen | Regla |
|---|---|---|
| Contrato | etiquetas de contrato / jornada | Completo = **42**, medio = **21** |
| Cátedra | `SUM(COALESCE(NULLIF(subject.hours_quantity,0), academic_load.substantive_hours_quantity))` | Depende de horas pobladas en import |
| Preparación | `class_preparation.class_preparation_hours` | Default **4** si no hay fila |
| Sustantivas | `substantive_hours.assignment` | Módulo aparte |

---

## 6. Estructura de datos de origen (JSON ACA)

Payload típico del scrape/import:

```json
{
  "generated_at": "2026-07-27T11:36:42",
  "load_type": "projection",
  "periods": [{ "period_code": "26C11" }],
  "assignments": [
    {
      "person_document": "1234567890",
      "period_code": "26C11",
      "teacher": { "document": "1234567890", "name": "ANA PEREZ" },
      "subject": {
        "subject_code": "MAT101",
        "name": "Calculo I",
        "credits_quantity": 3,
        "hours_quantity": 4
      },
      "class_group": {
        "group_code": "01",
        "start_date": "01/02/2026",
        "end_date": "20/05/2026",
        "classroom": "A-201",
        "capacity": 40,
        "block": "Noche",
        "modality": "P",
        "enrolled_quantity": 35
      },
      "academic_load": {
        "semester": "1",
        "program_name": "Ingenieria de Sistemas",
        "period_code": "26C11"
      }
    }
  ]
}
```

### Mapeo JSON → DB

| Origen JSON | Destino DB |
|---|---|
| `person_document` / `teacher.document` | Match → `academic_load.person_id` |
| `period_code` | `academic_load.period_code` |
| `subject.*` | `subject` (+ códigos en load) |
| `subject.hours_quantity` | `subject.hours_quantity` (cátedra; se actualiza en reimport) y `academic_load.substantive_hours_quantity` |
| `class_group.*` | `class_group` |
| `class_group.enrolled_quantity` | `academic_load.enrolled_quantity` |
| `academic_load.program_name` | `academic_load.program_name` |
| `academic_load.semester` | `academic_load.semester` |

---

## 7. Dataset / star schema sugerido para BI

### 7.1 Tabla de hechos

**`fact_academic_load`** (1 fila = 1 asignación)

Medidas posibles:

| Medida | Campo / cálculo |
|---|---|
| `# asignaciones` | `COUNT(*)` |
| `# docentes` | `COUNT(DISTINCT person_id)` |
| `# materias` | `COUNT(DISTINCT subject_code)` |
| `# grupos` | `COUNT(DISTINCT subject_code \|\| group_code)` |
| `créditos` | `SUM(credits_quantity)` |
| `horas importadas` | `SUM(substantive_hours_quantity)` |
| `horas materia (cátedra)` | `SUM(subject.hours_quantity)` |
| `matriculados` | `SUM(enrolled_quantity)` |
| `cupo` | `SUM(capacity)` |
| `% ocupación` | `SUM(enrolled) / NULLIF(SUM(capacity),0)` |

### 7.2 Dimensiones

| Dimensión | Clave | Atributos |
|---|---|---|
| Periodo | `period_code` | código, orden, etiqueta |
| Docente | `person_id` | documento, nombre, escuela, contrato, activo |
| Materia | `subject_code` | nombre, créditos, horas, activo |
| Grupo | `subject_code + group_code` | modalidad, cupo, bloque, aula, fechas |
| Programa | `program_name` / `program_id` | nombre, escuela, nivel |
| Escuela | `school_id` | nombre, área |
| Modalidad | `modality_norm` | Presencial / Virtual / Sin modalidad |
| Tipo carga | fijo `projection` | — |

### 7.3 Grain (grano) — no romperlo

- **No** sumar créditos a nivel docente sin aclarar que un docente puede tener N materias.
- **No** mezclar periodos sin filtro (un docente puede repetirse en varios periodos).
- Para “docentes con carga en periodo X”, usar `COUNT(DISTINCT person_id)` filtrando `period_code`.

---

## 8. Métricas y tableros sugeridos

### Tablero A — Cobertura por periodo

**Pregunta:** ¿Cuánta carga hay cargada y de cuántos docentes?

KPI:
- Asignaciones por periodo
- Docentes distintos por periodo
- Materias distintas por periodo
- Promedio de asignaciones por docente

```sql
SELECT
  al.period_code,
  COUNT(*)::int AS assignments,
  COUNT(DISTINCT al.person_id)::int AS teachers,
  COUNT(DISTINCT al.subject_code)::int AS subjects,
  ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT al.person_id), 0), 2) AS avg_load_per_teacher
FROM academic_workload.academic_load al
JOIN core.person p ON p.id = al.person_id
WHERE COALESCE(p.is_active, true) = true
GROUP BY al.period_code
ORDER BY al.period_code DESC;
```

### Tablero B — Mix de modalidad

**Pregunta:** ¿Cuánto es presencial vs virtual?

Dimensiones: periodo, escuela, programa  
Medida: asignaciones y % del total

### Tablero C — Carga por escuela / programa

**Pregunta:** ¿Qué unidades académicas concentran más docencia?

Usar:
- escuela del docente (`person.school_id`)
- y/o escuela del programa (`program.school_id`)
- `program_name` cuando `program_id` sea nulo

### Tablero D — Ocupación de grupos

**Pregunta:** ¿Qué grupos están llenos / subutilizados?

```text
occupancy_pct = enrolled_quantity / capacity
```

Segmentos sugeridos: `<50%`, `50–80%`, `80–100%`, `>100%` (sobre-cupo), `sin cupo`.

### Tablero E — Docentes sin carga / carga vs planta

**Pregunta:** ¿Quiénes de la planta activa no tienen asignación en el periodo?

```sql
-- Docentes activos sin carga en un periodo
SELECT p.id, p.document, p.full_name, p.school_id
FROM core.person p
WHERE COALESCE(p.is_active, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM academic_workload.academic_load al
    WHERE al.person_id = p.id
      AND al.period_code = :period
  );
```

(Acotar por `role_id` / jerarquía docente según definición de planta.)

### Tablero F — Calidad del dato / gaps

KPI de confianza del snapshot:

| KPI | Cómo medirlo |
|---|---|
| % asignaciones sin `program_name` ni `program_id` | `program` vacío |
| % sin modalidad normalizable | `modality_norm = Sin modalidad` |
| % subjects con `hours_quantity = 0` | impacto en cátedra |
| % subjects con `credits_quantity = 0` | calidad académica |
| Omisiones por persona faltante | desde progress JSON del import |
| Desfase ACA vs Orbit | comparar `total_assignments` del JSON vs `COUNT(*)` en DB |

### Tablero G — Balance de horas (cruzado con Horas Sustantivas)

Por docente:
- contrato (42/21)
- cátedra (`SUM(subject.hours_quantity)`)
- preparación (tabla o default 4)
- sustantivas asignadas
- restantes

Útil para alertas de sobrecarga / subutilización.

---

## 9. Contratos de datos ya expuestos por API (referencia)

Si el tablero consume API en lugar de SQL directo:

### `GET /api/academic-load`

Filtros: `teacher_document`, `period`, `unit_name` / `search` (busca nombre docente, email, edu_email, documento, materia, programa), `modality`, `type`, `page`, `limit` (máx 500).

Campos de fila:

| Campo API | Origen |
|---|---|
| `id` | `academic_load.id` |
| `teacher_document` | `person.document` |
| `teacher_name` | `person.full_name` |
| `program` | `COALESCE(program_name, program.name)` |
| `subject_name` | `subject.name` |
| `credits` | `subject.credits_quantity` |
| `modality` | `class_group.modality` |
| `period` | `period_code` |
| `type` | literal `'projection'` |
| `subject_code` / `group_code` | códigos |

### `GET /api/academic-load/summary`

Por periodo:

- `period`
- `type` = `projection`
- `total_subjects` = `COUNT(*)` (ojo: es **conteo de asignaciones**, no de materias distintas)
- `total_teachers` = `COUNT(DISTINCT person_id)`

### `GET /api/academic-load/teacher/:document`

Misma forma de fila, filtrada a un docente.

> Para tableros analíticos densos, preferir **SQL / vista materializada / extract**, no paginar la API.

---

## 10. Diccionario rápido de campos “para pintar”

| Nombre amigable | Campo técnico | Tipo visual sugerido |
|---|---|---|
| Periodo | `period_code` | filtro / eje X |
| Docente | `teacher_name` / `document` | dimensión / drill |
| Escuela | `school.name` | filtro / stacked bar |
| Programa | `program_name` | filtro / treemap |
| Materia | `subject_name` | tabla / búsqueda |
| Créditos | `credits_quantity` | KPI / suma |
| Modalidad | `modality_norm` | donut / stacked |
| Grupo | `group_code` | detalle |
| Cupo | `capacity` | KPI |
| Matriculados | `enrolled_quantity` | KPI |
| % ocupación | calculado | gauge / heatmap |
| Horas importadas | `substantive_hours_quantity` | KPI (con caveat) |
| Horas cátedra | `subject.hours_quantity` | KPI horas |
| Tipo | `projection` | badge fijo |

---

## 11. Caveats críticos para quien construye el tablero

1. **Snapshot, no histórico:** un reimport limpia y reemplaza. Si necesitas tendencia temporal, versiona extracts (`as_of_date`).
2. **`total_subjects` en summary ≠ materias distintas:** es conteo de filas de carga.
3. **Programa dual:** prioriza `program_name`; `program_id` puede estar vacío.
4. **Horas en dos campos distintos:** no confundir `academic_load.substantive_hours_quantity` con `subject.hours_quantity`.
5. **Match de documento por dígitos:** diferencias de formato (`CC 1.234.567` vs `1234567`) se normalizan en import; en cruce manual, normalizar igual.
6. **Escuela del docente ≠ escuela del programa:** define cuál usa cada visual.
7. **Activos vs todos:** alinear con la regla de producto si el tablero es “oficial Orbit”.
8. **Sin workflow de aprobación:** cualquier “estado” habría que inventarlo fuera del modelo actual.

---

## 12. Checklist de implementación de un tablero

- [ ] Definir periodo(s) objetivo y si se permiten multi-periodo
- [ ] Fijar grain: asignación / docente / grupo
- [ ] Elegir dimensión de escuela (persona vs programa)
- [ ] Normalizar modalidad
- [ ] Decidir inclusión de docentes inactivos
- [ ] Validar cobertura de `hours_quantity` y `credits_quantity`
- [ ] Medir gap vs ACA (asignaciones omitidas)
- [ ] Versionar extract con fecha de corte del import
- [ ] Documentar cada KPI con fórmula exacta
- [ ] Separar tableros de **operación** (cobertura/ocupación) vs **horas** (cátedra/balance)

---

## 13. Resumen ejecutivo

La carga académica en Orbit es un **snapshot de proyección docente** (ACA → DB) modelado como hecho `academic_load` con dimensiones de materia, grupo, persona, periodo y programa.  
Para tableros: usar **periodo + escuela + modalidad + programa** como cortes principales; medir **asignaciones, docentes, ocupación y calidad de dato**; y tratar el dataset como **reemplazable en cada import**, no como histórico nativo.

---

*Documento orientado a analítica / BI / diseño de tableros. Actualizar si cambia el modelo `academic_workload` o el contrato del import ACA.*
