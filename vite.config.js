import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/* One self-contained HTML file: `npm run build` -> frogmouth.html,
   `npm run build:test` -> test/frogmouth.test.html (with test/smoke.js). */
export default defineConfig(({ mode }) => {
  const test = mode === 'test';
  const outDir = here(test ? './.build-test' : './.build');
  const target = here(test ? './test/frogmouth.test.html' : './frogmouth.html');
  return {
    root: here('./src'),
    base: './',
    define: { __TEST__: JSON.stringify(test) },
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      modulePreload: false,
      reportCompressedSize: false,
    },
    plugins: [
      viteSingleFile({ removeViteModuleLoader: true }),
      {
        // the page forbids all network access; the dev server needs its own client and websocket
        name: 'frogmouth-dev-csp',
        apply: 'serve',
        transformIndexHtml: (html) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, ''),
      },
      {
        name: 'frogmouth-output',
        apply: 'build',
        closeBundle() {
          renameSync(`${outDir}/index.html`, target);
          rmSync(outDir, { recursive: true, force: true });
        },
      },
    ],
  };
});
