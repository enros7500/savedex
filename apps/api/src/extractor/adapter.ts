import type { ExtractRequest, ProgressEvent } from '@savedex/contracts/extractor';
import type { ExtractionMode } from '@savedex/contracts/api';
import type { ExtractionOutcome, ExtractorPort } from '../features/queue/worker.js';
import { executeCli } from './process.js';
import { validateResponse } from './protocol.js';
import path from 'node:path';
export interface CliAdapterOptions {
  executable: string;
  argsPrefix?: readonly string[];
  modelDir: string;
  workDir: string;
  timeoutSeconds?: number;
  exitGraceSeconds?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  maxProgressLineBytes?: number;
  onProgress?: (requestId: string, event: ProgressEvent) => void;
}
export class CliAdapter implements ExtractorPort {
  constructor(private readonly options: CliAdapterOptions) {
    if (!path.isAbsolute(options.executable) || /\.(cmd|bat|ps1)$/i.test(options.executable)) throw new Error('Se requiere ruta absoluta al ejecutable del CLI, sin shell');
    for (const [name, value, max] of [
      ['timeoutSeconds', options.timeoutSeconds ?? 900, 86400], ['exitGraceSeconds', options.exitGraceSeconds ?? 20, 300],
      ['maxStdoutBytes', options.maxStdoutBytes ?? 16 * 1024 * 1024, 16 * 1024 * 1024],
      ['maxStderrBytes', options.maxStderrBytes ?? 65536, 65536], ['maxProgressLineBytes', options.maxProgressLineBytes ?? 65536, 65536],
    ] as const) {
      if (!Number.isFinite(value) || value < (name === 'exitGraceSeconds' ? 0 : 0.01) || value > max) throw new Error(`Límite inválido: ${name}`);
      if (name.startsWith('max') && !Number.isInteger(value)) throw new Error(`El límite debe ser un número entero de bytes: ${name}`);
    }
  }
  async run(request: ExtractRequest, mode: ExtractionMode): Promise<ExtractionOutcome> {
    if (mode !== 'normal' && mode !== 'exhaustive') throw new Error('Modo de extracción inválido');
    const input = JSON.stringify(request);
    if (Buffer.byteLength(input, 'utf8') > 65536) return { kind: 'protocol_error', message: 'Solicitud demasiado grande', exitCode: null };
    const args = ['extract', '--request', '-', '--progress', 'jsonl', '--model-dir', this.options.modelDir,
      '--work-dir', this.options.workDir, '--timeout-seconds', String(this.options.timeoutSeconds ?? 900), '--log-format', 'jsonl'];
    if (mode === 'exhaustive') args.push('--exhaustive');
    const raw = await executeCli(this.options, args, input, event => this.options.onProgress?.(request.request_id, event));
    const shared = { exitCode: raw.exitCode, stderr: raw.stderr };
    if (raw.termination === 'timeout') return { kind: 'timeout', message: 'El CLI superó el deadline del backend; resultado no aceptado', ...shared };
    if (raw.termination === 'overflow') return { kind: 'protocol_error', message: raw.message ?? 'stdout excesivo', ...shared };
    if (raw.termination === 'launch_error' || raw.exitCode === null || (raw.stdout.length === 0 && raw.exitCode !== 0 && raw.exitCode !== 2)) return { kind: 'process_error', message: raw.message ?? `El proceso terminó sin resultado JSON (salida ${raw.exitCode})`, ...shared };
    try {
      const resultJson = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw.stdout);
      validateResponse(resultJson, raw.exitCode, request);
      return { kind: 'result', resultJson, exitCode: raw.exitCode, stderr: raw.stderr };
    } catch (error) { return { kind: 'protocol_error', message: error instanceof Error ? error.message : String(error), ...shared }; }
  }
}
