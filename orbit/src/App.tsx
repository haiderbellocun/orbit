/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/layout/Sidebar';
import { LoginView } from './components/views/LoginView';
import { HomeView } from './components/views/HomeView';
import { VacanciesView } from './components/views/VacanciesView';
import { ReinstatementsView } from './components/views/ReinstatementsView';
import { NewsView } from './components/views/NewsView';
import { AcademicLoadView } from './components/views/AcademicLoadView';
import { SubstantiveHoursView } from './components/views/SubstantiveHoursView';
import { AuditView } from './components/views/AuditView';
import { ProgramsView } from './components/views/ProgramsView';
import { PlantaActivaView } from './components/views/PlantaActivaView';
import { View, Vacancy, NAV_ITEMS } from './types';
import { VacancyDetailView } from './components/views/VacancyDetailView';
import { VacancyInformativePanelView } from './components/views/VacancyInformativePanelView';
import { MOCK_VACANCIES } from './data/mockData';

import { BRAND_CONFIG } from './config/brand';
import { Logo } from './components/common/Logo';
import {
  clearOrbitSession,
  getStoredCapabilities,
  getStoredOrbitAccess,
  getVacancy,
  isStoredJwtValid,
  type GoogleAuthResponse,
  type OrbitAccess,
} from "./lib/api";
import {
  canAccessView,
  canManageVacancies,
  filterNavItems,
  getDefaultView,
  hasCapability,
  ORBIT_CAPABILITY,
} from "./lib/permissions";
import { TutorialProvider } from "./components/tutorial/TutorialContext";
import { GuidedTour } from "./components/tutorial/GuidedTour";
import { clearTutorialSession } from "./lib/tutorialStorage";

export default function App() {
  const [view, setView] = useState<View>('login');
  const [orbitAccess, setOrbitAccess] = useState<OrbitAccess | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const jwtPresent =
      typeof localStorage !== "undefined" &&
      Boolean(localStorage.getItem("orbit_jwt")?.trim());
    if (jwtPresent && !isStoredJwtValid()) {
      clearOrbitSession();
      return;
    }
    if (!isStoredJwtValid()) return;
    const caps = getStoredCapabilities();
    setOrbitAccess(getStoredOrbitAccess() ?? "full");
    setCapabilities(caps);
    setView(getDefaultView(caps));
  }, []);

  useEffect(() => {
    if (view === "login") return;
    if (!canAccessView(view, capabilities)) {
      setView(getDefaultView(capabilities));
    }
  }, [view, capabilities]);

  const sidebarNavItems = useMemo(
    () => filterNavItems(NAV_ITEMS, capabilities),
    [capabilities]
  );

  const handleLogout = useCallback(() => {
    clearTutorialSession();
    clearOrbitSession();
    setOrbitAccess(null);
    setCapabilities([]);
    setSelectedVacancy(null);
  }, []);

  const handleLogin = (auth: GoogleAuthResponse) => {
    const access: OrbitAccess = auth.user.orbitAccess ?? "full";
    const caps = getStoredCapabilities();
    setOrbitAccess(access);
    setCapabilities(caps.length > 0 ? caps : (auth.user.capabilities ?? []));
    setView(getDefaultView(caps.length > 0 ? caps : (auth.user.capabilities ?? [])));
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

  const handleOpenVacancyFromNotification = useCallback(
    async (vacancyId: string) => {
      try {
        const v = await getVacancy(vacancyId);
        setSelectedVacancy(v);
        setView("vacancy-detail");
      } catch {
        setView("vacancies");
      }
    },
    []
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    const canSearchVacancies = hasCapability(
      capabilities,
      ORBIT_CAPABILITY.VACANCIES
    );
    const vacancies = canSearchVacancies
      ? MOCK_VACANCIES.filter(
          (v) =>
            v.positionName.toLowerCase().includes(query) ||
            (v.programName ?? "").toLowerCase().includes(query) ||
            (v.areaName ?? "").toLowerCase().includes(query) ||
            v.id.toLowerCase().includes(query)
        )
      : [];

    return { teachers: [], vacancies, coordinators: [] };
  }, [searchQuery, capabilities]);

  const canVacancies = canManageVacancies(capabilities);

  const renderView = () => {
    const commonProps = {
      searchQuery,
      setSearchQuery,
      searchResults,
      onOpenVacancyFromNotification: handleOpenVacancyFromNotification,
    };

    switch (view) {
      case 'home':
        return (
          <HomeView
            setView={setView}
            canManageVacancies={canVacancies}
            isLiteUser={orbitAccess === "lite"}
            {...commonProps}
          />
        );
      case 'vacancies':
        return (
          <VacanciesView
            onSelectVacancy={handleSelectVacancy}
            onVacancySaved={handleVacancySaved}
            {...commonProps}
          />
        );
      case 'vacancy-informative-panel':
        return <VacancyInformativePanelView />;
      case 'vacancy-detail':
        return selectedVacancy ? (
          <VacancyDetailView
            summary={selectedVacancy}
            setView={setView}
            onVacancySaved={handleVacancySaved}
            onVacancyDeleted={() => {
              setSelectedVacancy(null);
              setView('vacancies');
            }}
            {...commonProps}
          />
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
      case 'academic-load':
        return <AcademicLoadView {...commonProps} />;
      case 'substantive-hours':
        return <SubstantiveHoursView {...commonProps} />;
      case 'audit':
        return <AuditView {...commonProps} />;
      case 'programs':
        return <ProgramsView setView={setView} {...commonProps} />;
      case 'planta-activa':
        return <PlantaActivaView {...commonProps} />;
      default:
        return <HomeView setView={setView} {...commonProps} />;
    }
  };

  if (view === 'login') {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <TutorialProvider
      view={view}
      setView={setView}
      capabilities={capabilities}
      setSidebarOpen={setIsSidebarOpen}
    >
      <div className="min-h-screen flex overflow-x-hidden">
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
          navItems={sidebarNavItems}
          onLogout={handleLogout}
        />

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

        <main className="flex-1 min-w-0 min-h-screen relative p-3 md:p-5 xl:p-6 w-full md:w-[calc(100%-16rem)] md:ml-64">
          <motion.div className="md:hidden sticky top-0 -mx-4 px-4 py-3 mb-6 bg-white/80 backdrop-blur-lg border-b border-slate-200/50 flex items-center justify-between z-40">
            <div className="flex items-center gap-3">
              <motion.div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center text-white shadow-lg`}>
                <Logo className="h-6 w-6" />
              </motion.div>
              <span className="font-bold text-xl tracking-tight text-slate-900 font-display">{BRAND_CONFIG.name}</span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 glass-button-secondary"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>
            </button>
          </motion.div>

          <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full max-w-none min-w-0 px-5"
          >
            {renderView()}
          </motion.div>
          </AnimatePresence>
        </main>

        <GuidedTour />
      </div>
    </TutorialProvider>
  );
}
