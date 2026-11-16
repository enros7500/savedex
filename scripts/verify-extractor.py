"""Read-only checks of the sibling extractor; all artifacts remain in Savedex."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CHILD = ROOT.parent / 'savedex-extractor'
OUT = ROOT / '.cache' / 'extractor-verification'
OUT.mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUTF8': '1'}
exe = CHILD / 'work/asr-venv/Scripts/savedex-extractor.exe'
python = CHILD / 'work/asr-venv/Scripts/python.exe'

def fingerprint():
    files = sorted((CHILD / 'src').rglob('*.py')) + sorted((CHILD / 'src').rglob('*.json')) + [CHILD / 'pyproject.toml']
    return {str(p.relative_to(CHILD)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}

before = fingerprint()
report = {'source_sha256': before, 'checks': []}
report['executable_sha256'] = hashlib.sha256(exe.read_bytes()).hexdigest()
for name in ['request', 'result']:
    assert (ROOT / f'packages/contracts/schemas/{name}.json').read_bytes() == (CHILD / f'src/savedex_extractor/schemas/{name}.json').read_bytes(), f'{name} schema drift'

def run(label, args, expected, value=None):
    response = subprocess.run([str(exe), *args], input=value, capture_output=True, encoding='utf-8', timeout=30, env=env, shell=False, cwd=ROOT)
    (OUT / f'{label}.stdout.json').write_text(response.stdout, encoding='utf-8')
    (OUT / f'{label}.stderr.jsonl').write_text(response.stderr, encoding='utf-8')
    result = json.loads(response.stdout)
    assert response.returncode == expected, (label, response.returncode)
    report['checks'].append({'name': label, 'exit_code': response.returncode, 'status': result.get('status'), 'stdout_single_json': True})
    return result

version = run('version', ['--version', '--json'], 0)
assert version['supported_content_schema_versions'] == ['3.0.0']
report['version'] = version
for name, code in [('success', 0), ('partial', 2), ('error', 65)]:
    # Summary reads fixtures and uses the real CLI emit/validation/exit mapping; no media extraction.
    response = subprocess.run([str(exe), 'summary', '--result', str(ROOT / f'tests/fixtures/extractor/{name}.json'), '--progress', 'jsonl'], capture_output=True, encoding='utf-8', timeout=30, env=env, shell=False)
    assert response.returncode == code, (name, response.returncode, response.stderr)
    events = [json.loads(line) for line in response.stderr.splitlines()]
    assert [e['step'] for e in events] == ['start', 'finish']
    assert events[-1]['status'] == name and events[-1]['exit_code'] == code
    report['checks'].append({'name': f'summary-{name}', 'exit_code': code, 'steps': ['start', 'finish'], 'note': 'saved-result rendering, not extraction'})

result = run('invalid-request', ['extract', '--request', '-', '--progress', 'jsonl', '--exhaustive', '--work-dir', str(OUT / 'jobs')], 64, '{}')
assert result['status'] == 'error'
events = [json.loads(line) for line in (OUT / 'invalid-request.stderr.jsonl').read_text(encoding='utf-8').splitlines()]
assert [e['step'] for e in events] == ['start', 'finish']

validation = subprocess.run([str(python), '-B', '-c', '''
import json,sys
from pathlib import Path
from savedex_extractor.contracts import validate_result,structural
from savedex_extractor.progress import step
root=Path(sys.argv[1])
structural(json.loads((root/'request.json').read_text(encoding='utf-8')),'request.json')
for name in ['success','partial','error','empty-success']:
    validate_result(json.loads((root/(name+'.json')).read_text(encoding='utf-8')))
print('request + 4 results: structural and semantic validation passed')
for name in ['start','description','ocr','ocr','validation']:
    step(name)
step('finish',status='partial',exit_code=2)
''', str(ROOT / 'tests/fixtures/extractor')], capture_output=True, encoding='utf-8', timeout=30, env=env, shell=False)
assert validation.returncode == 0, validation.stderr
report['semantic_validation'] = validation.stdout.strip()
observed = [json.loads(line) for line in validation.stderr.splitlines()]
assert [e['step'] for e in observed] == ['start', 'description', 'ocr', 'ocr', 'validation', 'finish']
report['progress_emitter_check'] = {'steps': [e['step'] for e in observed], 'note': 'direct progress.step calls; not a media pipeline run'}

doctor = subprocess.run([str(exe), 'doctor', '--json', '--model-dir', str(CHILD / 'work/models/faster-whisper-medium'), '--work-dir', str(OUT / 'jobs')], capture_output=True, encoding='utf-8', timeout=30, env=env, shell=False)
assert doctor.returncode in (0, 69), doctor.stderr
report['doctor'] = {'exit_code': doctor.returncode, **json.loads(doctor.stdout)}
assert before == fingerprint(), 'Extractor source changed during verification'
report['extractor_source_unchanged'] = True
(ROOT / 'docs' / 'extractor-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k != 'source_sha256'}, ensure_ascii=False, indent=2))
