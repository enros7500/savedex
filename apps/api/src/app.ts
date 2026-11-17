import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import type { ApiRuntime } from './runtime.js';
import { videoRoutes } from './features/videos/routes.js';
import { queueRoutes } from './features/queue/routes.js';
import { libraryRoutes } from './features/library/routes.js';
import { runRoutes } from './features/runs/routes.js';
import { StreamHub } from './features/events/stream.js';
import { HttpError } from './http-errors.js';
import { webRoutes } from './web.js';
import { placeAgentRoutes } from './features/place-agent/routes.js';

export function buildServer(runtime?: ApiRuntime, heartbeatMs?: number, webRoot?: string) {
  const app = Fastify({ bodyLimit: 65536, rewriteUrl: request => {
    const url=request.url??'/';
    if(url.startsWith('/api/'))return url.slice(4);
    // The English UI path shares a name with the legacy unprefixed API route.
    // Keep /api/library on the API router and dispatch the page to the web fallback.
    if(webRoot&&url.split('?')[0]==='/library')return '/__savedex_page/library'+url.slice('/library'.length);
    return url;
  }, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    let host: string;
    try { host = new URL(`http://${request.headers.host ?? 'localhost'}`).hostname; } catch { throw new HttpError(403, 'FORBIDDEN', 'Host no admitido'); }
    if (!['127.0.0.1', 'localhost'].includes(host)) throw new HttpError(403, 'FORBIDDEN', 'Host no admitido');
    const origin = request.headers.origin;
    if (origin) {
      const allowed = [`http://${request.headers.host}`, 'http://127.0.0.1:4200', 'http://localhost:4200'];
      if (!allowed.includes(origin)) throw new HttpError(403, 'FORBIDDEN', 'Origen no admitido');
      reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
    }
    if (request.method === 'OPTIONS') return reply.header('access-control-allow-methods', 'GET, POST, DELETE, PATCH, OPTIONS').header('access-control-allow-headers', 'Content-Type, Last-Event-ID').code(204).send();
  });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    if (error.validation || (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)) return reply.code(error.statusCode ?? 400).send({ error: { code: 'INVALID_REQUEST', message: 'Solicitud no válida' } });
    request.log.error(error);
    return reply.code(503).send({ error: { code: 'UNAVAILABLE', message: 'No se pudo completar la operación. Revisa el backend e inténtalo de nuevo.' } });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No se encontró el recurso' } }));
  app.get('/health', async () => ({ status: 'ok', app: 'savedex' }));
  if (runtime) {
    let closing = false;
    app.addHook('onSend', async (_request, reply, payload) => { if (closing) reply.header('connection', 'close'); return payload; });
    videoRoutes(app, runtime); queueRoutes(app, runtime); libraryRoutes(app, runtime); runRoutes(app, runtime);
    placeAgentRoutes(app,runtime);
    const hub = new StreamHub(runtime.events, heartbeatMs);
    hub.route(app);
    app.addHook('preClose', async () => { closing = true; runtime.beginClose(); hub.close(); });
    app.addHook('onClose', async () => { await runtime.close(); });
  }
  if(webRoot)webRoutes(app,webRoot);
  return app;
}
