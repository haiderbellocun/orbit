/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { LoginView } from "./components/views/LoginView";
import { HomeView } from "./components/views/HomeView";
import { VacanciesView } from "./components/views/VacanciesView";
import { ReinstatementsView } from "./components/views/ReinstatementsView";
import { NewsView } from "./components/views/NewsView";
import { AcademicLoadView } from "./components/views/AcademicLoadView";
import { SubstantiveHoursView } from "./components/views/SubstantiveHoursView";
import { AuditView } from "./components/views/AuditView";
import { ProgramsView } from "./components/views/ProgramsView";
import { PlantaActivaView } from "./components/views/PlantaActivaView";
import { View, Vacancy, NAV_ITEMS } from "./types";
import { VacancyDetailView } from "./components/views/VacancyDetailView";
import { VacancyInformativePanelView } from "./components/views/VacancyInformativePanelView";
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
} from "./lib/permissions";
import {
  TutorialProvider,
  useTutorialOptional,
} from "./components/tutorial/TutorialContext";
import { GuidedTour } from "./components/tutorial/GuidedTour";
import { clearTutorialSession } from "./lib/tutorialStorage";

function AppShell({
  view,
  setView,
  capabilities,
  orbitAccess,
  selectedVacancy,
  setSelectedVacancy,
  handleLogout,
  handleSelectVacancy,
  handleVacancySaved,
  handleOpenVacancyFromNotification,
  isSidebarOpen,
  setIsSidebarOpen,
}: {
  view: View;
  setView: (v: View) => void;
  capabilities: string[];
  orbitAccess: OrbitAccess | null;
  selectedVacancy: Vacancy | null;
  setSelectedVacancy: React.Dispatch<React.SetStateAction<Vacancy | null>>;
  handleLogout: () => void;
  handleSelectVacancy: (vacancy: Vacancy) => void;
  handleVacancySaved: (v: Vacancy) => void;
  handleOpenVacancyFromNotification: (vacancyId: string) => Promise<void>;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}) {
  const tutorial = useTutorialOptional();
  const sidebarNavItems = useMemo(
    () => filterNavItems(NAV_ITEMS, capabilities),
    [capabilities]
  );
  const canVacancies = canManageVacancies(capabilities);

  const renderView = () => {
    const notifProps = {
      onOpenVacancyFromNotification: handleOpenVacancyFromNotification,
    };

    switch (view) {
      case "home":
        return (
          <HomeView
            setView={setView}
            canManageVacancies={canVacancies}
            isLiteUser={orbitAccess === "lite"}
            {...notifProps}
          />
        );
      case "vacancies":
        return (
          <VacanciesView
            onSelectVacancy={handleSelectVacancy}
            onVacancySaved={handleVacancySaved}
            {...notifProps}
          />
        );
      case "vacancy-informative-panel":
        return <VacancyInformativePanelView />;
      case "vacancy-detail":
        return selectedVacancy ? (
          <VacancyDetailView
            summary={selectedVacancy}
            setView={setView}
            onVacancySaved={handleVacancySaved}
            onVacancyDeleted={() => {
              setSelectedVacancy(null);
              setView("vacancies");
            }}
            {...notifProps}
          />
        ) : (
          <VacanciesView
            onSelectVacancy={handleSelectVacancy}
            onVacancySaved={handleVacancySaved}
            {...notifProps}
          />
        );
      case "reinstatements":
        return <ReinstatementsView />;
      case "news":
        return <NewsView />;
      case "academic-load":
        return <AcademicLoadView {...notifProps} />;
      case "substantive-hours":
        return <SubstantiveHoursView {...notifProps} />;
      case "audit":
        return <AuditView />;
      case "programs":
        return <ProgramsView setView={setView} {...notifProps} />;
      case "planta-activa":
        return <PlantaActivaView {...notifProps} />;
      default:
        return <HomeView setView={setView} {...notifProps} />;
    }
  };

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-orbit-bg">
      <svg width="0" height="0" className="pointer-events-none absolute">
        <defs>
          <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#C084FC" />
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
      />

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-[90] bg-black/60 md:hidden"
          />
        )}
      </AnimatePresence>

      <div
        className="flex min-h-screen min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out md:ml-[var(--orbit-rail-current,76px)]"
      >
        <TopBar
          navItems={sidebarNavItems}
          capabilities={capabilities}
          setView={setView}
          onLogout={handleLogout}
          onOpenVacancyFromNotification={handleOpenVacancyFromNotification}
          onSelectVacancyFromSearch={(id) => {
            void handleOpenVacancyFromNotification(id);
          }}
          onOpenMobileNav={() => setIsSidebarOpen(true)}
          tutorialEnabled={tutorial?.enabled}
          onToggleTutorial={() =>
            tutorial?.setEnabled(!(tutorial?.enabled ?? true))
          }
        />

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 md:px-6 md:py-5 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="mx-auto w-full max-w-none min-w-0"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <GuidedTour />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("login");
  const [orbitAccess, setOrbitAccess] = useState<OrbitAccess | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null);
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
    setView(
      getDefaultView(caps.length > 0 ? caps : (auth.user.capabilities ?? []))
    );
  };

  const handleSelectVacancy = (vacancy: Vacancy) => {
    setSelectedVacancy(vacancy);
    setView("vacancy-detail");
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

  if (view === "login") {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <TutorialProvider
      view={view}
      setView={setView}
      capabilities={capabilities}
      setSidebarOpen={setIsSidebarOpen}
    >
      <AppShell
        view={view}
        setView={setView}
        capabilities={capabilities}
        orbitAccess={orbitAccess}
        selectedVacancy={selectedVacancy}
        setSelectedVacancy={setSelectedVacancy}
        handleLogout={handleLogout}
        handleSelectVacancy={handleSelectVacancy}
        handleVacancySaved={handleVacancySaved}
        handleOpenVacancyFromNotification={handleOpenVacancyFromNotification}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />
    </TutorialProvider>
  );
}
