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

export type VacancyOperationStatus =
  | 'open'
  | 'selected'
  | 'requisition_sent'
  | 'hired'
  | 'closed'
  | 'cancelled';

/** One append-only operation comment on a vacancy (from vacancy_operation_note). */
export interface VacancyOperationNoteEntry {
  id: string;
  text: string;
  createdAt: string;
  createdByPersonId: number | null;
  /** Present when API joined person.full_name. */
  createdByName?: string | null;
}

/** List row from GET /vacancies (joined with CORE + optional requisition). */
export interface Vacancy {
  id: string;
  areaId: number;
  /** Present when response includes CORE joins (list/detail); bare POST/PATCH may omit. */
  areaName?: string;
  schoolId: number | null;
  schoolName?: string;
  programId: number | null;
  programName?: string | null;
  positionName: string;
  curricularLine: string | null;
  quantity: number;
  operationStatus: VacancyOperationStatus;
  operationNotes: VacancyOperationNoteEntry[];
  /**
   * Notas de capital humano desde la requisición asociada (solo si existe REQ).
   * En detalle, preferir `requisition.capitalNotes`.
   */
  capitalNotes?: string | null;
  shortlistComplied: boolean | null;
  pdaComplied: boolean | null;
  contractConditionsComplied: boolean | null;
  preInterviewCvComplied: boolean | null;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string | null;
  reqNumber?: string | null;
  reqAssignedAt?: string | null;
  sentToCapitalAt?: string | null;
}

export type VacancyRequisitionDetail = {
  id: string;
  reqNumber: string;
  assignedAt: string;
  sentToCapitalAt: string | null;
  capitalNotes: string | null;
};

export type VacancyStatusHistoryEntry = {
  id: string;
  previousOperationStatus: string | null;
  newOperationStatus: string;
  changedAt: string;
  changedByPersonId: number | null;
};

export type VacancyDetail = Vacancy & {
  requisition: VacancyRequisitionDetail | null;
  statusHistory: VacancyStatusHistoryEntry[];
};

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
  document: string;
  name: string;
  email: string;
  phone: string;
  campus: string;
  school: string;
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
  // { id: 'reinstatements', label: 'Reintegros', iconKey: 'reinstatements' },
  // { id: 'news', label: 'Novedades', iconKey: 'news' },
  // { id: 'audit', label: 'Auditoría', iconKey: 'audit' },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
