# Contexto: Organigrama ← Planta Activa (Orbit)

Documento de contexto para el módulo **Organigrama**, describiendo cómo funciona
hoy **Planta Activa** en Orbit y cómo el Organigrama debe conectarse para leer en
tiempo real la data que Planta Activa genera.

Fuente de verdad del código:
- API: [orbit-api/src/routes/plantaActiva.ts](../orbit-api/src/routes/plantaActiva.ts)
- Grafo: [orbit-api/src/lib/orgChartGraph.ts](../orbit-api/src/lib/orgChartGraph.ts)
- Motor de árbol: [orbit-api/src/lib/orgChartTreeEngine.ts](../orbit-api/src/lib/orgChartTreeEngine.ts)
- Jerarquía de cargos: [orbit-api/src/lib/roleHierarchy.ts](../orbit-api/src/lib/roleHierarchy.ts)
- Acceso: [orbit-api/src/lib/plantaActivaAccess.ts](../orbit-api/src/lib/plantaActivaAccess.ts)
- Front: [orbit/src/lib/organizationTree.ts](../orbit/src/lib/organizationTree.ts), [orbit/src/components/views/PlantaActivaView.tsx](../orbit/src/components/views/PlantaActivaView.tsx)

---

## 1. Qué es Planta Activa

Planta Activa es el registro operativo de **personas** de la institución: quién
está activo, en qué área/escuela/programa, con qué cargo, y de quién depende.
Es la capa donde el negocio edita la organización día a día; el Organigrama es
la capa de visualización de esa misma realidad.

Entidad central: `person` (esquema `core.` o `public.` según
`resolveCoreSchemaMode()`), con joins a `role`, `area`, `school`, `program` y a
sí misma vía `manager_id`.

Campos relevantes por persona (ver `PLANTA_PERSON_SELECT`):

| Campo | Significado |
|---|---|
| `id`, `document`, `type_document`, `full_name` | identidad |
| `email`, `edu_email`, `phone`, `address` | contacto |
| `area_id` / `area` | área funcional (cae a `school.area_id` si la persona no tiene área propia — ver `effectiveAreaSql()`) |
| `school_id` / `school` | escuela |
| `program_id` / `program` | programa académico |
| `role_id`, `role_name`, `role_code` | cargo |
| `manager_id`, `manager_name`, `manager_role_name`, `manager_document` | responsable directo (relación de datos) |
| `second_in_command_scopes` | áreas/escuelas/unidades donde la persona es **segundo al mando** |
| estado activo/inactivo | vía `sqlPersonIsActive` / `sqlPersonIsInactive` / `sqlPersonStatusText` |

---

## 2. Roles y bandas jerárquicas

La prioridad de cargo **no** se infiere en la UI: vive en `roleHierarchy.ts` y
se comparte entre API y front (existe copia espejo en `orbit/src/lib/roleHierarchy.ts`).
El Organigrama debe consumir esta misma lógica, no reimplementarla.

| Banda | Nivel | Se detecta por (normalizado sin tildes, mayúsculas) |
|---|---|---|
| `coordinator` | 100 | COORDINADOR/A, JEFATURA, JEFE/JEFA |
| `leader` | 80 | LITE, LIDER, LIDER ACADEMICO/A |
| `professional` | 60 | contiene PROFESIONAL |
| `analyst` | 40 | contiene ANALISTA |
| `auxiliary` | 20 | contiene AUXILIAR |
| `faculty` | 10 | DOCENTE / DOCENTES |
| `other` | 0 | cualquier otro (no rompe el árbol, queda al final) |

Reglas derivadas:
- `canHaveDirectReports()` → **solo `coordinator` y `leader`** pueden tener equipo
  a cargo. Es la validación usada tanto en UI como al asignar responsable.
- `comparePeopleByHierarchy()` → orden de nodos: primero banda mayor, luego
  nombre alfabético en español.

### Segundos al mando

`person.second_in_command_scopes` es un arreglo de **nombres de ámbito**
(no solo áreas del catálogo: también escuelas y unidades operativas), normalizados
por `normalizeSecondInCommandScopes()`: trim, espacios colapsados, sin tildes,
MAYÚSCULAS, deduplicados, 1–200 caracteres. Una persona puede ser segundo al
mando de varios ámbitos a la vez. El Organigrama debe poder marcar visualmente
estos nodos y ofrecer el filtro "segundos al mando por ámbito".

---

## 3. Modelo de la jerarquía: tres capas

Hay **tres** fuentes de relación jefe→colaborador y conviven con precedencia
explícita. Esto es lo más importante de entender para el Organigrama.

1. **`person.manager_id`** — relación de datos, plana, por persona.
   Validada por `personManager.ts` (`isSelfManager`, `managerAssignmentCreatesCycle`,
   profundidad máx. 64). Es lo que se muestra como "responsable" en las fichas.

2. **Grafo visual del Organigrama** (esquema `organigrama.`) — la base del dibujo:
   - `organigrama.org_chart_version` → versiones; se usa la **GLOBAL activa**
     (`scope_type='GLOBAL' AND is_active`), con `is_locked` y `period_label`.
   - `organigrama.org_chart_effective_relations(version_id, ...)` → aristas
     efectivas `parent_person_id → child_person_id` con `visual_level`.
   - `organigrama.org_visual_relation_position_child` → hijos colgados de una
     **relación** (posición), no de una persona.
   - `organigrama.org_chart_person_override` → `role_id_override`, `display_name_override`.
   - `organigrama.org_visual_relation_override` → `role_id_override`,
     `assignment_status`, `assignment_label` por arista.
   - Raíz fija: `ORG_CHART_ROOT_PERSON_ID = 1144`.

3. **Overrides de Planta Activa** — `core.planta_org_override (person_id, parent_person_id, updated_at)`.
   Es el **ganador por persona** y la pieza que conecta ambos módulos:
   `applyPlantaOrgOverrides()` toma el grafo del Organigrama y, para cada persona
   con override:
   - **con `parent_person_id`** → se eliminan todas sus aristas del organigrama y
     se inserta una arista sintética con `id = -person_id` (ids negativos
     identifican aristas nacidas en Planta);
   - **con `parent_person_id = NULL`** → la persona queda **sin responsable** en
     Planta (aparece en el panel "Sin responsable asignado") y el organigrama base
     no se modifica.

   Precedencia de hijos en `childrenForPerson()`: (1) `position_child` de la
   relación → (2) aristas por `parent_person_id`. No hay fallback por rol.

   Clave estable de nodo (`orgNodeKey`): `rel:<relationId>` → `pos:<parentRelationId>:<personId>` → `person:<personId>`.
   Úsala para expandir/colapsar y para diffs, nunca el `person_id` solo (una
   persona puede figurar en más de una posición).

### Anti-ciclos

`assignmentCreatesOrgCycle(child, newParent, parentByChild)` recorre hacia arriba
el índice `parentByChildFromRelations()` y rechaza tanto auto-asignación como
cualquier ciclo. Toda mutación del Organigrama debe pasar por ahí.

### Utilidades de alcance (ya implementadas, reutilizables)

- `collectHierarchyLinePersonIds(personId, ...)` → cadena completa de superiores + toda la rama de descendientes + la persona. Es el alcance de la "vista de mi línea".
- `collectHierarchyDescendantPersonIds(...)` → solo la rama hacia abajo.
- `collectImmediateManagerPersonIds(...)` → jefes inmediatos (considera aristas y position_children).

---

## 4. Endpoints que el Organigrama debe consumir

Todos bajo la API de Orbit, con sesión por cookie (`sessionCookie.ts`) y
middleware `orbitAuth`.

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/planta-activa` | listado + (con `include_org=1`) el grafo serializado |
| `GET` | `/planta-activa/:id` | ficha de una persona |
| `POST` | `/planta-activa` | alta de persona |
| `PATCH` | `/planta-activa/:id` | edición (datos, área, escuela, programa, rol, activar/inactivar) |
| `PATCH` | `/planta-activa/:id/org-parent` | reasignar responsable de una persona; `{follow_organigrama:true}` borra el override y devuelve la persona a la relación del organigrama |
| `POST` | `/planta-activa/org-parents/bulk` | asignar el mismo responsable a hasta **200** personas en una transacción; responde `{assigned[], failed[{person_id,error}], assigned_count, failed_count}` |

### `GET /planta-activa` — filtros soportados

`search`, `area_id`, `school_id`, `program_id`, `role_id`,
`without_school`, `without_program`, `without_role`, `without_edu_email`,
`without_document`, `status` (`active` por defecto | `inactive`),
`page`, `limit`, `include_org`.

### Forma del `org` (`serializeOrgChartGraph`)

```jsonc
{
  "version": { "id", "code", "name", "period_label", "is_locked" },
  "root_person_id": 1144,
  "can_mutate": true,
  "relations":          [{ "id", "parent_person_id", "child_person_id", "visual_level" }],
  "position_children":  [{ "parent_relation_id", "child_person_id", "visual_level" }],
  "person_overrides":   [{ "person_id", "role_id_override", "display_name_override" }],
  "relation_overrides": [{ "relation_id", "role_id_override", "assignment_status", "assignment_label" }],
  "planta_overrides":   [{ "person_id", "parent_person_id" }]
}
```

`relations` y `position_children` **ya vienen con los overrides de Planta
aplicados**; `planta_overrides` se entrega aparte solo para distinguir en la UI
qué aristas nacieron en Planta (también reconocibles por `id < 0`).

---

## 5. Cómo se arma el árbol en el front (referencia)

`orbit/src/lib/organizationTree.ts` ya construye el bosque y es el patrón a
replicar/reutilizar en Organigrama:

- `parseOrgChartGraph(raw)` valida el payload `org`.
- `overlayOrgParents(people, graph)` aplica al listado el padre efectivo del grafo.
- `buildOrganizationHierarchy(...)` → `OrganizationForest`:
  - agrupa en **Área → Escuela → raíces** (`AreaGroup` / `SchoolGroup`);
  - cada `OrganizationNode` lleva `person`, `nodeKey`, `relationId`,
    `parentPersonId`, `visualLevel`, `assignmentStatus`, `assignmentLabel`,
    `hierarchyLevel`, `band`, `children`, `directReportsCount`,
    `totalReportsCount`, `leaderCount`, `isContextOnly`;
  - `unassigned` = personas sin responsable (excluye el área Harvey/investigación,
    ver `isPlantaUnassignedCandidate` / `harveyArea.ts`);
  - `counts`: total, coordinadores, líderes, colaboradores, sin asignar.
- Auxiliares: `filterOrganizationForest`, `personMatchesQuery`,
  `collectExpandableIds`, `collectDescendantIds`, `findCoordinatorAndLeader`,
  `directReportsOf`, `directManagerOf`, `splitReports`, `isBranchNode`.

---

## 6. Cambios entre áreas y trazabilidad

- El **cambio de área/escuela/programa/rol** de una persona es un
  `PATCH /planta-activa/:id`. El área efectiva se recalcula con
  `effectiveAreaSql()` = `COALESCE(person.area_id, school.area_id)`, así que mover
  la escuela puede mover a la persona de área sin tocar `area_id`.
- El **cambio de responsable** es independiente del cambio de área
  (`PATCH .../org-parent` o el bulk). Mover a alguien de área **no** reasigna
  automáticamente su jefe: pueden quedar personas colgando de un jefe de otra área,
  y el Organigrama debe poder señalarlo.
- La **inactivación** (`is_active:false`) puede generar una **vacante**
  automáticamente (`create_vacancy`, por defecto `true`), salvo roles excluidos
  (`shouldSkipVacancyOnInactivation`), notifica por
  `vacancyNotifyService.notifyVacancyCreated` y purga horas docentes
  (`purgeTeacherHoursForPerson`). El listado `status=inactive` permite ver el
  histórico de salidas.
- **Eventos de planta** (`workforce_events`, ver [routes/workforce_events.ts](../orbit-api/src/routes/workforce_events.ts)):
  `workforce_events.event` + `event_type` + `event_status_log`.
  `GET /workforce-events/events` (filtrable por `event_type_id`, persona, etc.),
  `POST /workforce-events/events`, `PATCH /workforce-events/events/:id` (solo
  `status`, con log), `GET /workforce-events/events/:id/status-log`.
  Es la fuente para una **línea de tiempo** de movimientos en el Organigrama.
- **Reincorporaciones**: `routes/reinstatements.ts`.

> Nota: hoy `planta_org_override` solo guarda `updated_at`, sin autor ni motivo.
> Si el Organigrama necesita auditoría de reasignaciones (quién movió a quién y
> por qué), hay que añadir esas columnas o registrar un `workforce_event` en cada
> `org-parent`. **Está pendiente.**

---

## 7. Permisos y visibilidad

`plantaActivaAccess.ts` define grants por email (allowlist, fuera del admin):

- `viewAreaIds` — áreas visibles; `null` = toda la planta.
- `editAreaIds` — áreas gestionables; `null` = todas.
- `hierarchyScoped` — recorta la vista a **la línea del usuario** (sus jefes, él y
  sus descendientes) vía `collectHierarchyLinePersonIds`.
- `canEditHierarchy` — permite editar dentro de ese alcance.
- `hierarchyStartsAtManager` — para perfiles LITE: corta los superiores por encima
  de su responsable inmediato.
- `personalDataOnly` — solo datos personales; **bloquea estructura y asignaciones**
  (los endpoints `org-parent` y el bulk responden **403**).
- `excludeLiteAndDocenteRoles` — oculta y bloquea personal LITE/LÍDER y DOCENTE.
- `extraCapabilities` — capacidades además de `view:planta_activa`
  (p. ej. `view:vacancies`, `view:academic_load`, `view:substantive_hours`,
  `view:news`, `roles:manage`).

Además existe `schoolScopeFromRequest(req)`: si el usuario está acotado a una
escuela, cualquier mutación sobre una persona de otra escuela devuelve 403.

**El Organigrama debe respetar exactamente estos mismos límites**: no dibujar
nodos fuera del alcance de vista, y deshabilitar drag/reasignación donde
`canEditPlantaPerson()` sea falso. Los nodos traídos solo para dar contexto de la
cadena superior se marcan con `isContextOnly`.

---

## 8. Carga de datos y "tiempo real"

Estado actual (`usePlantaPeople.ts`):

- La jerarquía necesita la planta **completa**, no una página: pagina con
  `limit = 5000` hasta agotar `pagination.total`, con tope `MAX_PAGES = 20`.
- El grafo `org` se pide **solo en la primera página del listado activo**
  (`include_org=1` con `status=active`).
- `reload({silent:true})` refresca sin mostrar el esqueleto; es lo que se llama
  después de cada mutación.
- **No hay WebSocket ni SSE en el proyecto.** El único polling existente es el de
  notificaciones (60 s, `NotificationBell.tsx`).

Recomendación para el Organigrama en tiempo real:

1. Consumir el mismo `GET /planta-activa?include_org=1&status=active` para tener
   una sola fuente de verdad (personas + grafo en la misma respuesta).
2. Refrescar con `reload({silent:true})` tras cada mutación propia, y aplicar
   **actualización optimista** de la arista movida usando `nodeKey`.
3. Para ver cambios de **otros usuarios**: polling silencioso (30–60 s) como
   primer paso; si se requiere latencia menor, añadir SSE en la API publicando
   los eventos de `org-parent` / `PATCH persona` — hoy no existe esa
   infraestructura y habría que crearla.
4. Cachear el grafo por `version.id` y no re-renderizar el bosque completo si
   `relations`, `position_children` y `planta_overrides` no cambiaron.

---

## 9. Invariantes a respetar

1. La jerarquía **no** se deriva del rol: viene del grafo. `roleHierarchy` solo
   ordena y decide quién *puede* tener equipo.
2. Solo `coordinator` y `leader` reciben reportes directos (`canHaveDirectReports`).
3. Un override de Planta gana sobre el organigrama, por persona; `NULL` = sin
   responsable, sin tocar el organigrama base.
4. Ninguna asignación puede crear un ciclo ni ser auto-asignación.
5. Área efectiva = `COALESCE(person.area_id, school.area_id)`.
6. Los nombres de ámbito de segundo al mando van normalizados (sin tildes, mayúsculas).
7. Los ids de arista negativos son sintéticos de Planta: no existen en
   `organigrama.org_visual_relation` y no se pueden actualizar allí.
8. El máximo del cargue masivo es 200 personas por request.
