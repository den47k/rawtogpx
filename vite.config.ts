import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repo>/. The deploy workflow sets BASE_PATH from the
// repository name; locally it defaults to /rawtogpx/.
function basePath(raw = process.env.BASE_PATH ?? '/rawtogpx/'): string {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

const GPX_TYPES = [
  '.gpx',
  'application/gpx+xml',
  'application/octet-stream',
  'text/xml',
  'application/xml',
];

export default defineConfig({
  base: basePath(),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      injectRegister: false, // registered in main.tsx
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      manifest: {
        id: './',
        name: 'GPX Rebuilder',
        short_name: 'GPX Rebuilder',
        description:
          'Rebuild a timestamped GPX run from a planned route and your splits. Works offline; files never leave your device.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#ea580c',
        background_color: '#f8fafc',
        categories: ['sports', 'health', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        share_target: {
          action: 'share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'route', accept: GPX_TYPES }] },
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
