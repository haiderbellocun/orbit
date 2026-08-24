import React, { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon } from "@heroicons/react/24/solid";
import type { OrbitNotification } from "@/src/types";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/src/lib/api";
import { cn } from "@/src/lib/utils";

function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
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
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
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
        className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-orbit-border text-orbit-text-secondary transition-colors duration-150 hover:bg-orbit-interactive hover:text-orbit-text"
        aria-label="Notificaciones"
      >
        <BellIcon className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orbit-danger px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-[12px] border border-orbit-border bg-orbit-elevated shadow-2xl shadow-slate-200/80 sm:w-96">
          <div className="flex items-center justify-between border-b border-orbit-border px-4 py-3">
            <p className="orbit-label">Notificaciones</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                className="text-[10px] font-semibold uppercase tracking-wide text-orbit-primary hover:text-orbit-primary-hover"
              >
                Marcar leídas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="py-8 text-center text-sm text-orbit-muted">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-orbit-muted">
                Sin notificaciones
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickItem(n)}
                      className={cn(
                        "w-full border-b border-orbit-border px-4 py-3 text-left transition-colors duration-150 hover:bg-orbit-interactive",
                        !n.readAt && "bg-orbit-primary/5"
                      )}
                    >
                      <p className="text-sm font-semibold text-orbit-text">{n.title}</p>
                      {n.body && (
                        <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-orbit-text-secondary">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-orbit-muted">
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
