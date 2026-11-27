#!/usr/bin/env python3
"""Uploads dist/ to the app Worker (only changed files). Usage: UPLOAD_KEY=... python3 deploy/app/upload.py [base_url]"""
import base64, hashlib, json, mimetypes, os, sys, urllib.request, time

BASE = sys.argv[1] if len(sys.argv) > 1 else 'https://app.getcoachly.workers.dev'
KEY = os.environ['UPLOAD_KEY']
DIST = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')

# Release guard: a build without the account server URL can never sign anyone in. Refuse to ship it.

def _bundle_text():
    out = []
    for name in os.listdir(os.path.join(DIST, 'assets')):
        if name.endswith('.js'):
            with open(os.path.join(DIST, 'assets', name), encoding='utf-8', errors='ignore') as f:
                out.append(f.read())
    return '\n'.join(out)
_text = _bundle_text()
if 'api.getcoachly.' not in _text:
    sys.exit('refusing to upload: dist/ was built without VITE_WORKER_URL (see .env.production)')
TYPES = {'.webmanifest': 'application/manifest+json', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
         '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
         '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8'}

def call(path, data=None):
    req = urllib.request.Request(BASE + path, data=data, method='POST' if data else 'GET',
                                 headers={'X-Upload-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'pt-coach-deploy'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # retry transient failures
            if attempt == 4: raise
            time.sleep(2 * (attempt + 1))

current = call('/__deploy/hashes')
batch, size, sent = [], 0, 0
def flush():
    global batch, size, sent
    if batch:
        call('/__deploy/files', json.dumps(batch).encode())
        sent += len(batch); print(f'uploaded {sent}', flush=True)
    batch, size = [], 0

# Entry points go last: a phone that checks for an update mid-deploy must never get a new sw.js/index.html
# whose hashed assets are not uploaded yet (the service worker install would fail on a 404).
ENTRY = ['/manifest.webmanifest', '/push-sw.js', '/registerSW.js', '/index.html', '/sw.js']
paths = []
for root, _, files in os.walk(DIST):
    for name in sorted(files):
        full = os.path.join(root, name)
        paths.append(('/' + os.path.relpath(full, DIST).replace(os.sep, '/'), full, name))
paths.sort(key=lambda p: ENTRY.index(p[0]) + 1 if p[0] in ENTRY else 0)

for rel, full, name in paths:
    if rel == '/_headers': continue
    data = open(full, 'rb').read()
    h = hashlib.sha256(data).hexdigest()[:32]
    if current.get(rel) == h: continue
    ext = os.path.splitext(name)[1].lower()
    body = base64.b64encode(data).decode()
    if size + len(body) > 3_000_000: flush()
    batch.append({'path': rel, 'type': TYPES.get(ext) or mimetypes.guess_type(name)[0] or 'application/octet-stream', 'body': body, 'hash': h})
    size += len(body)
flush()
print(f'done: {sent} changed file(s)')
