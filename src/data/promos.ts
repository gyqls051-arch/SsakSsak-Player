// Self-promo banner slots (MOCKUP). Swap title/subtitle/url/gradient for real
// campaigns later — this is intentionally placeholder content, not an ad network.
export interface Promo {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  cta: string;
  url: string;
  /** Tailwind gradient classes for the mock banner background. */
  gradient: string;
}

// TODO: 실제 배포 시 url 을 진짜 제품 링크로 교체
const PLACEHOLDER_URL = 'https://github.com/rlagyqls051-create/OFFCUT_Play';

export const PROMOS: Promo[] = [
  {
    id: 'studio',
    badge: 'AD · 자사',
    title: '싹싹김치 STUDIO',
    subtitle: '프리미어 자막 자동생성 · AI 컷편집',
    cta: '자세히 보기',
    url: PLACEHOLDER_URL,
    gradient: 'from-orange-500/30 to-rose-500/20',
  },
  {
    id: 'library',
    badge: 'AD · 자사',
    title: 'OFFCUT Library',
    subtitle: '영상 소스 · 에셋 한 곳에서 관리',
    cta: '다운로드',
    url: PLACEHOLDER_URL,
    gradient: 'from-sky-500/30 to-indigo-500/20',
  },
  {
    id: 'pro',
    badge: 'AD · 자사',
    title: '싹싹김치 Pro',
    subtitle: '광고 제거 + 프리미엄 내보내기',
    cta: '업그레이드',
    url: PLACEHOLDER_URL,
    gradient: 'from-emerald-500/30 to-teal-500/20',
  },
];
