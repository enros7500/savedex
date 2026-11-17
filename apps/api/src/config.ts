import type { CliAdapterOptions } from './extractor/adapter.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import os from 'node:os';
export function readEnvironment(env:NodeJS.ProcessEnv=process.env,root=fileURLToPath(new URL('../../../',import.meta.url))):NodeJS.ProcessEnv {
  try{return {...parseEnv(readFileSync(path.join(root,'.env'),'utf8')),...env};}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {...env};throw new Error('No se pudo leer el archivo .env de Savedex');}
}
export interface AppConfig { host: '127.0.0.1'; port: number; database: string; timezone: string; extractor: CliAdapterOptions; externalInference?: 'disabled' | 'openai'; codexExecutable?: string }
export function loadConfig(env: NodeJS.ProcessEnv = process.env, root = fileURLToPath(new URL('../../../', import.meta.url))): AppConfig {
  const numeric = (key: string, fallback: number, min: number, max: number) => {
    const value = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Configuración inválida: ${key}`);
    return value;
  };
  const resolve = (key: string, fallback: string) => {
    const value = env[key] ?? fallback;
    if (!value.trim() || value.includes('\0')) throw new Error(`Ruta inválida: ${key}`);
    return path.resolve(root, value);
  };
  const executable = resolve('SAVEDEX_EXTRACTOR_EXE', '../savedex-extractor/work/asr-venv/Scripts/savedex-extractor.exe');
  if (process.platform === 'win32' && path.extname(executable).toLowerCase() !== '.exe') throw new Error('El extractor debe ser un ejecutable .exe, no un lanzador shell');
  if (env['HOST'] && env['HOST'] !== '127.0.0.1') throw new Error('Savedex solo escucha en loopback');
  const port = numeric('PORT', 3210, 1, 65535);
  if (!Number.isInteger(port)) throw new Error('Puerto inválido');
  const timezone = env['SAVEDEX_TIMEZONE'] ?? 'Europe/Madrid';
  new Intl.DateTimeFormat('es', { timeZone: timezone });
  const externalInference = env['SAVEDEX_EXTERNAL_INFERENCE'] ?? 'disabled';
  if (!['disabled','openai'].includes(externalInference)) throw new Error('Configuración inválida: SAVEDEX_EXTERNAL_INFERENCE');
  const codexExecutable=resolve('SAVEDEX_CODEX_EXE',path.join(env['LOCALAPPDATA']??path.join(os.homedir(),'AppData/Local'),'Programs/OpenAI/Codex/bin/codex.exe'));
  if(process.platform==='win32'&&path.extname(codexExecutable).toLowerCase()!=='.exe')throw new Error('Codex debe ser un ejecutable .exe');
  return { host: '127.0.0.1', port, timezone, codexExecutable, externalInference: externalInference as 'disabled' | 'openai', database: resolve('SAVEDEX_DATABASE', './data/savedex.sqlite'),
    extractor: { executable, modelDir: resolve('SAVEDEX_EXTRACTOR_MODEL_DIR', '../savedex-extractor/work/models/faster-whisper-medium'),
      workDir: resolve('SAVEDEX_EXTRACTOR_WORK_DIR', './data/extractor-work'),
      timeoutSeconds: numeric('SAVEDEX_EXTRACTOR_TIMEOUT_SECONDS', 900, 0.01, 86400),
      exitGraceSeconds: numeric('SAVEDEX_EXTRACTOR_EXIT_GRACE_SECONDS', 20, 0, 300) } };
}
