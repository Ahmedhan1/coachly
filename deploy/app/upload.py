#!/usr/bin/env python3
"""Uploads dist/ to the app Worker (only changed files). Usage: UPLOAD_KEY=... python3 deploy/app/upload.py [base_url]"""
import base64, hashlib, json, mimetypes, os, sys, urllib.request, time

BASE = sys.argv[1] if len(sys.argv) > 1 else 'https://pt-coach.nexus-ahmed.workers.dev'
KEY = os.environ['UPLOAD_KEY']
DIST = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
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

for root, _, files in os.walk(DIST):
    for name in sorted(files):
        full = os.path.join(root, name)
        rel = '/' + os.path.relpath(full, DIST).replace(os.sep, '/')
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
