import type { FastifyInstance } from 'fastify';
import type { ApiRuntime } from '../../runtime.js';
import type { ManualReview } from '@savedex/contracts/api';
import { found, HttpError, idParams, emptyQuery } from '../../http-errors.js';
import { publicRun } from '../../http-dto.js';
export function runRoutes(app: FastifyInstance, runtime: ApiRuntime): void {
  app.get<{ Params: { id: string } }>('/videos/:id/runs', { schema: { params: idParams, querystring: emptyQuery } }, request => {
    const id = Number(request.params.id); found(() => runtime.queue.videos.getVideo(id)); return runtime.history(id);
  });
  app.patch<{ Params: { id: string }; Body: { review: ManualReview } }>('/runs/:id/review', { schema: { params: idParams, querystring: emptyQuery,
    body: { type: 'object', additionalProperties: false, required: ['review'], properties: { review: { type: 'string', enum: ['none', 'accepted', 'review'] } } },
  } }, request => {
    const id = Number(request.params.id), current = found(() => runtime.queue.runs.getRun(id));
    if (current.state !== 'success' && current.state !== 'partial') throw new HttpError(409, 'CONFLICT', 'Solo puede revisarse una extracción válida terminada');
    const run = runtime.queue.mutate(() => runtime.queue.runs.setReview(id, request.body.review));
    return { ...runtime.events.stamp(), run: publicRun(run) };
  });
  app.get<{ Params: { id: string } }>('/runs/:id/result', { schema: { params: idParams, querystring: emptyQuery } }, (request, reply) => {
    const id = Number(request.params.id), run = found(() => runtime.queue.runs.getRun(id));
    if (run.resultJson === null) throw new HttpError(404, 'NOT_FOUND', 'Esta ejecución no tiene resultado JSON');
    return reply.header('content-type', 'application/json; charset=utf-8').header('content-disposition', `attachment; filename="savedex-run-${id}.json"`).send(run.resultJson);
  });
}
