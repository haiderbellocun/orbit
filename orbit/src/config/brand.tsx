import React from 'react';
import { 
  BoltIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  LockOpenIcon,
  ChatBubbleLeftEllipsisIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  FolderIcon,
  BookOpenIcon,
  BuildingOffice2Icon,
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
    content: 'https://i.ibb.co/4nd5Tt7q/LOGO-ORBIT-BLANCO-512-Mesa-de-trabajo-1-Mesa-de-trabajo-1.png'
  },

  // LOGO PARA EL MENÚ Y BARRA LATERAL
  logoMenu: {
    type: 'png',
    content: 'https://i.ibb.co/1SR92PZ/LOGO-ORBIT-512-Mesa-de-trabajo-1-02-02.png'
  },

  // PALETA DE COLORES
  colors: {
    primary: 'violet',
    secondary: 'fuchsia',
    accent: 'cyan',
    gradient: 'from-violet-600 to-fuchsia-600',
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
  teachers: AcademicCapIcon,
  vacancies: BriefcaseIcon,
  reinstatements: LockOpenIcon,
  news: ChatBubbleLeftEllipsisIcon,
  coordinators: UserGroupIcon,
  audit: ShieldCheckIcon,
  export: FolderIcon,
  programs: BookOpenIcon,
  'academic-load': AcademicCapIcon,
  personal: UserGroupIcon,
  'planta-activa': BuildingOffice2Icon,
  lites: UserGroupIcon,
};
