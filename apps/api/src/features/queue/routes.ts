import type { FastifyInstance } from 'fastify';
import type { ApiRuntime } from '../../runtime.js';
import { HttpError, found, idParams, emptyQuery, emptyActionBody } from '../../http-errors.js';
export function queueRoutes(app: FastifyInstance, runtime: ApiRuntime): void {
  app.get('/queue', { schema: { querystring: emptyQuery } }, () => runtime.snapshot());
  app.post('/queue/start', { preValidation: emptyActionBody, schema: { querystring: emptyQuery } }, () => {
    if (runtime.queue.getSnapshot().fault) throw new HttpError(409, 'QUEUE_FAULT', 'La cola requiere revisar el backend antes de continuar');
    runtime.queue.startQueue(); return runtime.snapshot();
  });
  app.post('/queue/stop', { preValidation: emptyActionBody, schema: { querystring: emptyQuery } }, () => { runtime.queue.stopQueue(); return runtime.snapshot(); });
  app.delete<{ Params: { id: string } }>('/queue/entries/:id', { preValidation: emptyActionBody, schema: { params: idParams, querystring: emptyQuery } }, request => {
    const id = Number(request.params.id), current = found(() => runtime.queue.videos.getEntry(id));
    if (current.state !== 'pending') throw new HttpError(409, 'CONFLICT', 'Solo puede quitarse una tarea pendiente');
    const entry = runtime.queue.mutate(() => runtime.queue.videos.removePending(id));
    return { ...runtime.events.stamp(), entry };
  });
  app.post<{ Params: { id: string } }>('/batches/:id/dismiss', { preValidation: emptyActionBody, schema: { params: idParams, querystring: emptyQuery } }, request => {
    const id = Number(request.params.id);
    const row = runtime.queue.db.prepare<[number], { state: string }>('SELECT state FROM batches WHERE id=?').get(id);
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'No se encontró el lote');
    if (row.state !== 'completed') throw new HttpError(409, 'CONFLICT', 'El lote todavía no ha terminado');
    runtime.queue.dismissSummary(id); return runtime.snapshot();
  });
}
