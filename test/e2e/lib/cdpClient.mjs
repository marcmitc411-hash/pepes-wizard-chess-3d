import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    : null,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChromeExecutable() {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  throw new Error(
    `Could not locate Chrome executable. Checked: ${CHROME_CANDIDATES.join(', ')}`
  );
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDirWithRetry(dirPath, retries = 12) {
  for (let i = 0; i < retries; i++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch {
      await sleep(150);
    }
  }
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      // ignore
    }
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
}

const KEY_MAP = {
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  ' ': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
};

function resolveKeyDef(key) {
  if (KEY_MAP[key]) return KEY_MAP[key];
  if (key.length === 1) {
    const upper = key.toUpperCase();
    const code = /[A-Z]/.test(upper)
      ? `Key${upper}`
      : /[0-9]/.test(upper)
        ? `Digit${upper}`
        : key;
    return {
      key,
      code,
      keyCode: upper.charCodeAt(0),
      text: key,
    };
  }
  return { key, code: key, keyCode: 0 };
}

function formatRemoteObject(arg) {
  if (!arg) return '';
  if (arg.type === 'string' || arg.type === 'number' || arg.type === 'boolean') {
    return String(arg.value);
  }
  if (arg.description) return arg.description;
  if (arg.value !== undefined) {
    try {
      return JSON.stringify(arg.value);
    } catch {
      return String(arg.value);
    }
  }
  return arg.type || '';
}

export class CdpPage {
  constructor(browser, targetId, sessionId, browserContextId = null) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.browserContextId = browserContextId;
    this.closed = false;

    this.consoleErrors = [];
    this.pageErrors = [];
    this.httpErrors = [];
    this.failedRequests = [];
    this._requestsById = new Map();
    this._eventListeners = new Map();

    this._unsubscribe = this.browser._subscribeSession(this.sessionId, (method, params) => {
      this._handleEvent(method, params);
    });
  }

  async _init({ viewport = { width: 1280, height: 800 } } = {}) {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    await this.send('Network.enable');
    await this.send('Log.enable');

    await this.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
            configurable: true
          });
        } catch (e) {}
      `,
    });

    if (viewport && (viewport.width !== 1280 || viewport.height !== 800)) {
      await this.setViewport(viewport.width, viewport.height);
    }
  }

  send(method, params = {}, timeoutMs = 30000) {
    return this.browser._send(method, params, this.sessionId, timeoutMs);
  }

  on(method, fn) {
    if (!this._eventListeners.has(method)) {
      this._eventListeners.set(method, new Set());
    }
    this._eventListeners.get(method).add(fn);
    return () => this._eventListeners.get(method)?.delete(fn);
  }

  _handleEvent(method, params) {
    if (method === 'Runtime.consoleAPICalled' && params?.type === 'error') {
      const msg = (params.args || []).map(formatRemoteObject).join(' ').trim();
      this.consoleErrors.push(msg || 'console.error');
    } else if (method === 'Runtime.exceptionThrown') {
      const details = params?.exceptionDetails;
      const msg =
        details?.exception?.description ||
        details?.text ||
        'Uncaught page exception';
      this.pageErrors.push(msg);
    } else if (method === 'Log.entryAdded' && params?.entry?.level === 'error') {
      if (params.entry.source !== 'network') {
        this.consoleErrors.push(`[Log:${params.entry.source}] ${params.entry.text}`);
      }
    } else if (method === 'Network.requestWillBeSent') {
      this._requestsById.set(params.requestId, {
        url: params.request?.url || '',
        method: params.request?.method || 'GET',
      });
    } else if (method === 'Network.responseReceived') {
      const status = params.response?.status;
      if (typeof status === 'number' && status >= 400) {
        this.httpErrors.push({
          url: params.response?.url || '',
          status,
          statusText: params.response?.statusText || '',
        });
      }
    } else if (method === 'Network.loadingFailed') {
      if (!params.canceled) {
        const req = this._requestsById.get(params.requestId);
        this.failedRequests.push({
          url: req?.url || '',
          errorText: params.errorText || 'Network.loadingFailed',
        });
      }
    }

    const listeners = this._eventListeners.get(method);
    if (listeners) {
      for (const fn of listeners) {
        try {
          fn(params);
        } catch {
          // ignore listener errors
        }
      }
    }
  }

  clearLogs() {
    this.consoleErrors.length = 0;
    this.pageErrors.length = 0;
    this.httpErrors.length = 0;
    this.failedRequests.length = 0;
  }

  getLogSummary() {
    return {
      consoleErrors: [...this.consoleErrors],
      pageErrors: [...this.pageErrors],
      httpErrors: [...this.httpErrors],
      failedRequests: [...this.failedRequests],
    };
  }

  assertCleanLogs({ allowHttpStatuses = [], ignoreConsolePatterns = [], ignoreFavicon404 = true } = {}) {
    const filteredConsole = this.consoleErrors.filter(
      (msg) => !ignoreConsolePatterns.some((re) => re.test(msg))
    );
    const filteredHttp = this.httpErrors.filter((e) => {
      if (allowHttpStatuses.includes(e.status)) return false;
      if (ignoreFavicon404 && e.status === 404 && /\/favicon\.ico(\?.*)?$/.test(e.url)) return false;
      return true;
    });
    if (
      filteredConsole.length > 0 ||
      this.pageErrors.length > 0 ||
      filteredHttp.length > 0 ||
      this.failedRequests.length > 0
    ) {
      throw new Error(
        `Runtime/Network errors detected:\n` +
          `  consoleErrors: ${JSON.stringify(filteredConsole)}\n` +
          `  pageErrors: ${JSON.stringify(this.pageErrors)}\n` +
          `  httpErrors: ${JSON.stringify(filteredHttp)}\n` +
          `  failedRequests: ${JSON.stringify(this.failedRequests)}`
      );
    }
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768,
    });
  }

  async _awaitLoadEvent(actionPromise, timeoutMs = 60000) {
    let timer;
    let off;
    const loaded = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        off?.();
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for Page.loadEventFired`));
      }, timeoutMs);
      off = this.on('Page.loadEventFired', () => {
        clearTimeout(timer);
        off?.();
        resolve();
      });
    });

    try {
      await actionPromise;
      await loaded;
    } catch (err) {
      clearTimeout(timer);
      off?.();
      throw err;
    }
  }

  async goto(url, { timeoutMs = 60000 } = {}) {
    await this._awaitLoadEvent(this.send('Page.navigate', { url }, timeoutMs), timeoutMs);
  }

  async reload({ timeoutMs = 60000 } = {}) {
    await this._awaitLoadEvent(this.send('Page.reload', { ignoreCache: false }, timeoutMs), timeoutMs);
  }

  async bringToFront() {
    await this.send('Page.bringToFront');
  }

  async evaluate(fnOrExpr, ...args) {
    const expression =
      typeof fnOrExpr === 'function'
        ? `(${fnOrExpr.toString()})(...${JSON.stringify(args)})`
        : String(fnOrExpr);
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res?.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'Evaluation failed';
      throw new Error(`Page evaluation error: ${desc}`);
    }
    return res?.result?.value;
  }

  async waitFor(fn, opts = {}, ...args) {
    const {
      timeoutMs = 15000,
      intervalMs = 50,
      message = 'waitFor condition timed out',
    } = opts;
    const deadline = Date.now() + timeoutMs;
    let lastErr = null;
    while (Date.now() < deadline) {
      try {
        const val = await this.evaluate(fn, ...args);
        if (val) return val;
      } catch (err) {
        lastErr = err;
      }
      await sleep(intervalMs);
    }
    throw new Error(
      lastErr ? `${message} (last error: ${lastErr.message})` : message
    );
  }

  async waitForSelector(selector, { timeoutMs = 15000, visible = true } = {}) {
    return this.waitFor(
      (sel, checkVisible) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        if (!checkVisible) return true;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0
        );
      },
      {
        timeoutMs,
        message: `Timed out waiting for selector "${selector}" (visible=${visible})`,
      },
      selector,
      visible
    );
  }

  async getSelectorCenter(selector) {
    const rect = await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }, selector);
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Selector "${selector}" not visible or zero-sized`);
    }
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      rect,
    };
  }

  async clickAt(x, y, { button = 'left', clickCount = 1, holdMs = 16 } = {}) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button,
      clickCount,
      buttons: button === 'left' ? 1 : 2,
    });
    if (holdMs > 0) await sleep(holdMs);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button,
      clickCount,
      buttons: 0,
    });
  }

  async hoverAt(x, y) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
    });
  }

  async hoverSelector(selector, { timeoutMs = 15000 } = {}) {
    await this.waitForSelector(selector, { timeoutMs, visible: true });
    const { x, y } = await this.getSelectorCenter(selector);
    await this.hoverAt(x, y);
  }

  async clickSelector(selector, { timeoutMs = 15000, visible = true } = {}) {
    await this.waitForSelector(selector, { timeoutMs, visible });
    const { x, y } = await this.getSelectorCenter(selector);
    await this.clickAt(x, y);
  }

  async typeText(selector, text, { clear = true, timeoutMs = 15000 } = {}) {
    await this.waitForSelector(selector, { timeoutMs, visible: true });
    await this.clickSelector(selector, { timeoutMs, visible: true });
    if (clear) {
      await this.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, '');
        else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, selector);
    }
    if (text) {
      await this.send('Input.insertText', { text: String(text) });
    }
  }

  async setRangeSlider(selector, value, { timeoutMs = 15000 } = {}) {
    await this.waitForSelector(selector, { timeoutMs, visible: true });
    await this.evaluate(
      (sel, val) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`Slider not found: ${sel}`);
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )?.set;
        if (setter) setter.call(el, String(val));
        else el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      selector,
      value
    );
  }

  async pressKey(key) {
    const def = resolveKeyDef(key);
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.keyCode,
      nativeVirtualKeyCode: def.keyCode,
      ...(def.text ? { text: def.text, unmodifiedText: def.text } : {}),
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.keyCode,
      nativeVirtualKeyCode: def.keyCode,
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this._unsubscribe?.();
    try {
      await this.browser._send('Target.closeTarget', { targetId: this.targetId });
    } catch {
      // ignore if already closed
    }
    if (this.browserContextId) {
      try {
        await this.browser._send('Target.disposeBrowserContext', {
          browserContextId: this.browserContextId,
        });
      } catch {
        // ignore
      }
    }
  }
}

export class CdpBrowser {
  constructor(proc, ws, userDataDir) {
    this.proc = proc;
    this.ws = ws;
    this.userDataDir = userDataDir;
    this.closed = false;
    this._nextId = 1;
    this._pending = new Map();
    this._sessionHandlers = new Map();
    this._pages = new Set();

    this.ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(typeof evt.data === 'string' ? evt.data : String(evt.data));
      } catch {
        return;
      }
      if (msg.id) {
        const pending = this._pending.get(msg.id);
        if (pending) {
          this._pending.delete(msg.id);
          clearTimeout(pending.timer);
          if (msg.error) {
            pending.reject(
              new Error(`CDP ${pending.method} failed: ${msg.error.message || JSON.stringify(msg.error)}`)
            );
          } else {
            pending.resolve(msg.result);
          }
        }
        return;
      }
      if (msg.method && msg.sessionId) {
        const handlers = this._sessionHandlers.get(msg.sessionId);
        if (handlers) {
          for (const h of handlers) h(msg.method, msg.params);
        }
      }
    });

    this._exitHandler = () => {
      killProcessTree(this.proc?.pid);
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch {
        // best-effort sync exit cleanup
      }
    };
    process.once('exit', this._exitHandler);
  }

  _subscribeSession(sessionId, fn) {
    if (!this._sessionHandlers.has(sessionId)) {
      this._sessionHandlers.set(sessionId, new Set());
    }
    this._sessionHandlers.get(sessionId).add(fn);
    return () => this._sessionHandlers.get(sessionId)?.delete(fn);
  }

  _send(method, params = {}, sessionId = null, timeoutMs = 30000) {
    if (this.closed) {
      return Promise.reject(new Error(`CDP browser closed before ${method}`));
    }
    const id = this._nextId++;
    const payload = sessionId
      ? { id, method, params, sessionId }
      : { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this._pending.set(id, { resolve, reject, method, timer });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async newPage({ isolated = false, viewport = { width: 1280, height: 800 } } = {}) {
    let browserContextId = null;
    if (isolated) {
      const ctx = await this._send('Target.createBrowserContext');
      browserContextId = ctx.browserContextId;
    }
    const { targetId } = await this._send('Target.createTarget', {
      url: 'about:blank',
      ...(browserContextId ? { browserContextId } : {}),
    });
    const { sessionId } = await this._send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const page = new CdpPage(this, targetId, sessionId, browserContextId);
    this._pages.add(page);
    const origClose = page.close.bind(page);
    page.close = async () => {
      this._pages.delete(page);
      await origClose();
    };
    await page._init({ viewport });
    return page;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    process.removeListener('exit', this._exitHandler);

    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.reject(new Error('CDP browser closed'));
    }
    this._pending.clear();

    try {
      this.ws.close();
    } catch {
      // ignore
    }

    killProcessTree(this.proc?.pid);
    await removeDirWithRetry(this.userDataDir);
  }
}

export async function launchBrowser({ chromePath } = {}) {
  const executable = chromePath || findChromeExecutable();
  const tmpBase = process.env.E2E_TMPDIR || os.tmpdir();
  fs.mkdirSync(tmpBase, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(tmpBase, 'wc3d-chrome-'));

  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--enable-webgl',
    ...(process.env.E2E_SWIFTSHADER === '1'
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : []),
    '--window-size=1280,800',
    'about:blank',
  ];

  const proc = spawn(executable, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });

  const wsUrl = await new Promise((resolve, reject) => {
    let stderrBuf = '';
    const timer = setTimeout(() => {
      reject(new Error(`Chrome DevTools URL timeout. stderr:\n${stderrBuf}`));
    }, 15000);

    const onData = (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\r\n]+)/);
      if (match) {
        clearTimeout(timer);
        proc.stderr.off('data', onData);
        resolve(match[1].trim());
      }
    };

    proc.stderr.on('data', onData);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited early with code ${code}. stderr:\n${stderrBuf}`));
    });
    proc.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  }).catch(async (err) => {
    killProcessTree(proc.pid);
    await removeDirWithRetry(userDataDir);
    throw err;
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000);
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      (evt) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket connection error: ${evt?.message || 'unknown'}`));
      },
      { once: true }
    );
  });

  return new CdpBrowser(proc, ws, userDataDir);
}
