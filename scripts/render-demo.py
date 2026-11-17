"""Encode current demo browser captures as a README walkthrough (Pillow)."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
directory = root / '.cache/demo-ui/walkthrough'
manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
captures = manifest['frames']
assert captures, 'Run scripts/record-demo.mjs first'

def frame(file):
    with Image.open(file) as source:
        return source.convert('RGB').resize((1008, 700), Image.Resampling.LANCZOS).quantize(colors=128)

frames = [frame(root / 'assets/readme/explore.png')]
durations = [2200]
for index, capture in enumerate(captures):
    frames.append(frame(directory / capture['file']))
    following = captures[index + 1]['at'] if index + 1 < len(captures) else capture['at'] + 2200
    durations.append(max(100, round((following - capture['at']) / 10) * 10))
target = root / 'assets/readme/walkthrough.gif'
frames[0].save(target, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=2)
with Image.open(target) as animation:
    duration = 0
    for index in range(animation.n_frames):
        animation.seek(index)
        duration += animation.info['duration']
    report = {'width': animation.width, 'height': animation.height, 'frames': animation.n_frames,
              'duration_ms': duration, 'bytes': target.stat().st_size, 'simulation': True}
(directory / 'encoded.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
