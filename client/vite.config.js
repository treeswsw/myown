import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

const commit = () => {
  const env = process.env.RENDER_GIT_COMMIT;
  if (env) return env.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().slice(0, 7) || 'dev'; } catch { return 'dev'; }
};

export default defineConfig({
  define: { __BUILD__: JSON.stringify(commit()) },
  server: { proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
