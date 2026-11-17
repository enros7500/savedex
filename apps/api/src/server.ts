import { createApplication } from './runtime.js';
import { loadConfig, readEnvironment } from './config.js';
import { fileURLToPath } from 'node:url';
import { fetchVideoTitle } from './features/videos/metadata.js';

const config = loadConfig(readEnvironment());
const { app } = await createApplication({ config,titleResolver:fetchVideoTitle,webRoot:fileURLToPath(new URL('../../web/dist/browser/',import.meta.url)) });
try { await app.listen({ host: config.host, port: config.port }); }
catch (error) { await app.close(); throw error; }
console.log(`SaveDex abierto en http://${config.host}:${config.port} · La cola espera a que pulses Iniciar.`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
