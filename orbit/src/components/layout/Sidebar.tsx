import React, { useEffect, useState } from "react";
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from "@heroicons/react/24/outline";
import { AcademicCapIcon as AcademicCapOutlineIcon } from "@heroicons/react/24/outline";
import { cn } from "@/src/lib/utils";
import { View, NAV_ITEMS, type NavItem } from "@/src/types";
import { APP_ICONS } from "@/src/config/brand";
import { Logo } from "../common/Logo";

const STORAGE_KEY = "orbit_nav_expanded";

interface SidebarProps {
  currentView: View;
  setView: (v: View) => void;
  isOpen?: boolean;
  onClose?: () => void;
  navItems?: NavItem[];
  /** Desktop rail expanded (controlled from App when needed). */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

function isNavActive(currentView: View, itemId: string): boolean {
  if (currentView === itemId) return true;
  if (itemId === "vacancies" && currentView === "vacancy-detail") return true;
  if (itemId === "home") return false;
  return currentView.startsWith(itemId.split("-")[0]) && itemId !== "home";
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  isOpen,
  onClose,
  navItems = NAV_ITEMS,
  expanded: expandedProp,
  onExpandedChange,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const expanded = expandedProp ?? internalExpanded;

  const setExpanded = (next: boolean) => {
    if (onExpandedChange) onExpandedChange(next);
    else setInternalExpanded(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--orbit-rail-current",
      expanded ? "var(--orbit-rail-expanded)" : "var(--orbit-rail-collapsed)"
    );
  }, [expanded]);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-[100] flex flex-col border-r border-orbit-border bg-orbit-bg-secondary transition-[width,transform] duration-200 ease-out",
        "w-[min(280px,85vw)] md:w-[var(--orbit-rail-current,76px)]",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-orbit-border px-3",
          expanded ? "justify-between gap-2" : "justify-center"
        )}
      >
        <button
          type="button"
          onClick={() => {
            setView("home");
            onClose?.();
          }}
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] p-1.5 transition-colors hover:bg-orbit-interactive",
            !expanded && "md:justify-center"
          )}
          aria-label="Volver al Command Center"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-orbit-border bg-[var(--orbit-logo-plate)]">
            <Logo className="h-5 w-5" />
          </span>
          <span
            className={cn(
              "font-display text-sm font-semibold tracking-tight text-orbit-text",
              !expanded && "md:hidden"
            )}
          >
            Orbit
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-orbit-muted hover:bg-orbit-interactive hover:text-orbit-text md:hidden"
          aria-label="Cerrar menú"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 no-scrollbar">
        {navItems.map((item) => {
          const isActive = isNavActive(currentView, item.id);
          const OutlineIcon =
            item.id === "academic-load" ? AcademicCapOutlineIcon : null;
          const Icon = OutlineIcon
            ? null
            : APP_ICONS[item.iconKey as keyof typeof APP_ICONS];

          return (
            <div key={item.id} className="relative group/nav">
              <button
                type="button"
                onClick={() => setView(item.id as View)}
                data-tutorial={`nav-${item.id}`}
                title={!expanded ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition-colors duration-150",
                  expanded ? "justify-start" : "md:justify-center",
                  isActive
                    ? "bg-orbit-interactive text-orbit-text"
                    : "text-orbit-muted hover:bg-orbit-interactive/70 hover:text-orbit-text"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-orbit-primary" />
                )}
                {OutlineIcon && (
                  <OutlineIcon
                    className={cn(
                      "h-[20px] w-[20px] shrink-0",
                      isActive ? "text-orbit-primary" : "text-current"
                    )}
                    strokeWidth={1.75}
                  />
                )}
                {Icon && (
                  <Icon
                    className={cn(
                      "h-[20px] w-[20px] shrink-0",
                      isActive ? "text-orbit-primary" : "text-current"
                    )}
                    style={
                      isActive
                        ? { fill: "url(#icon-gradient)" }
                        : undefined
                    }
                  />
                )}
                <span
                  className={cn(
                    "truncate text-[13px] font-medium tracking-wide",
                    !expanded && "md:hidden"
                  )}
                >
                  {item.label}
                </span>
              </button>

              {!expanded && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-[110] ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-orbit-border bg-orbit-elevated px-2 py-1 text-[11px] font-medium text-orbit-text opacity-0 shadow-lg transition-opacity duration-150 group-hover/nav:opacity-100 md:block"
                >
                  {item.label}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="hidden border-t border-orbit-border p-2 md:block">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2.5 text-orbit-muted transition-colors duration-150 hover:bg-orbit-interactive hover:text-orbit-text",
            expanded ? "justify-start" : "justify-center"
          )}
          aria-label={expanded ? "Colapsar menú" : "Expandir menú"}
          title={expanded ? "Colapsar" : "Expandir"}
        >
          {expanded ? (
            <>
              <ChevronDoubleLeftIcon className="h-4 w-4 shrink-0" />
              <span className="text-[12px] font-medium">Colapsar</span>
            </>
          ) : (
            <ChevronDoubleRightIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
};
