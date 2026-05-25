import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// Stricter CSP for production builds. Dev keeps 'unsafe-inline' because Vite
// HMR injects scripts at runtime. style-src keeps 'unsafe-inline' because
// React uses inline `style={...}` attributes for dynamic values.
var PROD_CSP = "default-src 'self' offcut-cap:; " +
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
            transformIndexHtml: function (html, ctx) {
                if (!ctx.bundle)
                    return html; // dev: leave CSP alone for HMR
                return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*\/>/, "<meta http-equiv=\"Content-Security-Policy\" content=\"".concat(PROD_CSP, "\" />"));
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
