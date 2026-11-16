export class HttpError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}
export function invalid(message = 'Solicitud no válida'): never { throw new HttpError(400, 'INVALID_REQUEST', message); }
export async function emptyActionBody(request: FastifyRequest): Promise<void> {
  const body = request.body;
  if (body === undefined || body === null || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)) return;
  invalid('Esta operación no admite campos en el cuerpo');
}
export function found<T>(read: () => T): T {
  try { return read(); } catch { throw new HttpError(404, 'NOT_FOUND', 'No se encontró el recurso'); }
}
export const idParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', pattern: '^[1-9][0-9]{0,14}$' } } };
export const emptyQuery = { type: 'object', additionalProperties: false, properties: {} };
import type { FastifyRequest } from 'fastify';
