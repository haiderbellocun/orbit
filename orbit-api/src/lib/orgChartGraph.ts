/**
 * Lectura del grafo visual de Organigrama (mismo contrato que el módulo Organigrama).
 * Core no define quién cuelga de quién: solo `organigrama.org_visual_relation`
 * y `org_visual_relation_position_child`.
 */

import { pool } from "../db/connection";
import { resolveCoreSchemaMode } from "./coreSchema";
import {
  applyPlantaOrgOverrides,
  type PlantaOrgOverride,
} from "./orgChartTreeEngine";

export const ORG_CHART_ROOT_PERSON_ID = 1144;

export type OrgChartVersionInfo = {
  id: number;
  code: string;
  name: string;
  periodLabel: string | null;
  isActive: boolean;
  isLocked: boolean;
  scopeType: string;
};

export type OrgVisualRelationRow = {
  id: number;
  parent_person_id: number;
  child_person_id: number;
  visual_level: number | null;
};

export type OrgPositionChildRow = {
  parent_relation_id: number;
  child_person_id: number;
  visual_level: number | null;
};

export type OrgPersonOverrideRow = {
  person_id: number;
  role_id_override: number | null;
  display_name_override: string | null;
};

export type OrgRelationOverrideRow = {
  relation_id: number;
  role_id_override: number | null;
  assignment_status: string | null;
  assignment_label: string | null;
};

export type OrgChartGraph = {
  version: OrgChartVersionInfo;
  rootPersonId: number;
  canMutate: boolean;
  relations: OrgVisualRelationRow[];
  positionChildren: OrgPositionChildRow[];
  personOverrides: OrgPersonOverrideRow[];
  relationOverrides: OrgRelationOverrideRow[];
  plantaOverrides: PlantaOrgOverride[];
};

export async function resolveActiveGlobalVersion(): Promise<OrgChartVersionInfo | null> {
  const exists = await pool.query(
    `SELECT to_regclass('organigrama.org_chart_version') AS t`
  );
  if (!exists.rows[0]?.t) return null;

  const { rows } = await pool.query(
    `SELECT id, code, name, period_label, is_active, is_locked, scope_type
     FROM organigrama.org_chart_version
     WHERE scope_type = 'GLOBAL' AND is_active = true
     ORDER BY id DESC
     LIMIT 1`
  );
  const row = rows[0] as
    | {
        id: string | number;
        code: string;
        name: string;
        period_label: string | null;
        is_active: boolean;
        is_locked: boolean;
        scope_type: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    periodLabel: row.period_label,
    isActive: Boolean(row.is_active),
    isLocked: Boolean(row.is_locked),
    scopeType: String(row.scope_type),
  };
}

export async function loadOrgChartGraph(
  versionId?: number
): Promise<OrgChartGraph | null> {
  const version =
    versionId != null
      ? await loadVersionById(versionId)
      : await resolveActiveGlobalVersion();
  if (version == null) return null;

  const relExists = await pool.query(
    `SELECT to_regclass('organigrama.org_visual_relation') AS t`
  );
  if (!relExists.rows[0]?.t) return null;

  const [relations, positionChildren, personOverrides, relationOverrides, plantaOverrides] =
    await Promise.all([
      pool.query(
        `SELECT id, parent_person_id, child_person_id, visual_level
         FROM organigrama.org_chart_effective_relations($1, ARRAY[]::bigint[])
         ORDER BY visual_level ASC NULLS LAST, child_person_id ASC`,
        [version.id]
      ),
      pool.query(
        `SELECT parent_relation_id, child_person_id, visual_level
         FROM organigrama.org_visual_relation_position_child
         WHERE version_id = $1 AND is_active = true
         ORDER BY visual_level ASC NULLS LAST, child_person_id ASC`,
        [version.id]
      ),
      pool.query(
        `SELECT person_id, role_id_override, display_name_override
         FROM organigrama.org_chart_person_override
         WHERE version_id = $1`,
        [version.id]
      ),
      pool.query(
        `SELECT relation_id, role_id_override, assignment_status, assignment_label
         FROM organigrama.org_visual_relation_override
         WHERE version_id = $1 AND is_active = true`,
        [version.id]
      ),
      listPlantaOrgOverrides(),
    ]);

  return {
    version,
    rootPersonId: ORG_CHART_ROOT_PERSON_ID,
    canMutate: true,
    relations: relations.rows.map((r) => ({
      id: Number(r.id),
      parent_person_id: Number(r.parent_person_id),
      child_person_id: Number(r.child_person_id),
      visual_level:
        r.visual_level == null ? null : Number(r.visual_level),
    })),
    positionChildren: positionChildren.rows.map((r) => ({
      parent_relation_id: Number(r.parent_relation_id),
      child_person_id: Number(r.child_person_id),
      visual_level:
        r.visual_level == null ? null : Number(r.visual_level),
    })),
    personOverrides: personOverrides.rows.map((r) => ({
      person_id: Number(r.person_id),
      role_id_override:
        r.role_id_override == null ? null : Number(r.role_id_override),
      display_name_override:
        r.display_name_override == null
          ? null
          : String(r.display_name_override),
    })),
    relationOverrides: relationOverrides.rows.map((r) => ({
      relation_id: Number(r.relation_id),
      role_id_override:
        r.role_id_override == null ? null : Number(r.role_id_override),
      assignment_status:
        r.assignment_status == null ? null : String(r.assignment_status),
      assignment_label:
        r.assignment_label == null ? null : String(r.assignment_label),
    })),
    plantaOverrides,
  };
}

async function loadVersionById(id: number): Promise<OrgChartVersionInfo | null> {
  const { rows } = await pool.query(
    `SELECT id, code, name, period_label, is_active, is_locked, scope_type
     FROM organigrama.org_chart_version
     WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    periodLabel: row.period_label ?? null,
    isActive: Boolean(row.is_active),
    isLocked: Boolean(row.is_locked),
    scopeType: String(row.scope_type),
  };
}

export function serializeOrgChartGraph(graph: OrgChartGraph) {
  const effective = applyPlantaOrgOverrides(
    graph.relations,
    graph.positionChildren,
    graph.plantaOverrides
  );
  return {
    version: {
      id: graph.version.id,
      code: graph.version.code,
      name: graph.version.name,
      period_label: graph.version.periodLabel,
      is_locked: graph.version.isLocked,
    },
    root_person_id: graph.rootPersonId,
    can_mutate: true,
    relations: effective.relations,
    position_children: effective.positionChildren,
    person_overrides: graph.personOverrides,
    relation_overrides: graph.relationOverrides,
    planta_overrides: graph.plantaOverrides,
  };
}

async function plantaOverrideTable(): Promise<string | null> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) return null;
  const qualified =
    mode === "core" ? "core.planta_org_override" : "public.planta_org_override";
  const exists = await pool.query(`SELECT to_regclass($1) AS t`, [qualified]);
  if (!exists.rows[0]?.t) return null;
  return qualified;
}

export async function listPlantaOrgOverrides(): Promise<PlantaOrgOverride[]> {
  const table = await plantaOverrideTable();
  if (table == null) return [];
  const { rows } = await pool.query(
    `SELECT person_id, parent_person_id FROM ${table}`
  );
  return rows.map((r) => ({
    person_id: Number(r.person_id),
    parent_person_id:
      r.parent_person_id == null ? null : Number(r.parent_person_id),
  }));
}

export async function upsertPlantaOrgOverride(
  personId: number,
  parentPersonId: number | null
): Promise<void> {
  const table = await plantaOverrideTable();
  if (table == null) {
    throw new Error("planta_org_override no está disponible");
  }
  await pool.query(
    `INSERT INTO ${table} (person_id, parent_person_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (person_id)
     DO UPDATE SET parent_person_id = EXCLUDED.parent_person_id, updated_at = NOW()`,
    [personId, parentPersonId]
  );
}

/** Asigna el mismo responsable a varias personas en una sola transacción. */
export async function upsertPlantaOrgOverridesBulk(
  childPersonIds: readonly number[],
  parentPersonId: number | null
): Promise<void> {
  if (childPersonIds.length === 0) return;
  const table = await plantaOverrideTable();
  if (table == null) {
    throw new Error("planta_org_override no está disponible");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const childId of childPersonIds) {
      await client.query(
        `INSERT INTO ${table} (person_id, parent_person_id, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (person_id)
         DO UPDATE SET parent_person_id = EXCLUDED.parent_person_id, updated_at = NOW()`,
        [childId, parentPersonId]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deletePlantaOrgOverride(personId: number): Promise<void> {
  const table = await plantaOverrideTable();
  if (table == null) return;
  await pool.query(`DELETE FROM ${table} WHERE person_id = $1`, [personId]);
}

export async function listParentEdgesForChild(
  versionId: number,
  childPersonId: number
): Promise<OrgVisualRelationRow[]> {
  const { rows } = await pool.query(
    `SELECT id, parent_person_id, child_person_id, visual_level
     FROM organigrama.org_visual_relation
     WHERE version_id = $1
       AND child_person_id = $2
       AND is_active = true`,
    [versionId, childPersonId]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    parent_person_id: Number(r.parent_person_id),
    child_person_id: Number(r.child_person_id),
    visual_level: r.visual_level == null ? null : Number(r.visual_level),
  }));
}

export async function deactivateChildEdges(
  versionId: number,
  childPersonId: number
): Promise<void> {
  await pool.query(
    `UPDATE organigrama.org_visual_relation
     SET is_active = false, updated_at = NOW()
     WHERE version_id = $1 AND child_person_id = $2 AND is_active = true`,
    [versionId, childPersonId]
  );
  await pool.query(
    `UPDATE organigrama.org_visual_relation_position_child
     SET is_active = false, updated_at = NOW()
     WHERE version_id = $1 AND child_person_id = $2 AND is_active = true`,
    [versionId, childPersonId]
  );
}

export async function insertDirectReportEdge(input: {
  versionId: number;
  parentPersonId: number;
  childPersonId: number;
}): Promise<{ id: number }> {
  const existing = await pool.query(
    `SELECT id, is_active
     FROM organigrama.org_visual_relation
     WHERE version_id = $1 AND parent_person_id = $2 AND child_person_id = $3`,
    [input.versionId, input.parentPersonId, input.childPersonId]
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0] as { id: number; is_active: boolean };
    if (!row.is_active) {
      await pool.query(
        `UPDATE organigrama.org_visual_relation
         SET is_active = true, updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
    }
    return { id: Number(row.id) };
  }
  const inserted = await pool.query(
    `INSERT INTO organigrama.org_visual_relation (
       version_id, parent_person_id, child_person_id,
       relation_type, visual_level, is_active, created_at, updated_at
     ) VALUES ($1, $2, $3, 'DIRECT_REPORT', NULL, true, NOW(), NOW())
     RETURNING id`,
    [input.versionId, input.parentPersonId, input.childPersonId]
  );
  return { id: Number(inserted.rows[0].id) };
}
