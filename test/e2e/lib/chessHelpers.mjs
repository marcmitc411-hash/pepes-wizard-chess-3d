import assert from 'node:assert/strict';
import { sleep } from './cdpClient.mjs';

export const BOARD_SQ_SIZE = 0.34;
export const BOARD_SURFACE_Y = 0.775;
export const CAMERA_FOV_DEG = 40;

export const PHASE4_SELECTORS = {
  openModalBtn: [
    '[data-testid="btn-multiplayer"]',
    '#btn-multiplayer',
    'button[aria-controls="multiplayer-modal"]',
  ],
  roomPill: [
    '[data-testid="room-pill"]',
    '#room-pill',
    '.room-pill',
  ],
  modal: [
    '[data-testid="multiplayer-modal"]',
    '#multiplayer-modal',
    '[role="dialog"][data-mp-modal]',
  ],
  modeLocal: [
    '[data-testid="mp-mode-local"]',
    '#mp-mode-local',
  ],
  modeSupabase: [
    '[data-testid="mp-mode-supabase"]',
    '#mp-mode-supabase',
  ],
  colorWhite: [
    '[data-testid="mp-color-w"]',
    'input[name="mp-color"][value="w"]',
    '#mp-color-w',
  ],
  colorBlack: [
    '[data-testid="mp-color-b"]',
    'input[name="mp-color"][value="b"]',
    '#mp-color-b',
  ],
  createRoomBtn: [
    '[data-testid="btn-create-room"]',
    '#btn-create-room',
  ],
  roomCodeDisplay: [
    '[data-testid="mp-room-code"]',
    '#mp-room-code',
  ],
  inviteLink: [
    '[data-testid="mp-invite-link"]',
    '[data-testid="btn-copy-invite"]',
    '#btn-copy-invite',
  ],
  joinCodeInput: [
    '[data-testid="input-room-code"]',
    '#input-room-code',
  ],
  joinRoomBtn: [
    '[data-testid="btn-join-room"]',
    '#btn-join-room',
  ],
  statusMsg: [
    '[data-testid="mp-status-msg"]',
    '#mp-status-msg',
  ],
  leaveRoomBtn: [
    '[data-testid="btn-leave-room"]',
    '#btn-leave-room',
  ],
  closeModalBtn: [
    '[data-testid="btn-close-mp-modal"]',
    '#multiplayer-modal .uci-close-btn',
    '[data-testid="multiplayer-modal"] .uci-close-btn',
  ],
};

export function squareToRC(sq) {
  if (typeof sq === 'object' && sq !== null && typeof sq.r === 'number' && typeof sq.c === 'number') {
    return { r: sq.r, c: sq.c };
  }
  const s = String(sq).trim().toLowerCase();
  assert.match(s, /^[a-h][1-8]$/, `Invalid algebraic square: ${sq}`);
  const c = s.charCodeAt(0) - 97;
  const rank = Number(s[1]);
  const r = 8 - rank;
  return { r, c };
}

export function rcToSquare(r, c) {
  const file = String.fromCharCode(97 + c);
  const rank = 8 - r;
  return `${file}${rank}`;
}

export async function waitForAppReady(page, timeoutMs = 30000) {
  await page.waitFor(
    () => {
      const overlay = document.getElementById('loading-overlay');
      const canvas = document.querySelector('#canvas-container canvas');
      return Boolean(
        overlay &&
          overlay.classList.contains('hidden') &&
          canvas &&
          canvas.width > 0 &&
          canvas.height > 0 &&
          window.wizardChess &&
          typeof window.wizardChess.getState === 'function'
      );
    },
    { timeoutMs, intervalMs: 60, message: 'App failed to finish loading 3D assets & wizardChess API' }
  );
  const webdriverFlag = await page.evaluate(() => navigator.webdriver);
  assert.equal(webdriverFlag, false, 'navigator.webdriver must be false so rAF runs');
}

export async function openApp(
  browser,
  baseUrl,
  {
    isolated = true,
    query = '?autotest=1',
    waitStockfish = false,
    viewport = { width: 1280, height: 800 },
    timeoutMs = 30000,
  } = {}
) {
  const page = await browser.newPage({ isolated, viewport });
  const normalizedQuery = query
    ? query.startsWith('?')
      ? query
      : `?${query}`
    : '';
  await page.goto(`${baseUrl}/${normalizedQuery}`, { timeoutMs });
  await waitForAppReady(page, timeoutMs);
  if (waitStockfish) {
    await waitForStockfishReady(page);
  }
  return page;
}

export async function resetWarmPage(page) {
  await page.evaluate(() => {
    window.wizardChess?.setManualStepMode?.(false);
    if (document.body.classList.contains('cinematic-ui-hidden')) {
      window.wizardChess?.toggleUI?.(false);
    }
  });

  // Dismiss any open modals/popovers/coach cards
  await page.pressKey('Escape');
  await page.pressKey('Escape');

  // Ensure Lexicon modal or Promotion modal is closed if backdrop is still present
  const hasBackdrop = await page.evaluate(() => Boolean(document.querySelector('.sanctum-modal-backdrop')));
  if (hasBackdrop) {
    await page.clickAt(10, 10);
    await sleep(60);
  }

  // Exit active lexicon demo if any
  await page.evaluate(() => {
    const s = window.wizardChess?.getState?.();
    if (s?.scriptedGameActive) {
      window.wizardChess.exitLexiconDemo(false);
    }
  });

  // Turn Training Mode OFF if ON
  const trainingOn = await page.evaluate(
    () => document.getElementById('btn-training-mode')?.getAttribute('aria-pressed') === 'true'
  );
  if (trainingOn) {
    await page.clickSelector('#btn-training-mode');
  }

  // Reset language to default 'de' if currently 'en'
  const langBtnText = await page.evaluate(
    () => document.getElementById('btn-lang-toggle')?.textContent?.trim()
  );
  if (langBtnText === 'EN | DE') {
    await page.clickSelector('#btn-lang-toggle');
  }

  // Reset UCI strength to default 1400 Elo (club) if changed
  const uciText = await page.evaluate(
    () => document.getElementById('btn-uci-strength')?.textContent?.trim()
  );
  if (!uciText || !uciText.includes('1400 Elo')) {
    await page.clickSelector('#btn-uci-strength');
    await page.waitForSelector('#uci-strength-panel');
    await page.evaluate(() => {
      document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[2]?.click();
    });
    await page.pressKey('Escape');
  }

  // Dismiss checkmate overlay if visible
  const mateVisible = await page.evaluate(
    () => document.getElementById('checkmate-overlay')?.classList.contains('visible')
  );
  if (mateVisible) {
    await page.clickSelector('#btn-checkmate-dismiss');
  }

  // Reset board, side='w', camera='player', and storage keys
  await page.evaluate(() => {
    localStorage.setItem('wizard_chess_language', 'de');
    localStorage.setItem('wizard_chess_training_mode', 'false');
    localStorage.removeItem('wizard_chess_uci_strength');
    window.wizardChess?.setSinglePlayerSide?.('w');
    window.wizardChess?.resetChessBoard?.(true, false);
    window.wizardChess?.clearCoachHighlights?.();
    window.wizardChess?.stepBy?.(0.9, 10);
    if (window.__e2eCoachSpy) {
      window.__e2eCoachSpy.calls.length = 0;
      window.__e2eCoachSpy.clears = 0;
    }
  });

  await page.waitFor(
    () => {
      const s = window.wizardChess?.getState?.();
      return Boolean(s && !s.isAnimatingMove && !s.preMoveHighlightActive);
    },
    { timeoutMs: 5000 }
  );
  await sleep(60);
  page.clearLogs();
}

export async function acquireTestPage(
  ctx,
  { fresh = false, waitStockfish = false, viewport = null } = {}
) {
  if (fresh) {
    if (ctx.session?.warmPage) {
      await ctx.session.warmPage.close().catch(() => {});
      ctx.session.warmPage = null;
    }
    const page = await openApp(ctx.browser, ctx.baseUrl, {
      isolated: true,
      waitStockfish,
      viewport: viewport || { width: 1280, height: 800 },
      timeoutMs: 60000,
    });
    return page;
  }

  if (!ctx.session.warmPage || ctx.session.warmPage.closed) {
    ctx.session.warmPage = await openApp(ctx.browser, ctx.baseUrl, {
      isolated: false,
      waitStockfish,
      viewport: viewport || { width: 1280, height: 800 },
      timeoutMs: 60000,
    });
    const dirty = await ctx.session.warmPage.evaluate(() => {
      return (
        localStorage.getItem('wizard_chess_language') === 'en' ||
        localStorage.getItem('wizard_chess_training_mode') === 'true' ||
        Boolean(localStorage.getItem('wizard_chess_uci_strength'))
      );
    });
    if (dirty) {
      await resetWarmPage(ctx.session.warmPage);
    }
  } else {
    await resetWarmPage(ctx.session.warmPage);
  }
  if (waitStockfish) {
    await waitForStockfishReady(ctx.session.warmPage);
  }
  return ctx.session.warmPage;
}

export async function releaseTestPage(ctx, page, { fresh = false, failed = false } = {}) {
  if (!page) return;
  if (fresh) {
    await page.close().catch(() => {});
  } else if (failed && ctx.session?.warmPage === page) {
    await page.close().catch(() => {});
    ctx.session.warmPage = null;
  }
}

export async function waitForStockfishReady(page, timeoutMs = 20000) {
  const status = await page.waitFor(
    () => {
      const dot = document.querySelector('#btn-uci-strength .uci-inline-dot');
      if (!dot) return false;
      if (dot.classList.contains('ready')) return 'ready';
      if (dot.classList.contains('fallback')) return 'fallback';
      return false;
    },
    { timeoutMs, intervalMs: 60, message: 'Stockfish engine dot did not leave loading state' }
  );
  assert.equal(status, 'ready', `Expected Stockfish ready, got "${status}"`);
}

export async function waitForMoveIdle(page, timeoutMs = 15000) {
  await page.waitFor(
    () => {
      const s = window.wizardChess?.getState?.();
      return Boolean(s && !s.isAnimatingMove);
    },
    { timeoutMs, intervalMs: 40, message: 'Timed out waiting for move animation to finish' }
  );
}

export async function ensureOverheadCamera(page, { timeoutMs = 10000 } = {}) {
  await page.bringToFront?.().catch(() => {});
  const state = await page.evaluate(() => window.wizardChess.getState());
  if (state.cameraPos[1] < 6.4 || Math.abs(state.cameraPos[0]) > 0.15) {
    await page.clickSelector('#btn-cam-top');
    await page.waitFor(
      () => {
        const s = window.wizardChess?.getState?.();
        return Boolean(
          s &&
            Math.abs(s.cameraPos[1] - 6.85) < 0.04 &&
            Math.abs(s.cameraPos[0]) < 0.04 &&
            Math.abs(Math.abs(s.cameraPos[2]) - 3.65) < 0.04
        );
      },
      { timeoutMs, intervalMs: 30, message: 'Overhead camera did not settle' }
    );
  }
}

export async function projectBoardSquare(page, sqOrRc, { yOffset = 0 } = {}) {
  const { r, c } = squareToRC(sqOrRc);
  return page.evaluate(
    (row, col, yOff, sqSize, surfaceY, fovDeg) => {
      const canvas = document.querySelector('#canvas-container canvas');
      const s = window.wizardChess?.getState?.();
      if (!canvas || !s) return null;
      const rect = canvas.getBoundingClientRect();

      const wx = (col - 3.5) * sqSize;
      const wy = surfaceY + yOff;
      const wz = (row - 3.5) * sqSize;

      const eye = s.cameraPos;
      const target = s.cameraTarget;

      // zAxis = normalize(eye - target)
      let zx = eye[0] - target[0];
      let zy = eye[1] - target[1];
      let zz = eye[2] - target[2];
      const zLen = Math.hypot(zx, zy, zz) || 1;
      zx /= zLen;
      zy /= zLen;
      zz /= zLen;

      // up = (0, 1, 0), xAxis = normalize(cross(up, zAxis))
      let xx = zz;
      let xy = 0;
      let xz = -zx;
      const xLen = Math.hypot(xx, xy, xz) || 1;
      xx /= xLen;
      xy /= xLen;
      xz /= xLen;

      // yAxis = cross(zAxis, xAxis)
      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;

      const rx = wx - eye[0];
      const ry = wy - eye[1];
      const rz = wz - eye[2];

      const cx = rx * xx + ry * xy + rz * xz;
      const cy = rx * yx + ry * yy + rz * yz;
      const cz = rx * zx + ry * zy + rz * zz;

      const f = 1 / Math.tan(((fovDeg * Math.PI) / 180) / 2);
      const aspect = rect.width / rect.height;
      const ndcX = (cx * f / aspect) / -cz;
      const ndcY = (cy * f) / -cz;

      return {
        x: rect.left + (ndcX * 0.5 + 0.5) * rect.width,
        y: rect.top + (-ndcY * 0.5 + 0.5) * rect.height,
        ndcX,
        ndcY,
      };
    },
    r,
    c,
    yOffset,
    BOARD_SQ_SIZE,
    BOARD_SURFACE_Y,
    CAMERA_FOV_DEG
  );
}

export async function clickBoardSquare(page, sqOrRc, { keepCamera = false, yOffset = 0 } = {}) {
  if (!keepCamera) {
    await ensureOverheadCamera(page);
  }
  const pt = await projectBoardSquare(page, sqOrRc, { yOffset });
  assert.ok(pt && Number.isFinite(pt.x) && Number.isFinite(pt.y), `Failed to project square ${JSON.stringify(sqOrRc)}`);
  await page.clickAt(pt.x, pt.y);
  return pt;
}

export async function selectAndClickMove(
  page,
  fromSq,
  toSq,
  { keepCamera = false, expectExecuted = true, expectSelected = true, promoChoiceIndex = null, timeoutMs = 15000 } = {}
) {
  const from = squareToRC(fromSq);
  const beforeLen = await page.evaluate(() => window.wizardChess.getHistoryUci().length);

  await clickBoardSquare(page, from, { keepCamera });
  if (expectSelected) {
    await page.waitFor(
      (r, c) => {
        const sel = window.wizardChess?.getState?.()?.selectedSquare;
        return Boolean(sel && sel.r === r && sel.c === c);
      },
      { timeoutMs: 5000, intervalMs: 30, message: `Expected square ${rcToSquare(from.r, from.c)} to be selected` },
      from.r,
      from.c
    );
  }

  await clickBoardSquare(page, toSq, { keepCamera: true });

  if (promoChoiceIndex !== null) {
    await page.waitForSelector('.promotion-modal .promotion-choice-btn', { timeoutMs: 5000 });
    await page.evaluate((idx) => {
      const btns = document.querySelectorAll('.promotion-modal .promotion-choice-btn');
      if (!btns[idx]) throw new Error(`Promotion choice button ${idx} missing`);
      btns[idx].click();
    }, promoChoiceIndex);
  }

  if (expectExecuted) {
    await page.waitFor(
      (prev) => {
        const s = window.wizardChess?.getState?.();
        const uci = window.wizardChess?.getHistoryUci?.() || [];
        return Boolean(s && !s.isAnimatingMove && uci.length > prev);
      },
      { timeoutMs, intervalMs: 40, message: `Move ${fromSq}->${toSq} did not complete` },
      beforeLen
    );
  }
}

export async function executeDeterministicSequence(page, moves) {
  // moves: Array<[fromSq, toSq, promotion?]>
  const rcMoves = moves.map(([fromSq, toSq, promo]) => ({
    from: squareToRC(fromSq),
    to: squareToRC(toSq),
    promo: promo || undefined,
  }));

  const ok = await page.evaluate((list) => {
    for (const m of list) {
      const res = window.wizardChess.executeChessMove(
        m.from.r,
        m.from.c,
        m.to.r,
        m.to.c,
        m.promo ? { promotion: m.promo } : {}
      );
      if (!res) return false;
      window.wizardChess.stepBy(3.0, 60);
    }
    return true;
  }, rcMoves);

  assert.equal(ok, true, `Failed executing deterministic sequence: ${JSON.stringify(moves)}`);
  await waitForMoveIdle(page);
}

export async function waitForAiResponse(page, prevMoveCount, expectedTurn = 'w', timeoutMs = 20000) {
  await page.waitFor(
    (prev, turn) => {
      const s = window.wizardChess?.getState?.();
      const uci = window.wizardChess?.getHistoryUci?.() || [];
      return Boolean(s && !s.isAnimatingMove && s.currentTurn === turn && uci.length >= prev + 2);
    },
    {
      timeoutMs,
      intervalMs: 50,
      message: `Timed out waiting for AI move response (prev=${prevMoveCount}, expectedTurn=${expectedTurn})`,
    },
    prevMoveCount,
    expectedTurn
  );
}

export async function setupScenario(page, pieces, turn = 'w') {
  const normalized = pieces.map((p) => {
    if (p.sq) {
      const { r, c } = squareToRC(p.sq);
      return { type: p.type, color: p.color, r, c, hasMoved: Boolean(p.hasMoved) };
    }
    return {
      type: p.type,
      color: p.color,
      r: p.r,
      c: p.c,
      hasMoved: Boolean(p.hasMoved),
    };
  });
  await page.evaluate(
    (pcs, t) => {
      window.wizardChess.setupCustomScenario(pcs, t);
    },
    normalized,
    turn
  );
  await sleep(60);
}

export async function openLexiconNormalized(page, { tabIndex = 0, chipIndex = 0, search = '' } = {}) {
  await page.clickSelector('#btn-lexicon');
  await page.waitForSelector('#lexicon-modal-title');
  await page.evaluate(
    (tIdx, cIdx) => {
      document.querySelectorAll('.lexicon-tab-btn')[tIdx]?.click();
      document.querySelectorAll('.lexicon-filters .lexicon-chip')[cIdx]?.click();
    },
    tabIndex,
    chipIndex
  );
  await page.typeText('input.lexicon-search', search);
}

export async function installCoachSpy(page) {
  await page.evaluate(() => {
    if (!window.__e2eCoachSpy) {
      const origShow = window.wizardChess.showCoachHighlights;
      const origClear = window.wizardChess.clearCoachHighlights;
      window.__e2eCoachSpy = { calls: [], clears: 0 };
      window.wizardChess.showCoachHighlights = (cfg) => {
        window.__e2eCoachSpy.calls.push(JSON.parse(JSON.stringify(cfg || {})));
        return origShow(cfg);
      };
      window.wizardChess.clearCoachHighlights = () => {
        window.__e2eCoachSpy.clears += 1;
        return origClear();
      };
    } else {
      window.__e2eCoachSpy.calls.length = 0;
      window.__e2eCoachSpy.clears = 0;
    }
  });
}

export async function getCoachSpy(page) {
  return page.evaluate(() => window.__e2eCoachSpy || { calls: [], clears: 0 });
}

export async function sampleCanvasColors(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { hasWebgl: false };

    const w = canvas.width;
    const h = canvas.height;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    let nonBlackCount = 0;
    let redArrowPixels = 0;
    let greenArrowPixels = 0;
    let cyanArrowPixels = 0;
    let amberPixels = 0;

    // Sample every 2nd pixel in X and Y for speed while catching thin 3D arrow shafts
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        const r = buf[idx];
        const g = buf[idx + 1];
        const b = buf[idx + 2];
        if (r + g + b > 20) nonBlackCount++;
        if (r >= 115 && r > g * 1.45 && r > b * 1.45) redArrowPixels++;
        if (g >= 105 && g > r * 1.35 && g > b * 1.25) greenArrowPixels++;
        if (b >= 115 && g >= 95 && b > r * 1.45) cyanArrowPixels++;
        if (r >= 130 && g >= 75 && r > b * 1.8 && g < r * 0.9) amberPixels++;
      }
    }

    return {
      hasWebgl: true,
      width: w,
      height: h,
      nonBlackCount,
      redArrowPixels,
      greenArrowPixels,
      cyanArrowPixels,
      amberPixels,
    };
  });
}

export async function firstMatchingSelector(page, selectors, { timeoutMs = 8000, visible = true } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      (sels, checkVisible) => {
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          if (!checkVisible) return sel;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) > 0
          ) {
            return sel;
          }
        }
        return null;
      },
      selectors,
      visible
    );
    if (found) return found;
    await sleep(50);
  }
  throw new Error(`None of selectors matched (visible=${visible}): ${selectors.join(', ')}`);
}
