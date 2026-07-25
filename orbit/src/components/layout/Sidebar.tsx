import React from 'react';
import { motion } from 'motion/react';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/solid';
import {
  UserGroupIcon as UserGroupOutlineIcon,
  AcademicCapIcon as AcademicCapOutlineIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/src/lib/utils';
import { View, NAV_ITEMS, type NavItem } from '@/src/types';
import { BRAND_CONFIG, APP_ICONS } from '@/src/config/brand';
import { Logo } from '../common/Logo';

interface SidebarProps {
  currentView: View;
  setView: (v: View) => void;
  isOpen?: boolean;
  onClose?: () => void;
  /** Por defecto `NAV_ITEMS` completo. */
  navItems?: NavItem[];
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  isOpen,
  onClose,
  navItems = NAV_ITEMS,
  onLogout,
}) => {
  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 md:left-4 md:top-4 md:bottom-4 w-[280px] md:w-64 glass-panel flex flex-col z-[100] transition-all duration-500 rounded-none md:rounded-3xl border-y-0 border-l-0 md:border",
      isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
    )}>
      <div className="p-8 flex items-center justify-between">
        <motion.button
          type="button"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setView('home');
            onClose?.();
          }}
          className="flex items-center gap-4 cursor-pointer"
          aria-label="Volver al Command Center"
        >
          <motion.div 
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.6 }}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-white shadow-xl shadow-violet-500/20"
          >
            <Logo className="h-7 w-7" />
          </motion.div>
          <span className="font-bold text-2xl tracking-tight text-slate-900 font-display">{BRAND_CONFIG.name}</span>
        </motion.button>
        <button 
          onClick={onClose}
          className="md:hidden p-2 text-slate-400 hover:text-slate-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <nav className="flex-1 px-6 py-8 space-y-3 overflow-y-auto no-scrollbar">
        {navItems.map((item, i) => {
          const isActive = currentView === item.id || (currentView.startsWith(item.id.split('-')[0]) && item.id !== 'home');
          const OutlineIcon =
            item.id === 'lites'
              ? UserGroupOutlineIcon
              : item.id === 'academic-load'
                ? AcademicCapOutlineIcon
                : null;
          const Icon = OutlineIcon
            ? null
            : APP_ICONS[item.iconKey as keyof typeof APP_ICONS];

          return (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView(item.id as View)}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 group relative",
                isActive 
                  ? "bg-white shadow-xl shadow-slate-200/50 border border-white/50 text-violet-600 font-semibold" 
                  : "text-slate-500 hover:text-violet-600 hover:bg-white/40"
              )}
            >
              {OutlineIcon && (
                <div
                  className={cn(
                    "relative h-[22px] w-[22px] shrink-0 transition-transform duration-300 group-hover:scale-110 flex items-center justify-center",
                    isActive ? "text-violet-600" : "text-slate-400 group-hover:text-violet-500"
                  )}
                >
                  <OutlineIcon className="h-full w-full" strokeWidth={1.75} />
                </div>
              )}
              {Icon && (
                <div className={cn(
                  "relative h-[22px] w-[22px] shrink-0 transition-transform duration-300 group-hover:scale-110 flex items-center justify-center",
                  isActive ? "text-violet-600" : "text-slate-400 group-hover:text-violet-500"
                )}>
                  <Icon 
                    className="h-full w-full" 
                    style={{ fill: isActive ? 'url(#icon-gradient)' : 'currentColor' }}
                  />
                </div>
              )}
              <span className="text-sm tracking-wide">{item.label}</span>
              {isActive && (
                <motion.div 
                  layoutId="active-indicator"
                  className="absolute left-0 w-1.5 h-6 bg-gradient-to-b from-violet-500 to-fuchsia-500 rounded-r-full"
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      <div className="p-6 border-t border-white/30">
        <button 
          onClick={() => {
            onLogout?.();
            setView('login');
          }}
          className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-slate-500 hover:bg-rose-50/50 hover:text-rose-600 transition-all duration-300 group"
        >
          <ArrowRightOnRectangleIcon className="h-[22px] w-[22px] group-hover:text-rose-600 group-hover:rotate-12 transition-transform" />
          <span className="font-medium text-sm">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};
