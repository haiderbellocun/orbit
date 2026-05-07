/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/layout/Sidebar';
import { LoginView } from './components/views/LoginView';
import { HomeView } from './components/views/HomeView';
import { TeachersView } from './components/views/TeachersView';
import { TeacherDetailView } from './components/views/TeacherDetailView';
import { VacanciesView } from './components/views/VacanciesView';
import { ReinstatementsView } from './components/views/ReinstatementsView';
import { NewsView } from './components/views/NewsView';
import { CoordinatorsView } from './components/views/CoordinatorsView';
import { LitesView } from './components/views/LitesView';
import { AcademicLoadView } from './components/views/AcademicLoadView';
import { AuditView } from './components/views/AuditView';
import { ProgramsView } from './components/views/ProgramsView';
import { View, Teacher, Vacancy } from './types';
import { VacancyDetailView } from './components/views/VacancyDetailView';
import { MOCK_TEACHERS, MOCK_VACANCIES, MOCK_COORDINATORS } from './data/mockData';

import { BRAND_CONFIG } from './config/brand';
import { Logo } from './components/common/Logo';
import type { GoogleAuthResponse } from "./lib/api";

export default function App() {
  const [view, setView] = useState<View>('login');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogin = (auth: GoogleAuthResponse) => {
    console.log("Logged in:", auth.user.email);
    setView('home');
  };

  const handleSelectTeacher = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setView('teacher-detail');
  };

  const handleSelectVacancy = (vacancy: Vacancy) => {
    setSelectedVacancy(vacancy);
    setView('vacancy-detail');
  };

  const handleVacancySaved = useCallback((v: Vacancy) => {
    setSelectedVacancy((prev) =>
      prev?.id === v.id ? { ...prev, ...v } : prev
    );
  }, []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    
    const teachers = MOCK_TEACHERS.filter(t => t.name.toLowerCase().includes(query));
    const vacancies = MOCK_VACANCIES.filter(v =>
      v.positionName.toLowerCase().includes(query) ||
      (v.programName ?? '').toLowerCase().includes(query) ||
      (v.areaName ?? '').toLowerCase().includes(query) ||
      v.id.toLowerCase().includes(query)
    );
    const coordinators = MOCK_COORDINATORS.filter(c => c.name.toLowerCase().includes(query));
    
    return { teachers, vacancies, coordinators };
  }, [searchQuery]);

  const renderView = () => {
    const commonProps = { searchQuery, setSearchQuery, searchResults };
    
    switch (view) {
      case 'home':
        return <HomeView setView={setView} {...commonProps} />;
      case 'teachers':
        return <TeachersView onSelectTeacher={handleSelectTeacher} {...commonProps} />;
      case 'teacher-detail':
        return selectedTeacher ? (
          <TeacherDetailView teacher={selectedTeacher} setView={setView} {...commonProps} />
        ) : (
          <HomeView setView={setView} {...commonProps} />
        );
      case 'vacancies':
        return (
          <VacanciesView
            onSelectVacancy={handleSelectVacancy}
            onVacancySaved={handleVacancySaved}
            {...commonProps}
          />
        );
      case 'vacancy-detail':
        return selectedVacancy ? (
          <VacancyDetailView summary={selectedVacancy} setView={setView} {...commonProps} />
        ) : (
          <VacanciesView
            onSelectVacancy={handleSelectVacancy}
            onVacancySaved={handleVacancySaved}
            {...commonProps}
          />
        );
      case 'reinstatements':
        return <ReinstatementsView {...commonProps} />;
      case 'news':
        return <NewsView {...commonProps} />;
      case 'coordinators':
        return <CoordinatorsView setView={setView} {...commonProps} />;
      case 'lites':
        return <LitesView {...commonProps} />;
      case 'academic-load':
        return <AcademicLoadView {...commonProps} />;
      case 'audit':
        return <AuditView {...commonProps} />;
      case 'programs':
        return <ProgramsView setView={setView} {...commonProps} />;
      default:
        return <HomeView setView={setView} {...commonProps} />;
    }
  };

  if (view === 'login') {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex overflow-x-hidden">
      {/* Global SVG Gradients for Icons */}
      <svg width="0" height="0" className="absolute pointer-events-none">
        <defs>
          <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="50%" stopColor="#D946EF" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      </svg>

      <Sidebar 
        currentView={view} 
        setView={(v) => {
          setView(v);
          setIsSidebarOpen(false);
        }} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[90] md:hidden"
          />
        )}
      </AnimatePresence>

      <main className="flex-1 md:ml-64 p-3 md:p-5 xl:p-6 min-h-screen w-full relative">
        {/* Mobile Header Toggle */}
        <div className="md:hidden sticky top-0 -mx-4 px-4 py-3 mb-6 bg-white/80 backdrop-blur-lg border-b border-slate-200/50 flex items-center justify-between z-40">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center text-white shadow-lg`}>
              <Logo className="h-6 w-6" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900 font-display">{BRAND_CONFIG.name}</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 glass-button-secondary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>
          </button>
        </div>

        <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="px-40 mx-auto"
        >
          {renderView()}
        </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
