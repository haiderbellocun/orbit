import type { View } from "@/src/types";
import {
  ORBIT_CAPABILITY,
  canAccessVacancyInformativePanel,
  canAccessView,
  type OrbitCapability,
} from "@/src/lib/permissions";

export type TutorialStep = {
  id: string;
  /** Vista a la que navegar antes de resaltar el target. */
  view: View;
  /** Valor de `data-tutorial` en el DOM. */
  target: string;
  title: string;
  body: string;
  /** Si se define, el paso solo aparece con esta capability. */
  capability?: OrbitCapability;
  /** Acceso especial al panel informativo. */
  requireInformativePanel?: boolean;
  /** Target en el sidebar: abrir menú en móvil. */
  sidebarTarget?: boolean;
};

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "home-metrics",
    view: "home",
    target: "home-metrics",
    title: "Métricas del Command Center",
    body: "Aquí ves el resumen operativo del día: personal activo, vacantes, contrataciones y novedades según tu perfil.",
    capability: ORBIT_CAPABILITY.HOME,
  },
  {
    id: "home-quick-actions",
    view: "home",
    target: "home-quick-actions",
    title: "Acciones rápidas",
    body: "Accesos directos a flujos frecuentes. Por ejemplo, Nueva Vacante te lleva a crear una vacante y su requisición.",
    capability: ORBIT_CAPABILITY.VACANCIES,
  },
  {
    id: "home-tutorial-toggle",
    view: "home",
    target: "home-tutorial-toggle",
    title: "Tutorial de ayuda",
    body: "Prende o apaga este tutorial. Si está prendido, se mostrará cada vez que entres a Orbit; si lo apagas, no volverá a aparecer solo.",
    capability: ORBIT_CAPABILITY.HOME,
  },
  {
    id: "header-notifications",
    view: "home",
    target: "header-notifications",
    title: "Notificaciones",
    body: "La campana muestra avisos operativos (por ejemplo sobre vacantes). Ábrela para ver el detalle y marcarlos como leídos.",
    capability: ORBIT_CAPABILITY.HOME,
  },
  {
    id: "nav-home",
    view: "home",
    target: "nav-home",
    title: "Command Center",
    body: "Vuelve siempre al panel principal desde este ítem del menú o tocando el logo de Orbit.",
    capability: ORBIT_CAPABILITY.HOME,
    sidebarTarget: true,
  },
  {
    id: "nav-planta-activa",
    view: "home",
    target: "nav-planta-activa",
    title: "Planta Activa",
    body: "Consulta y administra personas activas e inactivas: búsqueda, filtros y alta de nuevas personas.",
    capability: ORBIT_CAPABILITY.PLANTA_ACTIVA,
    sidebarTarget: true,
  },
  {
    id: "nav-academic-load",
    view: "home",
    target: "nav-academic-load",
    title: "Carga Académica",
    body: "Revisa la asignación docente por periodo, con filtros por escuela, área, asignatura y más.",
    capability: ORBIT_CAPABILITY.ACADEMIC_LOAD,
    sidebarTarget: true,
  },
  {
    id: "nav-substantive-hours",
    view: "home",
    target: "nav-substantive-hours",
    title: "Balance carga",
    body: "Gestiona el balance semanal de cátedra, preparación de clase y horas sustantivas.",
    capability: ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
    sidebarTarget: true,
  },
  {
    id: "nav-vacancies",
    view: "home",
    target: "nav-vacancies",
    title: "Vacantes",
    body: "Crea y da seguimiento a vacantes y requisiciones en el flujo operativo de contratación.",
    capability: ORBIT_CAPABILITY.VACANCIES,
    sidebarTarget: true,
  },
  {
    id: "nav-vacancy-informative-panel",
    view: "home",
    target: "nav-vacancy-informative-panel",
    title: "Panel informativo",
    body: "Historial de auditoría de acciones sobre vacantes y requisiciones.",
    requireInformativePanel: true,
    sidebarTarget: true,
  },
  {
    id: "nav-news",
    view: "home",
    target: "nav-news",
    title: "Novedades",
    body: "Seguimiento de novedades y reportes por escuela o área.",
    capability: ORBIT_CAPABILITY.NEWS,
    sidebarTarget: true,
  },
  {
    id: "planta-status",
    view: "planta-activa",
    target: "planta-status",
    title: "Activos e inactivos",
    body: "Cambia entre el listado de personas activas e inactivas en el sistema.",
    capability: ORBIT_CAPABILITY.PLANTA_ACTIVA,
  },
  {
    id: "planta-create",
    view: "planta-activa",
    target: "planta-create",
    title: "Nueva persona",
    body: "Abre el formulario para registrar una persona nueva en la planta activa.",
    capability: ORBIT_CAPABILITY.PLANTA_ACTIVA,
  },
  {
    id: "planta-filters",
    view: "planta-activa",
    target: "planta-filters",
    title: "Buscar y filtrar",
    body: "Busca por nombre, documento, correo, área, escuela, programa, cargo o responsable y aplica filtros para acotar el listado.",
    capability: ORBIT_CAPABILITY.PLANTA_ACTIVA,
  },
  {
    id: "academic-filters",
    view: "academic-load",
    target: "academic-filters",
    title: "Filtros de carga",
    body: "Filtra la carga académica por periodo, modalidad, escuela, área u otros criterios y pulsa Buscar.",
    capability: ORBIT_CAPABILITY.ACADEMIC_LOAD,
  },
  {
    id: "substantive-modes",
    view: "substantive-hours",
    target: "substantive-modes",
    title: "Modos de balance",
    body: "Alterna entre asignar horas sustantivas o registrar preparación de clase.",
    capability: ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
  },
  {
    id: "substantive-filters",
    view: "substantive-hours",
    target: "substantive-filters",
    title: "Buscar docentes",
    body: "Busca por nombre, documento o correo y usa filtros para encontrar a la persona a gestionar.",
    capability: ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
  },
  {
    id: "vacancies-create",
    view: "vacancies",
    target: "vacancies-create",
    title: "Nueva vacante",
    body: "Inicia el flujo para crear una vacante y su requisición asociada.",
    capability: ORBIT_CAPABILITY.VACANCIES,
  },
  {
    id: "vacancies-filters",
    view: "vacancies",
    target: "vacancies-filters",
    title: "Filtros de vacantes",
    body: "Busca por cargo, programa, área o REQ y combina filtros para acotar el listado.",
    capability: ORBIT_CAPABILITY.VACANCIES,
  },
  {
    id: "informative-actions",
    view: "vacancy-informative-panel",
    target: "informative-actions",
    title: "Consultar auditoría",
    body: "Define criterios y consulta el historial de acciones sobre vacantes y requisiciones.",
    requireInformativePanel: true,
  },
  {
    id: "news-filters",
    view: "news",
    target: "news-filters",
    title: "Filtros de novedades",
    body: "Filtra novedades por escuela o área y aplica la búsqueda para ver el seguimiento.",
    capability: ORBIT_CAPABILITY.NEWS,
  },
];

export function filterTutorialSteps(
  capabilities: readonly string[]
): TutorialStep[] {
  return TUTORIAL_STEPS.filter((step) => {
    if (step.requireInformativePanel) {
      return canAccessVacancyInformativePanel(capabilities);
    }
    if (step.capability && !capabilities.includes(step.capability)) {
      return false;
    }
    if (!canAccessView(step.view, capabilities)) {
      return false;
    }
    return true;
  });
}
