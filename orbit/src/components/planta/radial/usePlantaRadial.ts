import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrganizationForest, OrganizationNode } from '@/src/lib/organizationTree';
import { isOrgApexPerson } from '@/src/lib/schoolAccent';
import {
  areaPeople,
  areaWheelEntries,
  childWheelEntries,
  crumbLabel,
  entryFromNode,
  indexOrganizationNodes,
  isAreaCatalog,
  scopeForestToNode,
  topWheelEntries,
  unassignedWheelEntry,
  type WheelEntry,
} from '@/src/components/planta/radial/radialModel';

export type RadialCrumb = {
  key: string;
  label: string;
};

const DRILL_MS = 700;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function usePlantaRadial(
  forest: OrganizationForest,
  /** Persona que hace de piso de la rueda (p. ej. el LITE con su equipo). */
  floorPersonId?: string | null
) {
  const [path, setPath] = useState<string[]>([]);
  const [areaKey, setAreaKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mode, setMode] = useState<'tree' | 'unassigned'>('tree');
  const drillTimer = useRef<number | null>(null);

  const catalog = useMemo(() => isAreaCatalog(forest), [forest]);
  const index = useMemo(() => indexOrganizationNodes(forest), [forest]);
  const floorKey = useMemo(() => {
    if (catalog) return null;
    for (const node of index.values()) {
      if (floorPersonId != null) {
        if (node.person.id === floorPersonId) return node.nodeKey;
      } else if (isOrgApexPerson(node.person)) {
        return node.nodeKey;
      }
    }
    return null;
  }, [catalog, index, floorPersonId]);
  // Con dirección, el nivel más alto es ella y no se puede salir de ahí. Sin
  // ella (acceso acotado a un área), se puede volver hasta la vista "Planta".
  const minDepth = floorKey ? 1 : 0;
  const withFloor = useCallback(
    (keys: string[]) => (keys.length === 0 && floorKey ? [floorKey] : keys),
    [floorKey]
  );

  const clearDrill = useCallback(() => {
    if (drillTimer.current != null) {
      window.clearTimeout(drillTimer.current);
      drillTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearDrill(), [clearDrill]);

  useEffect(() => {
    setPath((prev) => {
      let cut = prev.length;
      for (let i = 0; i < prev.length; i += 1) {
        if (!index.has(prev[i])) {
          cut = i;
          break;
        }
      }
      const pruned = cut === prev.length ? prev : prev.slice(0, cut);
      if (pruned.length === 0 && floorKey) return [floorKey];
      return pruned;
    });
    setActiveKey((key) => {
      if (key == null) return key;
      if (key === 'unassigned') return forest.unassigned.length > 0 ? key : null;
      if (key.startsWith('area:')) {
        return forest.areas.some((area) => `area:${area.key}` === key) ? key : null;
      }
      return index.has(key) ? key : null;
    });
    setAreaKey((key) => {
      if (!key) return key;
      return forest.areas.some((area) => `area:${area.key}` === key) ? key : null;
    });
    if (forest.unassigned.length === 0) {
      setMode((current) => (current === 'unassigned' ? 'tree' : current));
    }
  }, [floorKey, forest.areas, forest.unassigned.length, index]);

  const visiblePath = useMemo(() => withFloor(path), [path, withFloor]);
  const pathNodes = useMemo(
    () =>
      visiblePath
        .map((key) => index.get(key))
        .filter((node): node is OrganizationNode => node != null),
    [index, visiblePath]
  );
  const current = pathNodes[pathNodes.length - 1] ?? null;
  const selectedArea = useMemo(
    () => forest.areas.find((area) => `area:${area.key}` === areaKey) ?? null,
    [areaKey, forest.areas]
  );
  const activeNode =
    activeKey && activeKey !== 'unassigned' && !activeKey.startsWith('area:')
      ? index.get(activeKey) ?? null
      : null;
  const displayed = mode === 'unassigned' ? null : activeNode ?? current;

  const entries = useMemo(() => {
    if (current) {
      const children = childWheelEntries(current);
      // En el nivel más alto (la dirección) también va "Sin responsable":
      // con dirección nunca se llega a la vista "Planta" donde vivía.
      if (floorKey && current.nodeKey === floorKey) {
        const loose = unassignedWheelEntry(forest, catalog);
        if (loose) return [...children, loose];
      }
      return children;
    }
    if (selectedArea) return areaWheelEntries(selectedArea);
    return topWheelEntries(forest);
  }, [catalog, current, floorKey, forest, selectedArea]);

  const panelForest = useMemo(() => {
    if (mode === 'unassigned') {
      return { ...forest, areas: [] };
    }
    if (displayed) return scopeForestToNode(displayed, forest);
    if (selectedArea) return { ...forest, areas: [selectedArea], unassigned: [] };
    return forest;
  }, [displayed, forest, mode, selectedArea]);

  const crumbs = useMemo(() => {
    const items: RadialCrumb[] = [];
    for (const node of pathNodes) {
      items.push({ key: node.nodeKey, label: crumbLabel(node) });
    }
    if (selectedArea && pathNodes.length === 0) {
      items.push({ key: `area:${selectedArea.key}`, label: selectedArea.areaName });
    }
    if (activeNode && activeNode.nodeKey !== current?.nodeKey) {
      items.push({ key: activeNode.nodeKey, label: crumbLabel(activeNode) });
    } else if (mode === 'unassigned') {
      items.push({ key: 'unassigned', label: catalog ? 'Sin área' : 'Sin responsable' });
    }
    return items;
  }, [activeNode, catalog, current?.nodeKey, mode, pathNodes, selectedArea]);

  const highlightEntry = useCallback(
    (entry: WheelEntry) => {
      clearDrill();
      if (entry.kind === 'unassigned') {
        setAreaKey(null);
        setPath([]);
        setActiveKey('unassigned');
        setMode('unassigned');
        return;
      }
      setMode('tree');
      setActiveKey(entry.key);
    },
    [clearDrill]
  );

  const selectEntry = useCallback(
    (entry: WheelEntry) => {
      highlightEntry(entry);
      if (entry.kind === 'unassigned' || !entry.canDrill) return;
      const wait = prefersReducedMotion() ? 0 : DRILL_MS;
      drillTimer.current = window.setTimeout(() => {
        drillTimer.current = null;
        if (entry.kind === 'area') {
          setAreaKey(entry.key);
          setPath([]);
          setActiveKey(null);
          setMode('tree');
          return;
        }
        if (!entry.node) return;
        setAreaKey(null);
        setPath((prev) => {
          const base = withFloor(prev);
          return base[base.length - 1] === entry.key ? base : [...base, entry.key];
        });
        setActiveKey(null);
      }, wait);
    },
    [highlightEntry, withFloor]
  );

  const goToCrumb = useCallback(
    (crumbIndex: number) => {
      clearDrill();
      setMode('tree');
      setActiveKey(null);
      setPath((prev) => withFloor(prev).slice(0, Math.max(minDepth, crumbIndex + 1)));
    },
    [clearDrill, minDepth, withFloor]
  );

  const goBack = useCallback(() => {
    clearDrill();
    if (
      activeKey &&
      !activeKey.startsWith('area:') &&
      activeKey !== 'unassigned' &&
      activeKey !== current?.nodeKey
    ) {
      setActiveKey(null);
      setMode('tree');
      return;
    }
    if (areaKey) {
      setAreaKey(null);
      setActiveKey(null);
      setMode('tree');
      setPath([]);
      return;
    }
    setActiveKey(null);
    setMode('tree');
    setPath((prev) => {
      const base = withFloor(prev);
      return base.length <= minDepth ? base : base.slice(0, -1);
    });
  }, [activeKey, areaKey, clearDrill, current?.nodeKey, minDepth, withFloor]);

  /**
   * Centra la rueda en un nodo elegido desde la lista. Si tiene equipo, entra
   * a su nivel; si no, se queda en el nivel de su responsable y lo resalta.
   */
  const focusNode = useCallback(
    (nodeKey: string) => {
      const chain = chainTo(forest, nodeKey);
      if (!chain) return;
      clearDrill();
      setAreaKey(null);
      setMode('tree');
      const target = chain[chain.length - 1];
      if (target.children.length > 0) {
        setPath(chain.map((node) => node.nodeKey));
        setActiveKey(null);
      } else {
        setPath(chain.slice(0, -1).map((node) => node.nodeKey));
        setActiveKey(target.nodeKey);
      }
    },
    [clearDrill, forest]
  );

  const reset = useCallback(() => {
    clearDrill();
    setAreaKey(null);
    setPath(floorKey ? [floorKey] : []);
    setActiveKey(null);
    setMode('tree');
  }, [clearDrill, floorKey]);

  const centerNode = current;
  const centerArea = selectedArea?.areaName ?? null;
  const centerTitle = centerNode
    ? entryFromNode(centerNode).label
    : selectedArea
      ? selectedArea.areaName
      : catalog
        ? 'Inactivos'
        : 'Planta';
  const centerSubtitle = centerNode
    ? centerNode.person.role_name || 'Unidad'
    : selectedArea
      ? `${areaPeople(selectedArea).length.toLocaleString('es-CO')} personas`
      : catalog
        ? `${forest.areas.length.toLocaleString('es-CO')} áreas`
        : 'Estructura';

  const contentKey =
    mode === 'unassigned'
      ? 'unassigned'
      : displayed?.nodeKey ?? selectedArea?.key ?? (catalog ? 'inactivos' : 'planta');

  return {
    entries,
    activeKey,
    mode,
    crumbs,
    centerNode,
    centerTitle,
    centerSubtitle,
    centerArea,
    canGoBack:
      visiblePath.length > minDepth ||
      areaKey != null ||
      (activeKey != null && activeKey !== current?.nodeKey),
    panelForest,
    displayedNode: displayed,
    contentKey,
    selectEntry,
    highlightEntry,
    goToCrumb,
    goBack,
    focusNode,
    reset,
  };
}

/** Nodos desde la raíz hasta `nodeKey` (incluido), o null si no está. */
function chainTo(
  forest: OrganizationForest,
  nodeKey: string
): OrganizationNode[] | null {
  const walk = (node: OrganizationNode, trail: OrganizationNode[]): OrganizationNode[] | null => {
    const next = [...trail, node];
    if (node.nodeKey === nodeKey) return next;
    for (const child of node.children) {
      const found = walk(child, next);
      if (found) return found;
    }
    return null;
  };
  for (const area of forest.areas) {
    for (const school of area.schools) {
      for (const root of school.roots) {
        const found = walk(root, []);
        if (found) return found;
      }
    }
  }
  return null;
}
