import type { Platform } from '@savedex/contracts/api';
export function normalizeUrl(input: string): { url: string; platform: Platform; postId: string } {
  const fail = () => new Error('URL no admitida: se requiere un vídeo o publicación individual HTTPS de Instagram o YouTube');
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(input)) throw fail();
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw fail(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw fail();
  const host = url.hostname;
  if (['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(host)) {
    const match = /^\/(?:p|reel|reels)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    if (!match?.[1]) throw fail();
    return { url: `https://www.instagram.com/p/${match[1]}/`, platform: 'instagram', postId: match[1] };
  }
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host)) throw fail();
  let id: string | undefined;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  } else if (url.pathname === '/watch') {
    const ids = url.searchParams.getAll('v');
    if (ids.length === 1) id = ids[0];
  } else {
    id = /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw fail();
  return { url: `https://www.youtube.com/watch?v=${id}`, platform: 'youtube', postId: id };
}
