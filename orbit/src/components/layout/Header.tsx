import React, { useMemo } from "react";
import { motion } from "motion/react";
import { NotificationBell } from "@/src/components/layout/NotificationBell";

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** @deprecated Búsqueda global eliminada; se ignora. */
  searchQuery?: string;
  /** @deprecated Búsqueda global eliminada; se ignora. */
  setSearchQuery?: (q: string) => void;
  /** @deprecated Búsqueda global eliminada; se ignora. */
  searchResults?: unknown;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

type StoredUser = {
  id?: number;
  personId?: number | null;
  email?: string;
  name?: string;
  picture?: string;
  roleCode?: string | null;
  roleName?: string | null;
};

function getStoredUser(): StoredUser | null {
  try {
    const rawUser = localStorage.getItem("orbit_user");

    if (!rawUser) {
      return null;
    }

    return JSON.parse(rawUser) as StoredUser;
  } catch {
    return null;
  }
}

function getInitials(name: string): string {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return initials || "U";
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onOpenVacancyFromNotification,
}) => {
  const currentUser = useMemo(() => getStoredUser(), []);

  const displayName = currentUser?.name || "Usuario";
  const displayRole =
    currentUser?.roleName ||
    currentUser?.roleCode ||
    "Usuario";

  const displayPicture = currentUser?.picture || "";
  const initials = getInitials(displayName);

  return (
    <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-20">
      <div className="space-y-1">
        <motion.h1
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-4xl font-bold tracking-tight text-slate-900 font-display"
        >
          {title}
        </motion.h1>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 font-medium tracking-wide flex items-center gap-2"
          >
            <span className="w-8 h-[1px] bg-violet-200"></span>
            {subtitle}
          </motion.p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <NotificationBell onOpenVacancy={onOpenVacancyFromNotification} />

        <div className="flex items-center gap-4 pl-4 border-l border-white/40">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900">
              {displayName}
            </p>

            <p className="text-[10px] uppercase tracking-widest font-bold text-violet-500">
              {displayRole}
            </p>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-100 to-fuchsia-100 flex items-center justify-center text-violet-600 font-bold shadow-inner border border-white/50 overflow-hidden">
            {displayPicture ? (
              <img
                src={displayPicture}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
