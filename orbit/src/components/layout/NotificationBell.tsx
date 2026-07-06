import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellIcon } from '@heroicons/react/24/solid';
import type { OrbitNotification } from '@/src/types';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/src/lib/api';

function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

interface NotificationBellProps {
  onOpenVacancy?: (vacancyId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onOpenVacancy,
}) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OrbitNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const n = await getUnreadNotificationCount();
      setUnread(n);
    } catch {
      setUnread(0);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getNotifications({ limit: 30 });
      setItems(list);
      await refreshCount();
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    void refreshCount();
    const t = window.setInterval(() => void refreshCount(), 60_000);
    return () => window.clearInterval(t);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    void loadList();
  }, [open, loadList]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function handleMarkRead(n: OrbitNotification) {
    if (n.readAt) return;
    try {
      await markNotificationRead(n.id);
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x
        )
      );
      setUnread((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead();
      setItems((prev) =>
        prev.map((x) => ({
          ...x,
          readAt: x.readAt ?? new Date().toISOString(),
        }))
      );
      setUnread(0);
    } catch {
      /* ignore */
    }
  }

  function handleClickItem(n: OrbitNotification) {
    void handleMarkRead(n);
    const vid = n.payload?.vacancyId;
    if (vid && onOpenVacancy) {
      onOpenVacancy(vid);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="glass-button-secondary p-3 relative group"
        aria-label="Notificaciones"
      >
        <BellIcon className="h-5 w-5 group-hover:rotate-12 transition-transform" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[1.1rem] h-[1.1rem] px-0.5 flex items-center justify-center text-[9px] font-bold text-white bg-gradient-to-tr from-rose-500 to-pink-500 rounded-full border-2 border-white shadow-sm">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 glass-panel shadow-2xl p-0 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-700">
              Notificaciones
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                className="text-[10px] font-bold uppercase tracking-widest text-violet-600 hover:text-violet-800"
              >
                Marcar leídas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 italic">
                Sin notificaciones
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickItem(n)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-violet-50/50 transition-colors ${
                        n.readAt ? 'opacity-70' : 'bg-violet-50/30'
                      }`}
                    >
                      <p className="text-sm font-bold text-slate-900">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-slate-600 mt-1 whitespace-pre-line line-clamp-3">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatNotifTime(n.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
