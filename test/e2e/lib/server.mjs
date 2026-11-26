import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_ROOT_DIR = path.resolve(__dirname, '..', '..', '..');

function getFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function removeDirWithRetry(dirPath, retries = 8) {
  for (let i = 0; i < retries; i++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

export async function startAppServer({
  mode = 'dev',
  rootDir = DEFAULT_ROOT_DIR,
  host = '127.0.0.1',
} = {}) {
  const port = await getFreePort(host);
  const tmpBase = process.env.E2E_TMPDIR || os.tmpdir();
  fs.mkdirSync(tmpBase, { recursive: true });
  const cacheRoot = fs.mkdtempSync(path.join(tmpBase, 'wc3d-vite-'));
  const cacheDir = path.join(cacheRoot, 'cache');

  const { createServer, preview } = await import('vite');

  let server;
  let resolvedPort = port;

  if (mode === 'preview') {
    const distDir = path.join(rootDir, 'dist');
    if (!fs.existsSync(distDir)) {
      await removeDirWithRetry(cacheRoot);
      throw new Error(`Preview mode requires built dist/ directory at ${distDir}`);
    }
    server = await preview({
      root: rootDir,
      cacheDir,
      logLevel: 'silent',
      preview: {
        host,
        port,
        strictPort: true,
        open: false,
      },
    });
    const addr = server.httpServer?.address();
    if (addr && typeof addr === 'object' && addr.port) {
      resolvedPort = addr.port;
    }
  } else {
    server = await createServer({
      root: rootDir,
      cacheDir,
      logLevel: 'silent',
      server: {
        host,
        port,
        strictPort: true,
        open: false,
      },
    });
    await server.listen();
    const addr = server.httpServer?.address();
    if (addr && typeof addr === 'object' && addr.port) {
      resolvedPort = addr.port;
    }
  }

  const url = `http://${host}:${resolvedPort}`;
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;
    try {
      if (typeof server.close === 'function') {
        await server.close();
      } else if (server.httpServer && typeof server.httpServer.close === 'function') {
        await new Promise((resolve) => server.httpServer.close(() => resolve()));
      }
    } finally {
      await removeDirWithRetry(cacheRoot);
    }
  }

  return {
    url,
    port: resolvedPort,
    mode,
    cacheRoot,
    close,
  };
}
