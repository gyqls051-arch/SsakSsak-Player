import type { Promo } from '../data/promos';

interface Props {
  promo: Promo;
  /** 'slim' = side-panel footer strip, 'card' = larger card for the exit popup. */
  variant?: 'slim' | 'card';
}

export default function PromoBanner({ promo, variant = 'slim' }: Props) {
  const open = () => window.offcut.shell.openExternal(promo.url);

  if (variant === 'card') {
    return (
      <button
        onClick={open}
        className={`w-full text-left rounded-lg p-4 bg-gradient-to-br ${promo.gradient} border border-white/10 hover:border-white/25 transition`}
      >
        <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{promo.badge}</div>
        <div className="text-base font-bold text-white">{promo.title}</div>
        <div className="text-xs text-white/70 mt-0.5">{promo.subtitle}</div>
        <div className="mt-3 inline-block text-xs font-semibold text-white bg-white/15 hover:bg-white/25 rounded px-3 py-1.5">
          {promo.cta} →
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={open}
      className={`w-full text-left rounded-md p-2.5 bg-gradient-to-br ${promo.gradient} border border-white/10 hover:border-white/25 transition group`}
      title={`${promo.title} — ${promo.subtitle}`}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-wider text-white/45">{promo.badge}</div>
          <div className="text-xs font-bold text-white truncate">{promo.title}</div>
          <div className="text-[10px] text-white/60 truncate">{promo.subtitle}</div>
        </div>
        <span className="shrink-0 text-[10px] font-semibold text-white/80 bg-white/10 group-hover:bg-white/20 rounded px-2 py-1">
          {promo.cta}
        </span>
      </div>
    </button>
  );
}
