import React from "react";
import { cn } from "@/src/lib/utils";

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Optional trailing actions (filters, primary CTA). */
  actions?: React.ReactNode;
  className?: string;
  /** @deprecated Moved to TopBar; ignored. */
  searchQuery?: string;
  /** @deprecated Moved to TopBar; ignored. */
  setSearchQuery?: (q: string) => void;
  /** @deprecated Moved to TopBar; ignored. */
  searchResults?: unknown;
  /** @deprecated Moved to TopBar; ignored. */
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

/**
 * Compact page header — identity, notifications and search live in TopBar.
 */
export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  actions,
  className,
}) => {
  return (
    <header
      className={cn(
        "mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-xl font-semibold tracking-tight text-orbit-text md:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-orbit-text-secondary">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
};
