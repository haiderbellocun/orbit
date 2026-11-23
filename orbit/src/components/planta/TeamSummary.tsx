import React from 'react';
import { cn } from '@/src/lib/utils';
import {
  canHaveDirectReports,
  emptyTeamMessage,
} from '@/src/lib/roleHierarchy';
import {
  teamComposition,
  type OrganizationNode,
} from '@/src/lib/organizationTree';

type TeamSummaryProps = {
  node: OrganizationNode;
  /** Permite asignar desde el mensaje de equipo vacío. */
  canAssign: boolean;
  onAssign: (personId: string) => void;
  size?: 'sm' | 'md';
  className?: string;
};

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString('es-CO')} ${n === 1 ? one : many}`;
}

/**
 * Resumen del equipo de una tarjeta de Planta Activa. Cuenta todo el subárbol
 * con el mismo criterio del resumen general; sin equipo muestra el mensaje
 * según el rol en lugar de "0 líderes · 0 colaboradores".
 */
export const TeamSummary: React.FC<TeamSummaryProps> = ({
  node,
  canAssign,
  onAssign,
  size = 'md',
  className,
}) => {
  const person = node.person;
  const team = teamComposition(node);
  const text = size === 'sm' ? 'text-xs' : 'text-sm';

  if (team.total === 0) {
    const role = { roleName: person.role_name, roleCode: person.role_code };
    return (
      <p className={cn(text, 'text-orbit-muted', className)}>
        {emptyTeamMessage(role)}
        {canAssign && canHaveDirectReports(role) && (
          <>
            {' '}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAssign(person.id);
              }}
              className="font-bold text-orbit-primary hover:text-orbit-primary-hover"
            >
              Asignar colaborador
            </button>
          </>
        )}
      </p>
    );
  }

  const parts = [
    team.coordinators > 0 &&
      plural(team.coordinators, 'coordinación', 'coordinaciones'),
    team.leaders > 0 && plural(team.leaders, 'líder', 'líderes'),
    team.collaborators > 0 &&
      plural(team.collaborators, 'colaborador', 'colaboradores'),
  ].filter((p): p is string => Boolean(p));

  return (
    <p
      className={cn(text, 'text-orbit-text-secondary', className)}
      title={`${plural(team.total, 'persona', 'personas')} a cargo en total`}
    >
      {parts.map((part, i) => {
        const [count, ...label] = part.split(' ');
        return (
          <React.Fragment key={part}>
            {i > 0 && <span className="text-orbit-muted"> · </span>}
            <strong className="font-semibold text-orbit-text">{count}</strong>{' '}
            {label.join(' ')}
          </React.Fragment>
        );
      })}
    </p>
  );
};
