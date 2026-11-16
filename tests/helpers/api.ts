import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../../apps/api/src/config.js';
import { createApplication } from '../../apps/api/src/runtime.js';
import type { ApplicationOptions } from '../../apps/api/src/runtime.js';
import type { ExtractorPort, ExtractionOutcome } from '../../apps/api/src/features/queue/worker.js';
import type { ExtractRequest, ExtractResult } from '../../packages/contracts/src/extractor.js';
import type { StreamFrame } from '../../packages/contracts/src/events.js';

export function resultFor(request: ExtractRequest, name = 'success'): ExtractionOutcome {
  const result = JSON.parse(readFileSync(new URL(`../fixtures/extractor/${name}.json`, import.meta.url), 'utf8')) as ExtractResult;
  result.request_id = request.request_id; result.source.input_url = request.url; result.source.canonical_url = request.url;
  result.source.platform = 'youtube'; result.request_context.output_language = 'es';
  result.extensions = { ...result.extensions, 'private:trace': 'C:\\private-savedex\\config-secret' };
  if (result.processing.operations[0]) result.processing.operations[0].model = 'C:\\private-savedex\\config-secret';
  return { kind: 'result', resultJson: JSON.stringify(result), exitCode: name === 'partial' ? 2 : name === 'error' ? 65 : 0, stderr: 'C:\\private-savedex\\config-secret' };
}
export class ApiPort implements ExtractorPort {
  calls: { request: ExtractRequest; resolve: (outcome: ExtractionOutcome) => void }[] = [];
  run(request: ExtractRequest): Promise<ExtractionOutcome> { return new Promise(resolve => this.calls.push({ request, resolve })); }
  finish(index: number, name = 'success') { this.calls[index]!.resolve(resultFor(this.calls[index]!.request, name)); }
}
export async function until(condition: () => boolean, timeout = 5000): Promise<void> {
  const end = Date.now() + timeout;
  while (!condition()) { if (Date.now() > end) throw new Error('No se observó la condición esperada'); await new Promise(r => setTimeout(r, 5)); }
}
export async function setupApi(options: ApplicationOptions = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-api-'));
  const config = loadConfig({ SAVEDEX_DATABASE: path.join(directory, 'savedex.sqlite') });
  const port = new ApiPort();
  let application: Awaited<ReturnType<typeof createApplication>>;
  try { application = await createApplication({ config, extractor: port, ...options }); }
  catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  return { ...application, directory, config, port, async cleanup() {
    const closing = application.app.close();
    port.calls.forEach((_, index) => port.finish(index));
    await closing; rmSync(directory, { recursive: true, force: true });
  } };
}
export async function connectSse(base: string, cursor?: string) {
  const controller = new AbortController();
  const response = await fetch(base + '/events', { signal: controller.signal, headers: cursor ? { 'Last-Event-ID': cursor } : {} });
  if (response.status !== 200) throw new Error(`SSE ${response.status}`);
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  let pending = '';
  return { response, close() { controller.abort(); }, async next(): Promise<{ frame: StreamFrame | null; id: string | null; comment: boolean }> {
    const deadline = AbortSignal.timeout(5000);
    while (true) {
      const at = pending.indexOf('\n\n');
      if (at >= 0) {
        const raw = pending.slice(0, at); pending = pending.slice(at + 2);
        if (raw.startsWith('retry:')) continue;
        if (raw.startsWith(':')) return { frame: null, id: null, comment: true };
        const data = raw.split('\n').find(line => line.startsWith('data: '))?.slice(6);
        const id = raw.split('\n').find(line => line.startsWith('id: '))?.slice(4) ?? null;
        if (data) return { frame: JSON.parse(data) as StreamFrame, id, comment: false };
      }
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const aborted = () => reject(new Error('SSE frame timeout'));
        deadline.addEventListener('abort', aborted, { once: true });
        reader.read().then(v => { deadline.removeEventListener('abort', aborted); resolve(v); }, reject);
      });
      if (chunk.done) throw new Error('SSE closed');
      pending += decoder.decode(chunk.value, { stream: true });
    }
  } };
}
