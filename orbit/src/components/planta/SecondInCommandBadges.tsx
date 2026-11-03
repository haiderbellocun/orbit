import React from 'react';
import type { PlantaPerson } from '@/src/types';

export function SecondInCommandBadges({ person }: { person: PlantaPerson }) {
  if (person.status !== 'active' || !person.second_in_command_scopes?.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1">
    {person.second_in_command_scopes.map((scope) => <span key={scope} className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-orbit-text">
      Segundo al mando · {scope}
    </span>)}
  </div>;
}
