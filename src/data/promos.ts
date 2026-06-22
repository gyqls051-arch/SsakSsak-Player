// Self-promo banners. Images are bundled (src/assets/banners) so they ship with
// the app. Swap the PNGs and the url for real campaigns.
import sidebarImg from '../assets/banners/sidebar.png';
import exitImg from '../assets/banners/exit.png';

// TODO: 실제 배포 시 진짜 제품 링크로 교체
const PROMO_URL = 'https://github.com/rlagyqls051-create/OFFCUT_Play';

export interface Banner {
  image: string;
  /** width / height of the source image, for layout */
  aspect: number;
  url: string;
}

export const SIDEBAR_BANNER: Banner = { image: sidebarImg, aspect: 608 / 1228, url: PROMO_URL };
export const EXIT_BANNER: Banner = { image: exitImg, aspect: 600 / 500, url: PROMO_URL };
