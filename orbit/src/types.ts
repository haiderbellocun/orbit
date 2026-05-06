export type View = 
  | 'login' 
  | 'home' 
  | 'teachers' 
  | 'teacher-detail' 
  | 'vacancies' 
  | 'vacancy-detail' 
  | 'reinstatements' 
  | 'news' 
  | 'coordinators' 
  | 'lites'
  | 'academic-load'
  | 'audit' 
  | 'export'
  | 'programs';

export interface Teacher {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'on-leave';
  program: string;
  campus: string;
  joinDate: string;
  avatar?: string;
  lite_name?: string;
  lite_document?: string;
}

export interface Vacancy {
  id: string;
  title: string;
  program: string;
  campus: string;
  coordinator: string;
  status: 'open' | 'in-progress' | 'filled' | 'cancelled';
  createdAt: string;
  priority: 'low' | 'medium' | 'high';
  period?: string;
}

export interface Reinstatement {
  id: string;
  teacherId: string;
  teacherName: string;
  period: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  reason: string;
}

export interface NewsItem {
  id: string;
  teacherName: string;
  type: 'incapacity' | 'license' | 'resignation' | 'other';
  severity: 'low' | 'medium' | 'high';
  date: string;
  description: string;
}

export interface Coordinator {
  id: string;
  name: string;
  email: string;
  phone: string;
  campus: string;
  assignments: number;
  status: 'active' | 'inactive';
}

export interface AuditEvent {
  id: string;
  user: string;
  action: string;
  module: string;
  date: string;
  details: string;
}

export interface BrandConfig {
  name: string;
  logoLogin: {
    type: 'svg' | 'png';
    content: string | React.FC<React.SVGProps<SVGSVGElement>>;
  };
  logoMenu: {
    type: 'svg' | 'png';
    content: string | React.FC<React.SVGProps<SVGSVGElement>>;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    gradient: string;
  };
}

export const NAV_ITEMS = [
  { id: 'home', label: 'Command Center', iconKey: 'dashboard' },
  { id: 'teachers', label: 'Docentes', iconKey: 'teachers' },
  { id: 'academic-load', label: 'Carga Académica', iconKey: 'academic-load' },
  { id: 'coordinators', label: 'Coordinadores', iconKey: 'coordinators' },
  { id: 'lites', label: 'LITEs', iconKey: 'lites' },
  { id: 'vacancies', label: 'Vacantes', iconKey: 'vacancies' },
  { id: 'reinstatements', label: 'Reintegros', iconKey: 'reinstatements' },
  { id: 'news', label: 'Novedades', iconKey: 'news' },
  { id: 'audit', label: 'Auditoría', iconKey: 'audit' },
];
