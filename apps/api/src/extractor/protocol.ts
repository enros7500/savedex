import type { ExtractRequest, ProgressEvent, ProgressStep } from '@savedex/contracts/extractor';
import { safeProgress } from './safe-progress.js';
import { parseResult } from '../features/runs/validate-result.js';
import { normalizeUrl } from '../features/videos/normalize-url.js';

export function validateResponse(raw: string, exitCode: number, request: ExtractRequest): void {
  const result = parseResult(raw, exitCode);
  if (result.request_id !== request.request_id) throw new Error('request_id no corresponde a la ejecución');
  if (result.status !== 'error') {
    const expected = normalizeUrl(request.url), actual = normalizeUrl(result.source.input_url);
    if (expected.url !== actual.url || expected.platform !== result.source.platform) throw new Error('Resultado de otro vídeo');
  }
}

/** Bounded byte scanner. Oversized diagnostic lines are discarded until their newline. */
export class ProgressScanner {
  private pending = Buffer.alloc(0);
  private dropping = false;
  constructor(private readonly limit: number, private readonly emit: (event: ProgressEvent) => void) {}
  push(chunk: Buffer): void {
    let start = 0;
    for (let at = 0; at <= chunk.length; at++) {
      if (at !== chunk.length && chunk[at] !== 10) continue;
      const part = chunk.subarray(start, at);
      if (!this.dropping) {
        if (this.pending.length + part.length > this.limit) { this.pending = Buffer.alloc(0); this.dropping = true; }
        else this.pending = Buffer.concat([this.pending, part]);
      }
      if (at < chunk.length) { if (!this.dropping) this.line(this.pending); this.pending = Buffer.alloc(0); this.dropping = false; }
      start = at + 1;
    }
  }
  end(): void { if (!this.dropping && this.pending.length) this.line(this.pending); this.pending = Buffer.alloc(0); }
  private line(bytes: Buffer): void {
    try {
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const event = safeProgress(value);
      if (event) this.emit(event);
    } catch { /* Plain diagnostics, malformed progress and listener errors cannot break the CLI. */ }
  }
}

export class DiagnosticTail {
  private bytes = Buffer.alloc(0);
  constructor(private readonly limit: number) {}
  push(chunk: Buffer): void { this.bytes = Buffer.from(Buffer.concat([this.bytes, chunk]).subarray(-this.limit)); }
  text(): string {
    let start = 0;
    while (start < this.bytes.length && (this.bytes[start]! & 0xc0) === 0x80) start++;
    return this.bytes.subarray(start).toString('utf8');
  }
}
