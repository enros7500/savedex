import { normalizeUrl } from './normalize-url.js';

/** Optional public metadata. Never downloads media or affects extraction outcomes. */
export async function fetchVideoTitle(input: string, request: typeof fetch = fetch): Promise<string | null> {
  try {
    const video = normalizeUrl(input);
    if (video.platform !== 'youtube') return null;
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', video.url);
    endpoint.searchParams.set('format', 'json');
    const response = await request(endpoint, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (!response.ok || Number(response.headers.get('content-length')) > 65536) { await response.body?.cancel(); return null; }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); return null; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || !('title' in data) || typeof data.title !== 'string') return null;
    const title = data.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return title && title.length <= 1000 ? title : null;
  } catch { return null; }
}
