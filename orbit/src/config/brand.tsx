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
  UserGroupIcon,
} from '@heroicons/react/24/solid';
import { BrandConfig } from '../types';

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
    type: 'png',
    content: '/brand/orbit-logo-white.png'
  },

  // LOGO PARA EL MENÚ Y BARRA LATERAL
  logoMenu: {
    type: 'png',
    content: '/brand/orbit-logo.png'
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
  roles: UserGroupIcon,
};
