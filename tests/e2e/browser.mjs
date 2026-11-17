import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeCli } from '../../apps/api/dist/extractor/process.js';
export async function until(fn, message = 'condition', ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 30)); }
  throw new Error(`Timeout: ${message}`);
}
export async function browser() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'savedex-ui-chrome-'));
  const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  if (!executable) throw new Error('Chrome/Edge required');
  const owned = executeCli({ executable, timeoutSeconds: 240, exitGraceSeconds: 0 }, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank']);
  let ws;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => existsSync(portFile), 'Chrome startup');
    const port = readFileSync(portFile, 'utf8').split('\n')[0];
    let target;
    // DevToolsActivePort may exist before Chrome creates its first page target.
    await until(async () => {
      const tabs = await fetch(`http://127.0.0.1:${port}/json`, {signal:AbortSignal.timeout(5000)}).then(r => r.json());
      target = tabs.find(t => t.type === 'page'); return !!target?.webSocketDebuggerUrl;
    }, 'Chrome page target');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer=setTimeout(()=>reject(new Error('Chrome DevTools connection timeout')),10000);
      ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(new Error('Chrome DevTools connection failed'));};
    });
    let seq = 0, loaded = 0; const pending = new Map(); const errors = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p?.reject(new Error(JSON.stringify(m.error))); else p?.resolve(m.result); }
      if (m.method === 'Page.loadEventFired') loaded++;
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(arg => arg.description ?? arg.value ?? '').join(' ')); };
    ws.onclose=()=>{for(const p of pending.values())p.reject(new Error('Chrome DevTools connection closed'));pending.clear();};
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Chrome command timeout: '+method));},15000);
      pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
      ws.send(JSON.stringify({id,method,params}));
    });
    const send = async (method, params = {}) => {
      const previous = loaded, result = await command(method, params);
      // CDP acknowledges navigation before the old DOM disappears. Hash-only
      // navigation has no loaderId and is settled by each route's own assertions.
      if (method === 'Page.reload' || method === 'Page.navigate' && result.loaderId) {
        await until(() => loaded > previous, 'page load after '+method);
      }
      return result;
    };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
    return { send, evaluate, errors, executable,
      async text() { return evaluate('document.body.innerText'); },
      async waitText(text) { return until(async () => (await evaluate('document.body.innerText')).includes(text), text); },
      async click(selector) { await until(() => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&!e.disabled})()`), 'enabled '+selector); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); },
      async fill(selector, value) {
        if(await evaluate('document.querySelector('+JSON.stringify(selector)+')?.matches("z-select")')){
          await this.click(selector+' [data-slot="select-trigger"]');
          await this.click('[role="option"][value='+JSON.stringify(value)+']');return;
        }
        await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`); },
      async close() { try { await send('Browser.close'); } catch {} await owned; ws.close(); rmSync(profile,{recursive:true,force:true}); },
    };
  } catch(error) { ws?.close(); await owned; rmSync(profile,{recursive:true,force:true}); throw error; }
}
