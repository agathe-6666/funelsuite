import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev : le front (Vite, 5173) parle au Worker local (wrangler dev, 8787)
// via le proxy /api. En prod : même origine, le Worker sert l'app + l'API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});
