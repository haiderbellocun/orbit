import React, { useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { cn } from "@/src/lib/utils";
import { getTheme, toggleTheme } from "@/src/lib/theme";

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const [theme, setTheme] = useState(getTheme);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-[10px] border border-orbit-border text-orbit-muted transition-colors hover:bg-orbit-interactive hover:text-orbit-text",
        className,
      )}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-pressed={isDark}
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
};
