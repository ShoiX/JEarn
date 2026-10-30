import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import preact from '@preact/preset-vite';

/** After the build, writes the hashed file list and a content version into dist/sw.js. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'jearn-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) walk(p); else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const precache = files.filter((f) => f !== 'sw.js').sort();
      const hash = createHash('sha256');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(['./', ...precache.map((f) => './' + f)]));
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  test: { environment: 'node' },
});
