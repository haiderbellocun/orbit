import { Teacher, Vacancy, Coordinator } from '../types';

export const MOCK_TEACHERS: Teacher[] = [
  { id: '1', name: 'Carlos Poveda', document: '10203040', email: 'c.poveda@orbit.edu', phone: '+57 300 123 4567', program: 'Ingeniería de Sistemas', campus: 'Sede Norte', joinDate: '15 Ene 2022', status: 'active' },
  { id: '2', name: 'Elena Rodríguez', document: '50607080', email: 'e.rodriguez@orbit.edu', phone: '+57 310 987 6543', program: 'Administración de Empresas', campus: 'Sede Centro', joinDate: '10 Mar 2021', status: 'active' },
  { id: '3', name: 'Mario Gómez', document: '90102030', email: 'm.gomez@orbit.edu', phone: '+57 315 555 0192', program: 'Diseño Gráfico', campus: 'Sede Sur', joinDate: '05 Feb 2023', status: 'active' },
  { id: '4', name: 'Lucía Fernández', document: '40506070', email: 'l.fernandez@orbit.edu', phone: '+57 320 444 8899', program: 'Psicología', campus: 'Sede Norte', joinDate: '20 Nov 2020', status: 'inactive' },
];

export const MOCK_VACANCIES: Vacancy[] = [
  { id: 'V1', title: 'Docente de Inteligencia Artificial', program: 'Ingeniería de Sistemas', campus: 'Sede Norte', coordinator: 'Juan Pérez', status: 'open', createdAt: '2024-03-20', priority: 'high' },
  { id: 'V2', title: 'Docente de Marketing Digital', program: 'Administración', campus: 'Sede Centro', coordinator: 'Ana Martínez', status: 'in-progress', createdAt: '2024-03-18', priority: 'medium' },
  { id: 'V3', title: 'Docente de Cálculo Integral', program: 'Ciencias Básicas', campus: 'Sede Norte', coordinator: 'Juan Pérez', status: 'filled', createdAt: '2024-03-15', priority: 'low' },
  { id: 'V4', title: 'Docente de Diseño UX/UI', program: 'Diseño', campus: 'Sede Sur', coordinator: 'Elena Ruiz', status: 'open', createdAt: '2024-03-22', priority: 'high' },
];

export const MOCK_COORDINATORS: Coordinator[] = [
  { id: 'C1', name: 'Juan Pérez', email: 'j.perez@orbit.edu', phone: '+57 300 111 2233', campus: 'Sede Norte', assignments: 45, status: 'active' },
  { id: 'C2', name: 'Ana Martínez', email: 'a.martinez@orbit.edu', phone: '+57 310 222 3344', campus: 'Sede Centro', assignments: 32, status: 'active' },
  { id: 'C3', name: 'Roberto Gómez', email: 'r.gomez@orbit.edu', phone: '+57 320 333 4455', campus: 'Sede Norte', assignments: 28, status: 'active' },
  { id: 'C4', name: 'Elena Ruiz', email: 'e.ruiz@orbit.edu', phone: '+57 315 000 1122', campus: 'Sede Sur', assignments: 15, status: 'inactive' },
];
