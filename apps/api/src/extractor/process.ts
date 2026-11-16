import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliAdapterOptions } from './adapter.js';
import type { ProgressEvent } from '@savedex/contracts/extractor';
import { DiagnosticTail, ProgressScanner } from './protocol.js';
import { ExtractorCleanupError } from './errors.js';

export interface RawCliResult {
  stdout: Buffer;
  stderr: string;
  exitCode: number | null;
  termination: 'completed' | 'timeout' | 'overflow' | 'launch_error';
  message: string | null;
}
export function executeCli(options: CliAdapterOptions, args: readonly string[], input = '', emit?: (event: ProgressEvent) => void): Promise<RawCliResult> {
  if (process.platform !== 'win32') return Promise.resolve({ stdout: Buffer.alloc(0), stderr: '', exitCode: null, termination: 'launch_error', message: 'Este supervisor requiere Windows 10 o posterior' });
  const timeoutMs = Math.ceil(((options.timeoutSeconds ?? 900) + (options.exitGraceSeconds ?? 20)) * 1000);
  const spec = Buffer.from(JSON.stringify({ executable: options.executable, arguments: [...(options.argsPrefix ?? []), ...args], deadlineMs: timeoutMs }), 'utf8').toString('base64');
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./windows-job.ps1', import.meta.url)), '-Spec', spec, '-OwnerPid', String(process.pid)],
      { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' } });
    const stdout: Buffer[] = [], diagnostic = new DiagnosticTail(options.maxStderrBytes ?? 65536);
    const scanner = new ProgressScanner(options.maxProgressLineBytes ?? 65536, event => emit?.(event));
    let stdoutBytes = 0, closed = false;
    let forced: 'timeout' | 'overflow' | 'launch_error' | null = null, message: string | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = (reason: 'timeout' | 'overflow') => {
      if (closed || forced) return;
      forced = reason;
      message = reason === 'timeout' ? 'El CLI superó el deadline del backend' : 'stdout supera el límite permitido';
      // Closing the supervisor process closes its non-inherited job handle: the entire job dies.
      child.kill('SIGKILL');
      cleanupTimer = setTimeout(() => {
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
        reject(new ExtractorCleanupError('No se pudo confirmar el cierre del árbol del CLI'));
      }, 7000);
    };
    const deadline = setTimeout(() => terminate('timeout'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      if (forced) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > (options.maxStdoutBytes ?? 16 * 1024 * 1024)) terminate('overflow');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { diagnostic.push(chunk); scanner.push(chunk); });
    child.stdin.on('error', () => { /* Early process termination may close stdin before its write finishes. */ });
    child.on('error', error => { forced = 'launch_error'; message = error.message; });
    child.on('close', code => {
      closed = true; clearTimeout(deadline); if (cleanupTimer) clearTimeout(cleanupTimer);
      scanner.end();
      if (code === 125) { reject(new ExtractorCleanupError('El supervisor no pudo confirmar la limpieza del CLI')); return; }
      resolve({ stdout: Buffer.concat(stdout), stderr: diagnostic.text(), exitCode: code,
        termination: forced ?? (code === 124 ? 'timeout' : 'completed'), message });
    });
    child.stdin.end(input, 'utf8');
  });
}
