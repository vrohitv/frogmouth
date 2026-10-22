import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/* One self-contained HTML file, written straight to where it is used:
   `npm run build` -> ./frogmouth.html, `npm run build:test` -> ./test/frogmouth.html
   (the same page with test/smoke.js bundled in). */
export default defineConfig(({ mode }) => {
  const test = mode === 'test';
  return {
    root: here('./src'),
    base: './',
    publicDir: false,
    define: { __TEST__: JSON.stringify(test) },
    build: {
      outDir: here(test ? './test' : '.'),
      emptyOutDir: false, // the output folder is the project (or test) folder: never wipe it
      rollupOptions: { input: here('./src/frogmouth.html') },
      target: 'es2022',
      modulePreload: false,
      reportCompressedSize: false,
    },
    plugins: [
      viteSingleFile({ removeViteModuleLoader: true }),
      {
        // the favicon is the brand symbol (tools/brand.py); inline it so the page stays one file
        name: 'frogmouth-favicon',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => html.replace('href="./brand/favicon.svg"', () =>
            `href="data:image/svg+xml,${encodeURIComponent(readFileSync(here('./src/brand/favicon.svg'), 'utf8').trim())}"`),
        },
      },
      {
        // the page forbids all network access; the dev server needs its own client and websocket
        name: 'frogmouth-dev-csp',
        apply: 'serve',
        transformIndexHtml: (html) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, ''),
      },
      {
        // the dev server serves the page at / as well as /frogmouth.html
        name: 'frogmouth-dev-root',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => { if (req.url === '/' || req.url === '/index.html') req.url = '/frogmouth.html'; next(); });
        },
      },
    ],
  };
});
