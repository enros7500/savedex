import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliAdapter } from '../../apps/api/src/extractor/adapter.js';
const marker = process.argv[2]!;
const adapter = new CliAdapter({ executable: process.execPath,
  argsPrefix: [fileURLToPath(new URL('./fake-extractor.mjs', import.meta.url)), 'hang-tree', marker],
  modelDir: path.dirname(marker), workDir: path.dirname(marker), timeoutSeconds: 15, exitGraceSeconds: 2 });
await adapter.run({ schema_version: '3.0.0', request_id: 'owner_test', url: 'https://www.youtube.com/watch?v=AbC_123-xyz', output_language: 'es' }, 'normal');
