import type { FastifyInstance, FastifyReply } from 'fastify';
import type { EventStore } from './store.js';
import type { StreamFrame } from '@savedex/contracts/events';
import { HttpError } from '../../http-errors.js';
export class StreamHub {
  private readonly clients = new Set<() => void>();
  constructor(private readonly store: EventStore, private readonly heartbeatMs = 15000) {
    if (!Number.isInteger(heartbeatMs) || heartbeatMs < 1) throw new Error('Intervalo de heartbeat inválido');
  }
  route(app: FastifyInstance): void {
    app.get('/events', (request, reply) => {
      const cursor = request.headers['last-event-id'];
      if (Array.isArray(cursor) || (cursor?.length ?? 0) > 256) throw new HttpError(400, 'INVALID_REQUEST', 'Cursor no válido');
      this.open(reply, cursor);
    });
  }
  close(): void { for (const close of [...this.clients]) close(); }
  private open(reply: FastifyReply, cursor?: string): void {
    this.store.stamp();
    reply.hijack();
    // Preserve headers already applied by the origin guard.
    for (const [name, value] of Object.entries(reply.getHeaders())) if (value !== undefined) reply.raw.setHeader(name, value);
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    let closed = false, blocked = false, unsubscribe = () => {};
    let timer: ReturnType<typeof setInterval> | undefined;
    let pressureTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingReset: Extract<StreamFrame, { type: 'reset' }> | null = null;
    const close = () => {
      if (closed) return;
      closed = true; if (timer) clearInterval(timer); if (pressureTimer) clearTimeout(pressureTimer);
      reply.raw.removeListener('drain', drain); unsubscribe(); this.clients.delete(close);
      reply.raw.destroy();
    };
    const write = (text: string) => {
      if (!reply.raw.write(text)) {
        blocked = true;
        pressureTimer = setTimeout(close, 15000); pressureTimer.unref();
      }
    };
    const drain = () => {
      blocked = false; if (pressureTimer) clearTimeout(pressureTimer); pressureTimer = undefined;
      const reset = pendingReset; pendingReset = null;
      if (reset) send(reset);
    };
    this.clients.add(close); reply.raw.once('close', close);
    reply.raw.on('drain', drain);
    const send = (frame: StreamFrame) => {
      if (closed) return;
      const sourceStamp = frame.type === 'change' ? frame.snapshot : frame;
      if (blocked) {
        pendingReset = { type: 'reset', streamId: sourceStamp.streamId, revision: sourceStamp.revision, reason: frame.type === 'reset' ? frame.reason : 'slow_client' };
        return;
      }
      let value = frame;
      const maxFrame = Math.min(256 * 1024, Math.max(1024, Math.floor(reply.raw.writableHighWaterMark / 2)));
      if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxFrame) value = { type: 'reset', ...this.store.stamp(), reason: 'payload_limit' };
      const stamp = value.type === 'change' ? value.snapshot : value;
      const id = value.type === 'ready' ? '' : `id: ${stamp.streamId}:${stamp.revision}\n`;
      write(`${id}event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`);
    };
    reply.raw.write('retry: 1000\n\n');
    unsubscribe = this.store.subscribe(send, cursor);
    if (closed) { unsubscribe(); return; }
    timer = setInterval(() => { if (!blocked) write(': heartbeat\n\n'); }, this.heartbeatMs);
    timer.unref();
  }
}
