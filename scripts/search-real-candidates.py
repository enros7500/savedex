"""Read-only public metadata discovery using the already installed extractor environment."""
import json
import sys
from pathlib import Path
import yt_dlp

query = sys.argv[1]
root = Path(__file__).resolve().parents[1]
options = {'quiet': True, 'no_warnings': True, 'extract_flat': True, 'skip_download': True,
           'cachedir': False, 'cookiefile': None, 'cookiesfrombrowser': None, 'proxy': '', 'socket_timeout': 20}
with yt_dlp.YoutubeDL(options) as client:
    result = client.extract_info('ytsearch10:' + query, download=False)
rows = [{'id': e.get('id'), 'url': e.get('url'), 'title': e.get('title'), 'duration': e.get('duration'),
         'description': e.get('description')} for e in result.get('entries', []) if e]
target = root / '.cache/delivery-7/search-metadata.json'
target.write_text(json.dumps({'query': query, 'results': rows}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(rows, ensure_ascii=True))
