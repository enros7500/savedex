import { readFile, writeFile } from 'node:fs/promises';
import { compile } from 'json-schema-to-typescript';
const bannerComment = '/* Generated from the extractor schemas 3.0.0 and 3.1.0. Do not edit; pnpm contracts:generate. */';
const sources = await Promise.all(['request', 'result'].map(async name => {
  const schema = JSON.parse(await readFile(`packages/contracts/schemas/${name}.json`, 'utf8'));
  // Titles override the requested type name in the generator.
  schema.title = name === 'request' ? 'ExtractRequest' : 'ExtractResult';
  return compile(schema, schema.title, { bannerComment, additionalProperties: false });
}));
await writeFile('packages/contracts/src/extractor.generated.ts', sources.join('\n'));
