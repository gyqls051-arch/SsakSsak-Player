// Self-promo banner (exit popup only). Image is bundled (src/assets/banners) so
// it ships with the app. Swap the PNG and the url for real campaigns.
import exitImg from '../assets/banners/exit.png';

const PROMO_URL = 'https://www.offcut.dev';

export interface Banner {
  image: string;
  /** width / height of the source image, for layout */
  aspect: number;
  url: string;
}

export const EXIT_BANNER: Banner = { image: exitImg, aspect: 600 / 500, url: PROMO_URL };
