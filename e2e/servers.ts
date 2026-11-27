import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import { createServer as createNetServer } from 'node:net';

/**
 * Servers a test owns and can switch off. Two WebKit facts make them necessary:
 * - `context.setOffline(true)` followed by a reload fails inside Playwright's WebKit ("internal error"), so the
 *   offline tests cut the network for real: they stop their own copy of the app server and reload.
 * - Requests from a page the service worker controls never reach `page.route` in WebKit, so a test that needs
 *   the service worker and a mocked account Worker talks to a real local HTTP mock instead.
 */
export interface OwnServer {
  origin: string;
  stop: () => Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const address = s.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      s.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(origin: string): Promise<void> {
  for (let i = 0; i < 150; i++) {
    try {
      await fetch(origin);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`server at ${origin} never came up`);
}

/**
 * A second `vite preview` of the e2e build (the one playwright.config.ts made), on its own port. `extraConnect`
 * is an http://127.0.0.1:<port> origin the page may call (a local mock Worker), added to connect-src.
 */
export async function startAppServer(extraConnect?: string): Promise<OwnServer> {
  const port = await freePort();
  const outDir = process.env.E2E_OUT ?? 'node_modules/.e2e-dist';
  const child = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, PREVIEW_EXTRA_CONNECT: extraConnect ?? '' },
  });
  const origin = `http://127.0.0.1:${port}`;
  await waitUntilUp(origin);
  return {
    origin,
    stop: async () => {
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      process.kill(-child.pid, 'SIGTERM'); // npx → node: stop the whole group
      await exited;
    },
  };
}

export interface MockRequest {
  method: string;
  path: string;
  authorization: string;
  body: string;
}

export interface MockReply {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

/** A plain HTTP server answering with `handle`, with the CORS headers the app's cross-site calls need. */
export async function startMockServer(handle: (request: MockRequest) => MockReply): Promise<OwnServer> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
      req.on('end', () => resolve(data));
    });
  const server = createServer((req, res) => {
    void readBody(req).then((body) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors).end();
        return;
      }
      const reply = handle({
        method: req.method ?? 'GET',
        path: new URL(req.url ?? '/', 'http://x').pathname,
        authorization: req.headers.authorization ?? '',
        body,
      });
      res.writeHead(reply.status, { ...cors, ...reply.headers }).end(reply.body ?? '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
