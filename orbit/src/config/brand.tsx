import React from 'react';
import { 
  BoltIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  LockOpenIcon,
  ChatBubbleLeftEllipsisIcon,
  ShieldCheckIcon,
  FolderIcon,
  BookOpenIcon,
  BuildingOffice2Icon,
  ClockIcon,
  CircleStackIcon,
} from '@heroicons/react/24/solid';
import { BrandConfig } from '../types';

const OrbitMark: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 64 64" fill="none" role="img" aria-label="Orbit" {...props}>
    <circle cx="32" cy="32" r="8" fill="currentColor" />
    <ellipse
      cx="32"
      cy="32"
      rx="25"
      ry="12"
      stroke="currentColor"
      strokeWidth="4"
      transform="rotate(-28 32 32)"
    />
    <circle cx="52" cy="21" r="4.5" fill="currentColor" />
  </svg>
);

/**
 * ==========================================
 * CONFIGURACIÓN DE MARCA (BRANDING)
 * ==========================================
 * Aquí puedes cambiar el nombre, logo y colores de la aplicación.
 */
export const BRAND_CONFIG: BrandConfig = {
  name: 'Orbit',
  
  // LOGO PARA PANTALLA DE INICIO (LOGIN)
  logoLogin: {
    type: 'svg',
    content: OrbitMark
  },

  // LOGO PARA EL MENÚ Y BARRA LATERAL
  logoMenu: {
    type: 'svg',
    content: OrbitMark
  },

  // PALETA DE COLORES
  colors: {
    primary: 'violet',
    secondary: 'fuchsia',
    accent: 'cyan',
    gradient: 'from-orbit-primary to-orbit-primary-hover',
  },
};

/**
 * ==========================================
 * ICONOS DE LA APLICACIÓN
 * ==========================================
 * Mapeo de iconos para la navegación y módulos.
 */
export const APP_ICONS = {
  dashboard: BoltIcon,
  vacancies: BriefcaseIcon,
  reinstatements: LockOpenIcon,
  news: ChatBubbleLeftEllipsisIcon,
  audit: ShieldCheckIcon,
  export: FolderIcon,
  programs: BookOpenIcon,
  'academic-load': AcademicCapIcon,
  'substantive-hours': ClockIcon,
  'planta-activa': BuildingOffice2Icon,
  'information-management': CircleStackIcon,
};
