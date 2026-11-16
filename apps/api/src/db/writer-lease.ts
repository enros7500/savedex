import { createServer, type Server } from 'node:net';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

/** Process-lifetime ownership. Windows releases the named pipe after a crash. */
export class WriterLease {
  private constructor(private readonly server: Server) {}
  static async acquire(filename: string): Promise<WriterLease> {
    if (filename === ':memory:') throw new Error('El worker requiere una base persistente en disco');
    const resolved = path.resolve(filename);
    mkdirSync(path.dirname(resolved), { recursive: true });
    let canonical = existsSync(resolved) ? realpathSync.native(resolved) : path.join(realpathSync.native(path.dirname(resolved)), path.basename(resolved));
    if (process.platform === 'win32') canonical = canonical.toLowerCase();
    const digest = createHash('sha256').update(canonical).digest('hex');
    const server = createServer(socket => socket.destroy());
    await new Promise<void>((resolve, reject) => {
      const fail = (cause: Error) => reject(new Error('No se puede reservar la base: otra instancia escritora puede estar usándola', { cause }));
      server.once('error', fail);
      const listening = () => { server.removeListener('error', fail); resolve(); };
      if (process.platform === 'win32') server.listen({ path: `\\\\.\\pipe\\savedex-writer-${digest}`, exclusive: true }, listening);
      else server.listen({ host: '127.0.0.1', port: 15000 + Number.parseInt(digest.slice(0, 8), 16) % 45000, exclusive: true }, listening);
    });
    return new WriterLease(server);
  }
  async release(): Promise<void> {
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) => this.server.close(error => error ? reject(error) : resolve()));
  }
}
