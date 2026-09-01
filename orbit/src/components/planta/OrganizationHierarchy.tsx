import React from 'react';
import { getRoleBand } from '@/src/lib/roleHierarchy';
import { isOrgApexPerson, schoolAccent } from '@/src/lib/schoolAccent';
import type {
  AreaGroup,
  OrganizationForest,
  OrganizationNode,
} from '@/src/lib/organizationTree';
import { CoordinatorNode } from '@/src/components/planta/CoordinatorNode';
import { LeaderNode } from '@/src/components/planta/LeaderNode';
import { UnassignedPeopleSection } from '@/src/components/planta/UnassignedPeopleSection';

type OrganizationHierarchyProps = {
  forest: OrganizationForest;
  expandedIds: Set<string>;
  onToggle: (nodeKey: string) => void;
  onManage: (personId: string) => void;
  onAssign: (personId: string) => void;
  emptyMessage: string;
  openUnassigned?: boolean;
  canMutate?: boolean;
  unassignedHeading?: string;
  unassignedHint?: string;
  unassignedTone?: 'warning' | 'muted';
};

function splitApex(forest: OrganizationForest): {
  apex: OrganizationNode[];
  areas: AreaGroup[];
} {
  const apex: OrganizationNode[] = [];
  const areas: AreaGroup[] = [];
  for (const area of forest.areas) {
    const schools = [];
    for (const school of area.schools) {
      const roots = [];
      for (const node of school.roots) {
        if (isOrgApexPerson(node.person)) apex.push(node);
        else roots.push(node);
      }
      if (roots.length > 0) schools.push({ ...school, roots });
    }
    if (schools.length > 0) areas.push({ ...area, schools });
  }
  return { apex, areas };
}

function BranchNode({
  node,
  expandedIds,
  onToggle,
  onManage,
  onAssign,
  canMutate,
  variant = 'default',
}: {
  node: OrganizationNode;
  expandedIds: Set<string>;
  onToggle: (nodeKey: string) => void;
  onManage: (personId: string) => void;
  onAssign: (personId: string) => void;
  canMutate: boolean;
  variant?: 'apex' | 'default';
}) {
  const band = getRoleBand({
    roleName: node.person.role_name,
    roleCode: node.person.role_code,
  });
  if (band === 'coordinator' || variant === 'apex') {
    return (
      <CoordinatorNode
        node={node}
        expandedIds={expandedIds}
        onToggle={onToggle}
        onManage={onManage}
        onAssign={onAssign}
        canMutate={canMutate}
        variant={variant}
      />
    );
  }
  return (
    <LeaderNode
      node={node}
      expandedIds={expandedIds}
      onToggle={onToggle}
      onManage={onManage}
      onAssign={onAssign}
      depth={0}
      canMutate={canMutate}
    />
  );
}

export const OrganizationHierarchy: React.FC<OrganizationHierarchyProps> = ({
  forest,
  expandedIds,
  onToggle,
  onManage,
  onAssign,
  emptyMessage,
  openUnassigned = false,
  canMutate = true,
  unassignedHeading,
  unassignedHint,
  unassignedTone,
}) => {
  const { apex, areas } = splitApex(forest);
  const hasTree =
    apex.length > 0 ||
    areas.some((a) => a.schools.some((s) => s.roots.length > 0));
  if (!hasTree && forest.unassigned.length === 0) {
    return (
      <div className="rounded-2xl border border-orbit-border bg-orbit-surface px-5 py-16 text-center text-orbit-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {apex.map((node) => (
        <BranchNode
          key={node.nodeKey}
          node={node}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onManage={onManage}
          onAssign={onAssign}
          canMutate={canMutate}
          variant="apex"
        />
      ))}
      {areas.map((area) => {
        const areaTone = schoolAccent({ areaName: area.areaName });
        return (
          <section key={area.key} className="space-y-4">
            <div className="flex items-end gap-3">
              <h2
                className="font-display text-sm font-semibold uppercase tracking-widest"
                style={{ color: areaTone.accent }}
              >
                {area.areaName}
              </h2>
              <div
                className="mb-1 h-px flex-1"
                style={{ backgroundColor: areaTone.border }}
              />
            </div>
            {area.schools.map((school) => {
              const tone = schoolAccent({
                schoolId: school.schoolId,
                schoolName: school.schoolName,
                areaName: area.areaName,
              });
              return (
                <div
                  key={school.key}
                  className="space-y-3 rounded-2xl border p-3 sm:p-4"
                  style={{
                    borderColor: tone.border,
                    borderLeftWidth: 4,
                    borderLeftColor: tone.accent,
                    backgroundColor: tone.soft,
                  }}
                >
                  <h3 className="flex items-center gap-2 text-xs font-semibold">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tone.accent }}
                      aria-hidden
                    />
                    <span style={{ color: tone.accent }}>
                      {school.schoolName}
                    </span>
                  </h3>
                  {school.roots.map((node) => (
                    <BranchNode
                      key={node.nodeKey}
                      node={node}
                      expandedIds={expandedIds}
                      onToggle={onToggle}
                      onManage={onManage}
                      onAssign={onAssign}
                      canMutate={canMutate}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}
      <UnassignedPeopleSection
        people={forest.unassigned}
        onManage={onManage}
        defaultOpen={openUnassigned}
        heading={unassignedHeading}
        hint={unassignedHint}
        tone={unassignedTone}
      />
    </div>
  );
};
