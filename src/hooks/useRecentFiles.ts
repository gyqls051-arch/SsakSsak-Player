import { useState, useEffect, useCallback } from 'react';

const KEY = 'offcut.player.recent';
const MAX = 10;

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
  } catch {}
}

export function useRecentFiles() {
  const [files, setFiles] = useState<string[]>(() => load());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setFiles(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((path: string) => {
    setFiles((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, MAX);
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((path: string) => {
    setFiles((prev) => {
      const next = prev.filter((p) => p !== path);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    save([]);
  }, []);

  return { files, add, remove, clear };
}
