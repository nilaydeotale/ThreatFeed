/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/ThreatFeed/' : '/',
  plugins: [
    react(),
    {
      name: 'csp-inject',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">\n</head>`,
        );
      },
    },
  ],
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
