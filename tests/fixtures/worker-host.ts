import { QueueService } from '../../apps/api/src/features/queue/service.js';
const filename = process.argv[2];
if (!filename) throw new Error('Database path required');
const service = await QueueService.open(filename, {
  async run() { process.send?.({ event: 'active' }); return new Promise(() => {}); },
});
service.videos.addVideo('https://youtu.be/AbC_123-xyz');
service.startQueue();
