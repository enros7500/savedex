import type { FastifyInstance } from 'fastify';
import type { ApiRuntime } from '../../runtime.js';
import type { LibraryFilters } from '@savedex/contracts/api';
import { invalid } from '../../http-errors.js';
export function libraryRoutes(app: FastifyInstance, runtime: ApiRuntime): void {
  app.get<{ Querystring: LibraryFilters }>('/library', { schema: { querystring: { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', enum: ['place', 'tool', 'recommendation', 'step', 'travel_option', 'product', 'custom'] },
    fromDay: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, toDay: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    text: { type: 'string', maxLength: 1000 },
  } } } }, request => {
    for (const day of [request.query.fromDay, request.query.toDay]) {
      if (day !== undefined && (!Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) invalid('Fecha de incorporación no válida');
    }
    if (request.query.fromDay && request.query.toDay && request.query.fromDay > request.query.toDay) invalid('Intervalo de fechas no válido');
    return runtime.library(request.query);
  });
}
