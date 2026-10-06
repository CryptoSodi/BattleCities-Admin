import { build } from 'esbuild';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist/', import.meta.url);
// The fixed generated-output directory is the only cleanup target.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../public/', import.meta.url), output, { recursive: true });
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
await build({
  absWorkingDir: root,
  entryPoints: { admin: 'src/admin/main.ts', 'player-profile': 'src/playerProfile/main.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  define: { __ADMIN_VERSION__: JSON.stringify(version) },
});
console.log(`Built Battle Cities Admin ${version}`);
