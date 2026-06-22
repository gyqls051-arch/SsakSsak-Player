import type { Banner } from '../data/promos';

interface Props {
  banner: Banner;
  rounded?: string;
}

export default function PromoBanner({ banner, rounded = 'rounded-md' }: Props) {
  return (
    <button
      onClick={() => window.offcut.shell.openExternal(banner.url)}
      className={`block w-full overflow-hidden ${rounded} border border-white/10 hover:border-white/25 transition`}
      title="광고 · 클릭하여 자세히 보기"
    >
      <img src={banner.image} alt="광고" draggable={false} className="block w-full h-auto" />
    </button>
  );
}
