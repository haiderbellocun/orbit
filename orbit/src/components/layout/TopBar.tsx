import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { NotificationBell } from "@/src/components/layout/NotificationBell";
import { CommandPalette } from "@/src/components/layout/CommandPalette";
import { ThemeToggle } from "@/src/components/layout/ThemeToggle";
import { cn } from "@/src/lib/utils";
import { View, type NavItem } from "@/src/types";

type StoredUser = {
  id?: number;
  email?: string;
  name?: string;
  picture?: string;
  roleCode?: string | null;
  roleName?: string | null;
};

function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem("orbit_user");
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function getInitials(name: string): string {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return initials || "U";
}

interface TopBarProps {
  navItems: NavItem[];
  capabilities: string[];
  setView: (v: View) => void;
  onLogout: () => void;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
  onSelectVacancyFromSearch?: (vacancyId: string) => void;
  onOpenMobileNav?: () => void;
  tutorialEnabled?: boolean;
  onToggleTutorial?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  navItems,
  capabilities,
  setView,
  onLogout,
  onOpenVacancyFromNotification,
  onSelectVacancyFromSearch,
  onOpenMobileNav,
  tutorialEnabled,
  onToggleTutorial,
}) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const user = useMemo(() => getStoredUser(), []);
  const displayName = user?.name || "Usuario";
  const displayRole = user?.roleName || user?.roleCode || "Usuario";
  const initials = getInitials(displayName);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "/" && !editable && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userMenuOpen]);

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <>
      <header
        className="sticky top-0 z-[80] flex h-16 shrink-0 items-center gap-3 border-b border-orbit-border bg-orbit-bg/95 px-3 backdrop-blur-md md:px-5"
        style={{ height: "var(--orbit-topbar)" }}
      >
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-orbit-border text-orbit-text-secondary hover:bg-orbit-interactive md:hidden"
          aria-label="Abrir menú"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border border-orbit-border bg-orbit-bg-secondary px-3 py-2 text-left transition-colors duration-150 hover:border-orbit-primary/40 md:max-w-xl"
          data-tutorial="header-search"
        >
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-orbit-muted group-hover:text-orbit-primary" />
          <span className="truncate text-sm text-orbit-muted">
            Buscar módulos, personas, vacantes…
          </span>
          <span className="ml-auto hidden items-center gap-1 sm:flex">
            <span className="orbit-kbd">{isMac ? "⌘" : "Ctrl"}</span>
            <span className="orbit-kbd">K</span>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleTutorial}
            className={cn(
              "hidden h-9 w-9 items-center justify-center rounded-[10px] border border-orbit-border transition-colors duration-150 lg:inline-flex",
              tutorialEnabled
                ? "bg-orbit-interactive text-orbit-primary"
                : "text-orbit-muted hover:bg-orbit-interactive hover:text-orbit-text"
            )}
            aria-label="Ayuda / tutorial"
            title="Tutorial de ayuda"
            data-tutorial="header-help"
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
          </button>

          <ThemeToggle />

          <div data-tutorial="header-notifications">
            <NotificationBell onOpenVacancy={onOpenVacancyFromNotification} />
          </div>

          <div className="relative pl-1 sm:pl-2 sm:border-l sm:border-orbit-border" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-[10px] px-1.5 py-1 transition-colors duration-150 hover:bg-orbit-interactive"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
            >
              <span className="hidden text-right sm:block">
                <span className="block max-w-[9rem] truncate text-xs font-semibold text-orbit-text">
                  {displayName}
                </span>
                <span className="block max-w-[9rem] truncate text-[10px] text-orbit-muted">
                  {displayRole}
                </span>
              </span>
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-orbit-border bg-orbit-interactive text-[11px] font-bold text-orbit-primary">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </span>
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-[12px] border border-orbit-border bg-orbit-elevated py-1 shadow-xl"
              >
                <div className="border-b border-orbit-border px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-orbit-text">{displayName}</p>
                  <p className="truncate text-[11px] text-orbit-muted">{user?.email || displayRole}</p>
                </div>
                {onToggleTutorial && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-orbit-text-secondary hover:bg-orbit-interactive hover:text-orbit-text"
                    onClick={() => {
                      onToggleTutorial();
                      setUserMenuOpen(false);
                    }}
                  >
                    Tutorial
                    <span className={cn("text-[10px] font-semibold uppercase", tutorialEnabled ? "text-orbit-success" : "text-orbit-muted")}>
                      {tutorialEnabled ? "On" : "Off"}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-orbit-danger hover:bg-orbit-interactive"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                    setView("login");
                  }}
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navItems={navItems}
        capabilities={capabilities}
        setView={setView}
        onSelectVacancy={onSelectVacancyFromSearch}
      />
    </>
  );
};
