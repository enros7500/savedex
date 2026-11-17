import { normalizeUrl } from './normalize-url.js';

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code: string) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity;
    const point = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

function instagramTitle(html: string): string | null {
  const values = new Map<string, string>();
  // Parse quoted attributes independently: content may precede property and contain '>'.
  const head = html.split(/<\/head\s*>/i)[0] ?? html;
  for (const tag of head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = new Map([...tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(a => [a[1]!.toLowerCase(), a[2] ?? a[3] ?? '']));
    const key = (attrs.get('property') ?? attrs.get('name'))?.toLowerCase();
    if (key && attrs.has('content')) values.set(key, decodeEntities(attrs.get('content')!));
  }
  for (const key of ['og:title', 'og:description']) {
    const title = values.get(key)?.trim();
    if (title && !/^(?:Instagram|Login\s*[•·|–-]?\s*Instagram|Log in.*|Sign up.*|Inicia sesi[oó]n.*)$/i.test(title)) return title;
  }
  return null;
}

/** Optional public metadata. Never downloads media or affects extraction outcomes. */
export async function fetchVideoTitle(input: string, request: typeof fetch = fetch): Promise<string | null> {
  try {
    const video = normalizeUrl(input);
    const endpoint = new URL(video.platform === 'youtube' ? 'https://www.youtube.com/oembed' : video.url);
    if (video.platform === 'youtube') {
      endpoint.searchParams.set('url', video.url);
      endpoint.searchParams.set('format', 'json');
    }
    const limit = video.platform === 'youtube' ? 65536 : 524288;
    const response = await request(endpoint, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (!response.ok || video.platform==='youtube' && Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); return null; }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        chunks.push(value);
        if(video.platform==='instagram'){
          const headEnd=Buffer.concat(chunks).toString('utf8').search(/<\/head\s*>/i);
          if(headEnd>=0 && headEnd<=limit){await reader.cancel();break;}
        }
        if (size > limit) { await reader.cancel(); return null; }
      }
    } finally { reader.releaseLock(); }
    const body = Buffer.concat(chunks).toString('utf8');
    const data: unknown = video.platform === 'youtube' ? JSON.parse(body) : { title: instagramTitle(body) };
    if (!data || typeof data !== 'object' || !('title' in data) || typeof data.title !== 'string') return null;
    const clean = data.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    const title = video.platform==='instagram'?clean.slice(0,1000):clean;
    return title && title.length <= 1000 ? title : null;
  } catch { return null; }
}
