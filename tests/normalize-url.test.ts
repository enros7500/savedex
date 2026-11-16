import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../apps/api/src/features/videos/normalize-url.js';

const youtube = 'https://www.youtube.com/watch?v=AbC_123-xyz';
const instagram = 'https://www.instagram.com/p/AbC_123-xyz/';
for (const input of [
  youtube + '&t=40&list=PL123&utm_source=test#x',
  'https://youtu.be/AbC_123-xyz?si=tracking',
  'https://www.youtu.be/AbC_123-xyz/',
  'https://m.youtube.com/shorts/AbC_123-xyz/?feature=share',
  ' https://YOUTUBE.COM:443/watch?v=AbC_123-xyz ',
  'https://youtube.com/watch?v=AbC_123-xy%7A',
]) test(`deduplica alias de YouTube: ${input}`, () => {
  assert.deepEqual(normalizeUrl(input), { url: youtube, platform: 'youtube', postId: 'AbC_123-xyz' });
});
for (const input of [
  instagram + '?igsh=tracking',
  'https://instagram.com/reel/AbC_123-xyz/',
  'https://m.instagram.com/reels/AbC_123-xyz?utm_medium=test',
]) test(`deduplica alias de Instagram: ${input}`, () => {
  assert.deepEqual(normalizeUrl(input), { url: instagram, platform: 'instagram', postId: 'AbC_123-xyz' });
});
test('conserva IDs distintos y mayúsculas, sin colapsar plataformas', () => {
  const urls = [youtube, youtube.replace('AbC_', 'abc_'), youtube.replace('xyz', 'xyZ'), instagram].map(u => normalizeUrl(u).url);
  assert.equal(new Set(urls).size, 4);
});
for (const input of [
  'https://youtube.com.evil.test/watch?v=AbC_123-xyz',
  'https://evil.test/youtube.com/watch?v=AbC_123-xyz',
  'https://user:secret@youtube.com/watch?v=AbC_123-xyz',
  'http://youtube.com/watch?v=AbC_123-xyz',
  'https://youtube.com:444/watch?v=AbC_123-xyz',
  'https://127.0.0.1/watch?v=AbC_123-xyz',
  'https://youtube.com/playlist?list=PL123',
  'https://youtube.com/watch?v=AbC_123-xyz&v=Other123456',
  'https://youtube.com/embed/AbC_123-xyz',
  'https://instagram.com/some-user/',
  'https://instagram.com/p/too-short/',
  'https://youtu.be/AbC_123-xyz/extra',
  'https://you\ntube.com/watch?v=AbC_123-xyz',
  'https://youtube.com\\@evil.test/watch?v=AbC_123-xyz',
  'not a URL', '',
]) test(`rechaza URL ambigua o no admitida: ${JSON.stringify(input)}`, () => {
  assert.throws(() => normalizeUrl(input), /URL|vídeo|publicación|HTTPS/i);
});
