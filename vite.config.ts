import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Stricter CSP for production builds. Dev keeps 'unsafe-inline' because Vite
// HMR injects scripts at runtime. style-src keeps 'unsafe-inline' because
// React uses inline `style={...}` attributes for dynamic values.
const PROD_CSP =
  "default-src 'self' offcut-cap:; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: offcut-cap:; " +
  "font-src 'self' data:; " +
  "connect-src 'self';";

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'offcut-prod-csp',
      transformIndexHtml(html, ctx) {
        if (!ctx.bundle) return html; // dev: leave CSP alone for HMR
        const cspRe = /<meta http-equiv="Content-Security-Policy"[^>]*\/>/;
        if (!cspRe.test(html)) {
          // Fail the production build loudly instead of silently shipping the
          // loose dev CSP (which permits 'unsafe-inline' scripts for HMR).
          throw new Error(
            'offcut-prod-csp: CSP <meta> tag not found in index.html — ' +
              'refusing to build with the insecure dev CSP. Ensure index.html ' +
              'contains a <meta http-equiv="Content-Security-Policy" ... /> tag.',
          );
        }
        return html.replace(
          cspRe,
          `<meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`,
        );
      },
    },
  ],
  base: './',
  server: {
    port: 3011,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
