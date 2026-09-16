import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '../store/settingsStore';

const KEY = 'offcut.player.recent';
const MAX = 10;
type Listener = () => void;

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function save(files: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(files));
  } catch {
    /* storage unavailable — 최근 목록은 메모리에서만 유지 */
  }
}

let snapshot = load();
const listeners = new Set<Listener>();

function getSnapshot() {
  return snapshot;
}

function publish(next: string[], persist = true) {
  snapshot = next;
  if (persist) save(next);
  listeners.forEach((listener) => listener());
}

function handleStorage(event: StorageEvent) {
  if (event.key === KEY || event.key === null) publish(load(), false);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', handleStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', handleStorage);
  };
}

function add(path: string) {
  // Secret (incognito) mode: don't leave a trace of what was opened.
  if (useSettingsStore.getState().secret) return;
  publish([path, ...snapshot.filter((p) => p !== path)].slice(0, MAX));
}

function remove(path: string) {
  publish(snapshot.filter((p) => p !== path));
}

function clear() {
  publish([]);
}

export function useRecentFiles() {
  const files = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { files, add, remove, clear };
}
