import type { FastifyInstance } from 'fastify';
import type { ApiRuntime } from '../../runtime.js';
import { normalizeUrl } from './normalize-url.js';
import { found, idParams, invalid, emptyQuery, emptyActionBody } from '../../http-errors.js';
export function videoRoutes(app: FastifyInstance, runtime: ApiRuntime): void {
  app.post<{ Body: { url: string } }>('/videos', { schema: { querystring: emptyQuery, body: { type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string', minLength: 1, maxLength: 2048 } } } } }, (request, reply) => {
    try { normalizeUrl(request.body.url); } catch { invalid('URL no admitida'); }
    const result = runtime.queue.mutate(() => runtime.queue.videos.addVideo(request.body.url));
    return reply.code(result.created ? 201 : 200).send({ ...runtime.events.stamp(), ...result });
  });
  for (const [suffix, mode] of [['retry', 'normal'], ['exhaustive', 'exhaustive']] as const) {
    app.post<{ Params: { id: string } }>(`/videos/:id/${suffix}`, { preValidation: emptyActionBody, schema: { params: idParams, querystring: emptyQuery } }, request => {
      const id = Number(request.params.id); found(() => runtime.queue.videos.getVideo(id));
      const entry = runtime.queue.mutate(() => runtime.queue.videos.enqueue(id, mode));
      return { ...runtime.events.stamp(), entry };
    });
  }
}
