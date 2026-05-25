export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatTimeForFilename(seconds: number): string {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  return `${pad(h)}-${pad(m)}-${pad(sec)}-${pad(ms, 3)}`;
}

export function formatTimeMs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  const base = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return `${base}.${pad(ms, 3)}`;
}

export function evalRate(s?: string): number {
  if (!s) return 0;
  const [a, b] = s.split('/');
  const x = Number(a);
  const y = b ? Number(b) : 1;
  return y ? x / y : 0;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatBitrate(s?: string): string {
  if (!s) return '-';
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n < 1_000_000) return `${(n / 1000).toFixed(0)} kbps`;
  return `${(n / 1_000_000).toFixed(2)} Mbps`;
}

export function isHDR(stream: FfprobeStream): boolean {
  const pix = stream.pix_fmt || '';
  const tr = stream.color_transfer || '';
  const has10bit = pix.includes('10') || pix.includes('12');
  const hdrTr = tr === 'smpte2084' || tr === 'arib-std-b67';
  return has10bit && hdrTr;
}

export function captureUrl(absolutePath: string, cacheBust?: number): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  const t = cacheBust ?? Date.now();
  return `offcut-cap://local/${encodeURIComponent(normalized)}?t=${t}`;
}
