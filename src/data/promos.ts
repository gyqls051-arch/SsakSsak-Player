// Self-promo banner (exit popup only). Image is bundled (src/assets/banners) so
// it ships with the app. Swap the PNG and the url for real campaigns.
import exitImg from '../assets/banners/exit.png';

// TODO: 실제 배포 시 진짜 제품 링크로 교체
const PROMO_URL = 'https://github.com/rlagyqls051-create/OFFCUT_Play';

export interface Banner {
  image: string;
  /** width / height of the source image, for layout */
  aspect: number;
  url: string;
}

export const EXIT_BANNER: Banner = { image: exitImg, aspect: 600 / 500, url: PROMO_URL };
