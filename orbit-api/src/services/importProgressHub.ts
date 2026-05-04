/**
 * Hub en memoria para eventos de progreso de importación (SSE).
 * Hace buffer hasta que un cliente se conecta al stream.
 */

import type { ImportResult } from "../types/import";

export type ImportStreamEvent =
  | {
      type: "progress";
      phase: string;
      label: string;
      current?: number;
      total?: number;
      percent?: number;
    }
  | { type: "complete"; result: ImportResult }
  | { type: "error"; message: string };

const MAX_BACKLOG = 120;

type Room = {
  backlog: ImportStreamEvent[];
  listeners: Set<(e: ImportStreamEvent) => void>;
};

const rooms = new Map<string, Room>();

function getOrCreateRoom(importId: string): Room {
  let room = rooms.get(importId);
  if (!room) {
    room = { backlog: [], listeners: new Set() };
    rooms.set(importId, room);
  }
  return room;
}

export function emitImportStream(importId: string, event: ImportStreamEvent): void {
  const room = getOrCreateRoom(importId);
  room.backlog.push(event);
  if (room.backlog.length > MAX_BACKLOG) {
    room.backlog.splice(0, room.backlog.length - MAX_BACKLOG);
  }
  room.listeners.forEach((cb) => {
    try {
      cb(event);
    } catch (e) {
      console.error("importProgressHub listener error:", e);
    }
  });
}

export function subscribeImportStream(
  importId: string,
  onEvent: (e: ImportStreamEvent) => void
): () => void {
  const room = getOrCreateRoom(importId);
  for (const e of room.backlog) {
    onEvent(e);
  }
  room.listeners.add(onEvent);
  return () => {
    room.listeners.delete(onEvent);
    if (room.listeners.size === 0 && room.backlog.length === 0) {
      rooms.delete(importId);
    }
  };
}

export function deleteImportRoom(importId: string): void {
  rooms.delete(importId);
}
