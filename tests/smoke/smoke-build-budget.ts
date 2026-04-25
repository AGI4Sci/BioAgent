import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const assetsDir = join(process.cwd(), 'dist-ui', 'assets');
const maxJsChunkBytes = 900 * 1024;

const files = await readdir(assetsDir).catch(() => {
  throw new Error('dist-ui/assets is missing. Run npm run build before smoke:build-budget.');
});
const jsFiles = files.filter((file) => file.endsWith('.js'));
assert.ok(jsFiles.length > 0, 'build should emit JS chunks');

const oversized: Array<{ file: string; size: number }> = [];
for (const file of jsFiles) {
  const size = (await stat(join(assetsDir, file))).size;
  if (size > maxJsChunkBytes) oversized.push({ file, size });
}

assert.deepEqual(oversized, [], `JS chunks exceed ${maxJsChunkBytes} bytes: ${JSON.stringify(oversized)}`);
console.log(`[ok] build JS chunks within ${maxJsChunkBytes} byte budget`);
