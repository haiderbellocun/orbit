import React, { useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { cn } from "@/src/lib/utils";
import { getTheme, toggleTheme, type Theme } from "@/src/lib/theme";

type ThemeToggleProps = {
  className?: string;
  onChange?: (theme: Theme) => void;
};

/**
 * Switch between Orbit Day and Orbit Night. The palette itself lives in CSS
 * (`[data-theme="dark"]` in index.css), so flipping the attribute repaints the
 * whole app without re-rendering the tree.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className, onChange }) => {
  const [theme, setTheme] = useState<Theme>(() => getTheme());
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => {
        const next = toggleTheme();
        setTheme(next);
        onChange?.(next);
      }}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-[10px] border border-orbit-border text-orbit-muted transition-colors duration-150 hover:bg-orbit-interactive hover:text-orbit-text",
        className
      )}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-pressed={isDark}
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
};
