import { cp } from 'node:fs/promises';
const root = new URL('../apps/api/', import.meta.url);
await cp(new URL('src/db/migrations/', root), new URL('dist/db/migrations/', root), { recursive: true });
for (const name of ['windows-job.ps1', 'windows-job.cs']) {
  await cp(new URL(`src/extractor/${name}`, root), new URL(`dist/extractor/${name}`, root));
}
