const KEY = 'offcut.player.positions';
const MAX_ENTRIES = 200;
const MIN_RESUME_SEC = 30; // 이보다 앞이면 저장/복원 안 함
const TAIL_GUARD_SEC = 60; // 끝에서 60초 이내면 "다 본 것"으로 간주해 기록 삭제

export interface SavedPosition {
  position: number;
  duration: number;
  updatedAt: number;
}

type PositionMap = Record<string, SavedPosition>;

// mpv가 경로 구분자를 바꿔 돌려줄 수 있으므로 키를 정규화해 비교한다.
function normKey(p: string): string {
  return p.replace(/\//g, '\\').toLowerCase();
}

function load(): PositionMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? (obj as PositionMap) : {};
  } catch {
    return {};
  }
}

function persist(map: PositionMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — 이어보기 없이 동작 */
  }
}

export function savePosition(path: string, position: number, duration: number): void {
  if (!path || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
  const map = load();
  const k = normKey(path);
  if (position < MIN_RESUME_SEC || position > duration - TAIL_GUARD_SEC) {
    // 앞부분이거나 끝까지 본 파일은 기록을 남기지 않는다 (있던 기록도 삭제).
    if (map[k]) {
      delete map[k];
      persist(map);
    }
    return;
  }
  map[k] = { position, duration, updatedAt: Date.now() };
  // LRU 캡: 오래된 항목부터 제거.
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => map[a].updatedAt - map[b].updatedAt)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((old) => delete map[old]);
  }
  persist(map);
}

export function lookupPosition(path: string): SavedPosition | null {
  if (!path) return null;
  return load()[normKey(path)] ?? null;
}

export function removePosition(path: string): void {
  const map = load();
  const k = normKey(path);
  if (map[k]) {
    delete map[k];
    persist(map);
  }
}
