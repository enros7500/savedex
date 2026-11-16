"""Assemble actual UI screenshots into a labelled demonstration GIF."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
directory = root / '.cache/delivery-7/demo'
manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
frames = [Image.open(directory / f'{i:03}.png').convert('RGB') for i in range(manifest['frames'])]
target = root / 'docs/demo/savedex.gif'
target.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(target, save_all=True, append_images=frames[1:], duration=500, loop=0, optimize=False)
with Image.open(target) as gif:
    duration = 0
    for i in range(gif.n_frames):
        gif.seek(i)
        duration += gif.info['duration']
    assert duration == 15000, duration
    report = {**manifest, 'encoded_frames': gif.n_frames, 'encoded_duration_ms': duration, 'width': gif.width, 'height': gif.height}
(root / 'docs/delivery-7-demo.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
