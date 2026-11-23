import React, { createContext, useContext } from 'react';
import { ViewfinderCircleIcon } from '@heroicons/react/24/outline';

type PlantaWheelContextValue = {
  /** Nodo que la rueda tiene en el centro o resaltado. */
  currentKey: string | null;
  focus: (nodeKey: string) => void;
};

const PlantaWheelContext = createContext<PlantaWheelContextValue | null>(null);

export const PlantaWheelProvider = PlantaWheelContext.Provider;

/**
 * Botón "Ver en la rueda" de las tarjetas de la lista. No se muestra fuera
 * del proveedor ni para el nodo que la rueda ya muestra.
 */
export function FocusInWheelButton({ nodeKey }: { nodeKey: string }) {
  const wheel = useContext(PlantaWheelContext);
  if (!wheel || wheel.currentKey === nodeKey) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        wheel.focus(nodeKey);
      }}
      className="hidden items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-orbit-muted hover:bg-orbit-interactive hover:text-orbit-text md:inline-flex"
      title="Centrar la rueda en esta persona"
    >
      <ViewfinderCircleIcon className="h-4 w-4" />
      <span className="hidden lg:inline">Ver en la rueda</span>
    </button>
  );
}
