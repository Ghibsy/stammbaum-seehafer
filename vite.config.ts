import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Basis-Pfad für GitHub Pages: https://<name>.github.io/stammbaum-seehafer/
const base = process.env.VITE_BASE ?? '/stammbaum-seehafer/';

// Strenge Content-Security-Policy nur im Produktions-Build (Dev-Server braucht Inline-Skripte für HMR).
// Netzwerkverbindungen ausschließlich zu Microsoft-Anmeldung, Graph, OneDrive-Downloadservern und – nur auf Knopfdruck
// bzw. beim Öffnen der Karte – OpenStreetMap (Kartenkacheln, Ortssuche mit reinem Ortsnamen).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://tile.openstreetmap.org",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' https://nominatim.openstreetmap.org https://graph.microsoft.com https://login.microsoftonline.com https://login.live.com https://*.1drv.com https://*.microsoftpersonalcontent.com https://*.livefilestore.com https://*.storage.live.com",
  'frame-src https://login.microsoftonline.com https://login.live.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'robots.txt'],
      manifest: {
        name: 'Stammbaum Seehafer',
        short_name: 'Stammbaum',
        description: 'Private Familienforschung',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f3ec',
        theme_color: '#2f4a3a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
