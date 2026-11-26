import assert from 'node:assert/strict';
import { sleep } from '../lib/cdpClient.mjs';
import {
  acquireTestPage,
  clickBoardSquare,
  ensureOverheadCamera,
  executeDeterministicSequence,
  getCoachSpy,
  installCoachSpy,
  releaseTestPage,
  sampleCanvasColors,
  selectAndClickMove,
  setupScenario,
  waitForAiResponse,
  waitForAppReady,
  waitForMoveIdle,
} from '../lib/chessHelpers.mjs';

export function getTests() {
  return [
    // =========================================================================
    // E1: App Startup, WebGL Canvas & Clean Runtime Logs
    // =========================================================================
    {
      id: 'T1-E1-01',
      tier: 1,
      phase: '1-3',
      feature: 'E1',
      name: 'Boot Vite app, WebGL canvas renders non-black pixels with zero runtime/HTTP errors',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        const box = await page.evaluate(() => {
          const c = document.querySelector('#canvas-container canvas');
          if (!c) return null;
          const r = c.getBoundingClientRect();
          return { width: r.width, height: r.height, cw: c.width, ch: c.height };
        });
        assert.ok(box && box.width >= 800 && box.height >= 500, `Canvas rect too small: ${JSON.stringify(box)}`);
        assert.ok(box.cw > 0 && box.ch > 0, `Canvas backing size zero: ${JSON.stringify(box)}`);

        const pixels = await sampleCanvasColors(page);
        assert.equal(pixels?.hasWebgl, true, 'WebGL context missing');
        assert.ok(pixels.nonBlackCount > 500, `Expected non-black WebGL pixels, got ${pixels.nonBlackCount}`);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E1-02',
      tier: 1,
      phase: '1-3',
      feature: 'E1',
      name: 'Initial HUD completeness on desktop viewport',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        const selectors = [
          '#status-pill',
          '#turn-text',
          '#mode-badge',
          '#btn-side-toggle',
          '#btn-ai-move',
          '#btn-reset',
          '#btn-training-mode',
          '#btn-lexicon',
          '#btn-uci-strength',
          '#btn-lang-toggle',
          '#btn-hide-ui',
          '#controls-hint',
          '#btn-cam-player',
          '#btn-cam-top',
          '#btn-cam-side',
          '#btn-cam-wide',
        ];
        for (const sel of selectors) {
          await page.waitForSelector(sel, { timeoutMs: 5000, visible: true });
        }
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E1-03',
      tier: 1,
      phase: '1-3',
      feature: 'E1',
      name: 'Initial board FEN and turn state match standard chess starting position',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        const fen = await page.evaluate(() => window.wizardChess.getFen());
        const state = await page.evaluate(() => window.wizardChess.getState());
        assert.equal(fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        assert.equal(state.currentTurn, 'w');
        assert.equal(state.playerColor, 'w');
        assert.equal(state.gameMode, 'single');
        assert.equal(state.gameOver, false);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E1-04',
      tier: 1,
      phase: '1-3',
      feature: 'E1',
      name: 'Camera preset buttons move camera and toggle .active class cleanly',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        const presets = [
          { btn: '#btn-cam-top', expectYMin: 6.0 },
          { btn: '#btn-cam-side', expectXMin: 2.0 },
          { btn: '#btn-cam-wide', expectZMin: 5.5 },
          { btn: '#btn-cam-player', expectYMax: 2.6 },
        ];
        for (const p of presets) {
          await page.clickSelector(p.btn);
          await page.waitFor(
            (btnSel) => document.querySelector(btnSel)?.classList.contains('active'),
            { timeoutMs: 3000 },
            p.btn
          );
          await sleep(850);
          const pos = await page.evaluate(() => window.wizardChess.getState().cameraPos);
          if (p.expectYMin) assert.ok(pos[1] >= p.expectYMin, `${p.btn} pos=${pos}`);
          if (p.expectXMin) assert.ok(Math.abs(pos[0]) >= p.expectXMin, `${p.btn} pos=${pos}`);
          if (p.expectZMin) assert.ok(Math.abs(pos[2]) >= p.expectZMin, `${p.btn} pos=${pos}`);
          if (p.expectYMax) assert.ok(pos[1] <= p.expectYMax, `${p.btn} pos=${pos}`);
        }
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E1-05',
      tier: 1,
      phase: '1-3',
      feature: 'E1',
      name: 'Cinematic UI toggle hides HUD and H shortcut restores visibility',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-hide-ui');
        await page.waitFor(
          () =>
            document.body.classList.contains('cinematic-ui-hidden') &&
            getComputedStyle(document.getElementById('hud-top')).opacity === '0',
          { timeoutMs: 3000 }
        );

        await page.pressKey('h');
        await page.waitFor(
          () =>
            !document.body.classList.contains('cinematic-ui-hidden') &&
            getComputedStyle(document.getElementById('hud-top')).opacity === '1',
          { timeoutMs: 3000 }
        );
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E2: UCI Spielstärke & Stockfish AI
    // =========================================================================
    {
      id: 'T1-E2-01',
      tier: 1,
      phase: '1-3',
      feature: 'E2',
      name: 'Stockfish WASM worker initializes to ready and shows localized status in popover',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel', { timeoutMs: 3000 });
        const statusText = await page.evaluate(
          () => document.querySelector('#uci-strength-panel .uci-status-text')?.textContent?.trim()
        );
        assert.equal(statusText, 'Stockfish bereit');
        const dotReady = await page.evaluate(
          () => document.querySelector('#uci-strength-panel .uci-status-dot')?.classList.contains('ready')
        );
        assert.equal(dotReady, true);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E2-02',
      tier: 1,
      phase: '1-3',
      feature: 'E2',
      name: 'UCI preset buttons update HUD label, active state, and UCI mode readout',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');

        const checks = [
          { idx: 0, btnLabel: 'UCI: 600 Elo', techSub: 'Skill Level' },
          { idx: 2, btnLabel: 'UCI: 1400 Elo', techSub: 'UCI_LimitStrength (1400 Elo)' },
          { idx: 5, btnLabel: 'UCI: 2600 Elo', techSub: 'UCI_LimitStrength (2600 Elo)' },
          { idx: 6, btnLabel: 'UCI: Max', techSub: 'Skill 20' },
        ];
        for (const c of checks) {
          await page.evaluate((idx) => {
            document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[idx]?.click();
          }, c.idx);
          const info = await page.evaluate(() => ({
            btn: document.getElementById('btn-uci-strength')?.textContent?.trim(),
            tech: document.querySelector('#uci-strength-panel .uci-mode-tech')?.textContent?.trim(),
          }));
          assert.ok(info.btn?.includes(c.btnLabel), `Expected "${c.btnLabel}" in "${info.btn}"`);
          assert.ok(info.tech?.includes(c.techSub), `Expected "${c.techSub}" in "${info.tech}"`);
        }
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E2-03',
      tier: 1,
      phase: '1-3',
      feature: 'E2',
      name: 'Adjusting custom Elo slider updates readout, HUD button, and localStorage',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-elo-slider');
        await page.setRangeSlider('#uci-elo-slider', 1750);

        const res = await page.evaluate(() => ({
          sliderVal: document.querySelector('#uci-strength-panel .uci-slider-value')?.textContent?.trim(),
          btnLabel: document.getElementById('btn-uci-strength')?.textContent?.trim(),
          stored: JSON.parse(localStorage.getItem('wizard_chess_uci_strength') || 'null'),
        }));
        assert.equal(res.sliderVal, '1750 Elo');
        assert.ok(res.btnLabel?.includes('UCI: 1750 Elo'));
        assert.equal(res.stored?.elo, 1750);
        assert.equal(res.stored?.presetId, 'custom');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E2-04',
      tier: 1,
      phase: '1-3',
      feature: 'E2',
      name: 'Playing 1.e4 via canvas triggers Stockfish AI response and returns turn to White',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.evaluate(() => {
          document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[0]?.click();
        });
        await page.pressKey('Escape');

        await selectAndClickMove(page, 'e2', 'e4');
        await waitForAiResponse(page, 0, 'w', 20000);

        const history = await page.evaluate(() => window.wizardChess.getHistoryUci());
        assert.equal(history.length, 2, `Expected 2 plies, got ${JSON.stringify(history)}`);
        assert.equal(history[0], 'e2e4');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E2-05',
      tier: 1,
      phase: '1-3',
      feature: 'E2',
      name: 'AI Move button forces immediate AI move and Side Toggle switches to Black',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-ai-move');
        await page.waitFor(
          () => {
            const s = window.wizardChess.getState();
            const uci = window.wizardChess.getHistoryUci();
            return uci.length === 1 && !s.isAnimatingMove && s.currentTurn === 'b';
          },
          { timeoutMs: 20000, message: 'AI Move button did not produce 1st White move' }
        );
        await page.clickSelector('#btn-side-toggle');
        await page.waitFor(
          () => {
            const s = window.wizardChess.getState();
            const uci = window.wizardChess.getHistoryUci();
            return s.playerColor === 'b' && uci.length >= 1 && !s.isAnimatingMove && s.currentTurn === 'b';
          },
          { timeoutMs: 20000, message: 'Side toggle to Black + AI opening move did not settle' }
        );
        const badge = await page.evaluate(() => document.getElementById('mode-badge')?.textContent?.trim());
        assert.equal(badge, 'Spieler: Schwarz');
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E3: FIDE Rules (Legal/Illegal, Promotion, En Passant, Castling, Mate/Draw)
    // =========================================================================
    {
      id: 'T1-E3-01',
      tier: 1,
      phase: '1-3',
      feature: 'E3',
      name: 'Selecting e2 highlights legal moves and clicking e4 completes legal move; illegal move rejected',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await ensureOverheadCamera(page);
        await selectAndClickMove(page, 'e2', 'e4', { keepCamera: true });
        const uciAfterLegal = await page.evaluate(() => window.wizardChess.getHistoryUci());
        assert.deepEqual(uciAfterLegal, ['e2e4']);

        await page.clickSelector('#btn-reset');
        await waitForMoveIdle(page);
        const fenBefore = await page.evaluate(() => window.wizardChess.getFen());
        const illegalRes = await page.evaluate(() => window.wizardChess.executeChessMove(6, 4, 7, 4));
        assert.equal(illegalRes, false);
        const fenAfter = await page.evaluate(() => window.wizardChess.getFen());
        assert.equal(fenAfter, fenBefore);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E3-02',
      tier: 1,
      phase: '1-3',
      feature: 'E3',
      name: 'En passant capture removes passed Black pawn and updates captured tray',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'pawn', color: 'w', sq: 'e5' },
            { type: 'king', color: 'b', sq: 'e8' },
            { type: 'pawn', color: 'b', sq: 'd7' },
          ],
          'b'
        );
        await executeDeterministicSequence(page, [['d7', 'd5']]);
        await selectAndClickMove(page, 'e5', 'd6');

        const status = await page.evaluate(() => ({
          fen: window.wizardChess.getFen(),
          san: window.wizardChess.getHistorySan(),
          state: window.wizardChess.getState(),
          tray: document.getElementById('captured-tray')?.textContent?.trim(),
        }));
        assert.ok(status.san.includes('exd6'), `Expected exd6 in ${JSON.stringify(status.san)}`);
        assert.equal(status.state.capturedByWhite, 1);
        assert.ok(status.tray?.includes('Weiß: 1'), `Unexpected tray: ${status.tray}`);
        const rank5 = status.fen.split(' ')[0].split('/')[3];
        assert.equal(rank5, '8', `Expected rank 5 empty after EP capture, got ${rank5}`);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E3-03',
      tier: 1,
      phase: '1-3',
      feature: 'E3',
      name: 'Kingside and Queenside castling move both King and Rook and update FEN rights',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1', hasMoved: false },
            { type: 'rook', color: 'w', sq: 'h1', hasMoved: false },
            { type: 'rook', color: 'w', sq: 'a1', hasMoved: false },
            { type: 'king', color: 'b', sq: 'e8', hasMoved: false },
          ],
          'w'
        );
        await selectAndClickMove(page, 'e1', 'g1');
        const ks = await page.evaluate(() => ({
          fen: window.wizardChess.getFen(),
          san: window.wizardChess.getHistorySan(),
          uci: window.wizardChess.getHistoryUci(),
        }));
        assert.equal(ks.san[0], 'O-O');
        assert.equal(ks.uci[0], 'e1g1');
        assert.ok(ks.fen.startsWith('4k3/8/8/8/8/8/8/R4RK1 '), `Unexpected kingside FEN: ${ks.fen}`);

        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1', hasMoved: false },
            { type: 'rook', color: 'w', sq: 'a1', hasMoved: false },
            { type: 'king', color: 'b', sq: 'e8', hasMoved: false },
          ],
          'w'
        );
        await selectAndClickMove(page, 'e1', 'c1');
        const qs = await page.evaluate(() => ({
          fen: window.wizardChess.getFen(),
          san: window.wizardChess.getHistorySan(),
          uci: window.wizardChess.getHistoryUci(),
        }));
        assert.equal(qs.san[0], 'O-O-O');
        assert.equal(qs.uci[0], 'e1c1');
        assert.ok(qs.fen.startsWith('4k3/8/8/8/8/8/8/2KR4 '), `Unexpected queenside FEN: ${qs.fen}`);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E3-04',
      tier: 1,
      phase: '1-3',
      feature: 'E3',
      name: 'Pawn promotion opens PromotionModal and underpromotion to Knight records a7a8n',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'pawn', color: 'w', sq: 'a7' },
            { type: 'king', color: 'b', sq: 'h8' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'a7', 'a8', { promoChoiceIndex: 3 });

        const info = await page.evaluate(() => ({
          fen: window.wizardChess.getFen(),
          uci: window.wizardChess.getHistoryUci(),
          san: window.wizardChess.getHistorySan(),
        }));
        assert.equal(info.uci[0], 'a7a8n');
        assert.ok(info.san[0].includes('=N'), `Expected =N in SAN: ${info.san[0]}`);
        assert.ok(info.fen.startsWith('N6k/'), `Expected White Knight on a8 in FEN: ${info.fen}`);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E3-05',
      tier: 1,
      phase: '1-3',
      feature: 'E3',
      name: 'Checkmate (Fools Mate) and Stalemate trigger distinct localized overlays',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await executeDeterministicSequence(page, [
          ['f2', 'f3'],
          ['e7', 'e5'],
          ['g2', 'g4'],
          ['d8', 'h4'],
        ]);
        await page.waitForSelector('#checkmate-overlay.visible', { timeoutMs: 5000 });
        const mateUi = await page.evaluate(() => ({
          title: document.getElementById('checkmate-title')?.textContent?.trim(),
          turn: document.getElementById('turn-text')?.textContent?.trim(),
          replayBtn: Boolean(document.getElementById('btn-checkmate-replay')),
          outcome: window.wizardChess.getGameStatus().outcome,
        }));
        assert.equal(mateUi.outcome, 'checkmate');
        assert.equal(mateUi.title, 'Schachmatt');
        assert.equal(mateUi.turn, 'Schachmatt — Schwarz gewinnt');
        assert.equal(mateUi.replayBtn, true);

        await setupScenario(
          page,
          [
            { type: 'king', color: 'b', sq: 'a8' },
            { type: 'queen', color: 'w', sq: 'b6' },
            { type: 'king', color: 'w', sq: 'h1' },
          ],
          'b'
        );
        await page.waitForSelector('#checkmate-overlay.visible', { timeoutMs: 3000 });
        const staleUi = await page.evaluate(() => ({
          crown: document.getElementById('checkmate-crown')?.textContent?.trim(),
          title: document.getElementById('checkmate-title')?.textContent?.trim(),
          sub: document.getElementById('checkmate-subtitle')?.textContent?.trim(),
          replayBtn: Boolean(document.getElementById('btn-checkmate-replay')),
          outcome: window.wizardChess.getGameStatus().outcome,
        }));
        assert.equal(staleUi.outcome, 'stalemate');
        assert.equal(staleUi.crown, '⚖');
        assert.equal(staleUi.title, 'Remis');
        assert.equal(staleUi.sub, 'Patt — Remis');
        assert.equal(staleUi.replayBtn, false);
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E4: DE/EN Language Switching & Reload Persistence
    // =========================================================================
    {
      id: 'T1-E4-01',
      tier: 1,
      phase: '1-3',
      feature: 'E4',
      name: 'Default startup language is German (DE)',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        const texts = await page.evaluate(() => ({
          langBtn: document.getElementById('btn-lang-toggle')?.textContent?.trim(),
          turn: document.getElementById('turn-text')?.textContent?.trim(),
          mode: document.getElementById('mode-badge')?.textContent?.trim(),
          lexicon: document.getElementById('btn-lexicon')?.textContent?.trim(),
          training: document.getElementById('btn-training-mode')?.textContent?.trim(),
          aiMove: document.getElementById('btn-ai-move')?.textContent?.trim(),
          reset: document.getElementById('btn-reset')?.textContent?.trim(),
        }));
        assert.equal(texts.langBtn, 'DE | EN');
        assert.equal(texts.turn, 'Weiß am Zug');
        assert.equal(texts.mode, 'Spieler: Weiß');
        assert.equal(texts.lexicon, 'Lexikon');
        assert.equal(texts.training, 'Training: Aus');
        assert.equal(texts.aiMove, 'KI-Zug');
        assert.equal(texts.reset, 'Neues Spiel');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E4-02',
      tier: 1,
      phase: '1-3',
      feature: 'E4',
      name: 'Clicking language toggle updates all primary HUD controls to English',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lang-toggle');
        const texts = await page.evaluate(() => ({
          langBtn: document.getElementById('btn-lang-toggle')?.textContent?.trim(),
          turn: document.getElementById('turn-text')?.textContent?.trim(),
          mode: document.getElementById('mode-badge')?.textContent?.trim(),
          lexicon: document.getElementById('btn-lexicon')?.textContent?.trim(),
          training: document.getElementById('btn-training-mode')?.textContent?.trim(),
          aiMove: document.getElementById('btn-ai-move')?.textContent?.trim(),
          reset: document.getElementById('btn-reset')?.textContent?.trim(),
          hideUi: document.getElementById('btn-hide-ui')?.textContent?.trim(),
        }));
        assert.equal(texts.langBtn, 'EN | DE');
        assert.equal(texts.turn, 'White to Move');
        assert.equal(texts.mode, 'Playing as White');
        assert.equal(texts.lexicon, 'Lexicon');
        assert.equal(texts.training, 'Training: Off');
        assert.equal(texts.aiMove, 'AI Move');
        assert.equal(texts.reset, 'New Game');
        assert.equal(texts.hideUi, 'Hide UI [H]');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E4-03',
      tier: 1,
      phase: '1-3',
      feature: 'E4',
      name: 'Language selection persists in localStorage across full page reload',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lang-toggle');
        const saved = await page.evaluate(() => localStorage.getItem('wizard_chess_language'));
        assert.equal(saved, 'en');

        await page.reload();
        await waitForAppReady(page);
        const texts = await page.evaluate(() => ({
          langBtn: document.getElementById('btn-lang-toggle')?.textContent?.trim(),
          turn: document.getElementById('turn-text')?.textContent?.trim(),
        }));
        assert.equal(texts.langBtn, 'EN | DE');
        assert.equal(texts.turn, 'White to Move');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E4-04',
      tier: 1,
      phase: '1-3',
      feature: 'E4',
      name: 'UCI popover, Lexicon modal, and Promotion modal localize accurately in DE and EN',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        assert.equal(
          await page.evaluate(() => document.querySelector('.uci-popover-title')?.textContent?.trim()),
          'UCI-Spielstärke'
        );
        await page.clickSelector('#btn-lang-toggle');
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        assert.equal(
          await page.evaluate(() => document.querySelector('.uci-popover-title')?.textContent?.trim()),
          'UCI Engine Strength'
        );
        await page.pressKey('Escape');

        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('#lexicon-modal-title');
        assert.equal(
          await page.evaluate(() => document.getElementById('lexicon-modal-title')?.textContent?.trim()),
          'Chess Lexicon'
        );
        await page.pressKey('Escape');

        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'pawn', color: 'w', sq: 'b7' },
            { type: 'king', color: 'b', sq: 'h8' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'b7', 'b8', { expectExecuted: false });
        await page.waitForSelector('#promotion-modal-title');
        assert.equal(
          await page.evaluate(() => document.getElementById('promotion-modal-title')?.textContent?.trim()),
          'Choose Pawn Promotion'
        );
        await page.pressKey('Escape');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E4-05',
      tier: 1,
      phase: '1-3',
      feature: 'E4',
      name: 'Dynamic placeholders (checkmate winner, opening badge) localize in DE and EN',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await executeDeterministicSequence(page, [
          ['e2', 'e4'],
          ['e7', 'e5'],
          ['g1', 'f3'],
          ['b8', 'c6'],
          ['f1', 'c4'],
        ]);
        await page.waitForSelector('#opening-badge');
        assert.ok(
          (await page.evaluate(() => document.getElementById('opening-badge')?.textContent))?.includes('Italienische Partie')
        );
        await page.clickSelector('#btn-lang-toggle');
        assert.ok(
          (await page.evaluate(() => document.getElementById('opening-badge')?.textContent))?.includes('Italian Game')
        );

        await page.clickSelector('#btn-reset');
        await waitForMoveIdle(page);
        await executeDeterministicSequence(page, [
          ['f2', 'f3'],
          ['e7', 'e5'],
          ['g2', 'g4'],
          ['d8', 'h4'],
        ]);
        await page.waitForSelector('#checkmate-overlay.visible');
        assert.equal(
          await page.evaluate(() => document.getElementById('turn-text')?.textContent?.trim()),
          'Checkmate — Black Wins'
        );
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E5: Training Mode / Coach & 3D Arrow Overlays
    // =========================================================================
    {
      id: 'T1-E5-01',
      tier: 1,
      phase: '1-3',
      feature: 'E5',
      name: 'Training Mode button toggles active state and persists in localStorage across reload',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-training-mode');
        const onState = await page.evaluate(() => ({
          pressed: document.getElementById('btn-training-mode')?.getAttribute('aria-pressed'),
          active: document.getElementById('btn-training-mode')?.classList.contains('active'),
          text: document.getElementById('btn-training-mode')?.textContent?.trim(),
          stored: localStorage.getItem('wizard_chess_training_mode'),
        }));
        assert.equal(onState.pressed, 'true');
        assert.equal(onState.active, true);
        assert.equal(onState.text, 'Training: An');
        assert.equal(onState.stored, 'true');

        await page.reload();
        await waitForAppReady(page);
        assert.equal(
          await page.evaluate(() => document.getElementById('btn-training-mode')?.getAttribute('aria-pressed')),
          'true'
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E5-02',
      tier: 1,
      phase: '1-3',
      feature: 'E5',
      name: 'Training Coach diagnoses pinned-piece illegal move and suggests legal alternatives',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-training-mode');
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'bishop', color: 'w', sq: 'e2' },
            { type: 'rook', color: 'b', sq: 'e8' },
            { type: 'king', color: 'b', sq: 'a8' },
          ],
          'w'
        );

        await selectAndClickMove(page, 'e2', 'd3', { expectExecuted: false });
        await page.waitForSelector('#training-coach-panel.verdict-illegal', { timeoutMs: 8000 });

        const card = await page.evaluate(() => ({
          badge: document.querySelector('#training-coach-panel .coach-verdict-badge')?.textContent?.trim(),
          reason: document.querySelector('#training-coach-panel .coach-card-reason')?.textContent?.trim(),
          altsCount: document.querySelectorAll('#training-coach-panel .coach-alt-item').length,
        }));
        assert.equal(card.badge, 'Regelverstoß');
        assert.ok(card.reason?.includes('e8') || card.reason?.includes('gefesselt'), `Reason: ${card.reason}`);
        assert.ok(card.altsCount >= 1, 'Expected at least 1 alternative suggestion');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E5-03',
      tier: 1,
      phase: '1-3',
      feature: 'E5',
      name: 'Training Coach detects hanging-Queen blunder with refutation line via Stockfish',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-training-mode');
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'queen', color: 'w', sq: 'd1' },
            { type: 'king', color: 'b', sq: 'e8' },
            { type: 'pawn', color: 'b', sq: 'b5' },
          ],
          'w'
        );

        await selectAndClickMove(page, 'd1', 'a4', { expectExecuted: false });
        await page.waitForSelector('#training-coach-panel.verdict-blunder', { timeoutMs: 12000 });

        const card = await page.evaluate(() => ({
          badge: document.querySelector('#training-coach-panel .coach-verdict-badge')?.textContent?.trim(),
          refutation: document.querySelector('#training-coach-panel .coach-refutation-line')?.textContent?.trim(),
          hasPlayAltBtn: Boolean(document.querySelector('#training-coach-panel .coach-alt-play-btn')),
        }));
        assert.equal(card.badge, 'Grober Patzer');
        assert.ok(card.refutation?.includes('bxa4') || card.refutation?.includes('a4'), `Refutation: ${card.refutation}`);
        assert.equal(card.hasPlayAltBtn, true);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E5-04',
      tier: 1,
      phase: '1-3',
      feature: 'E5',
      name: 'Coach actions: Choose Another cancels, Play Alternative executes suggested move, Play Anyway proceeds',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-training-mode');
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'queen', color: 'w', sq: 'd1' },
            { type: 'king', color: 'b', sq: 'e8' },
            { type: 'pawn', color: 'b', sq: 'b5' },
          ],
          'w'
        );

        await selectAndClickMove(page, 'd1', 'a4', { expectExecuted: false });
        await page.waitForSelector('#training-coach-panel.verdict-blunder', { timeoutMs: 12000 });
        await page.clickSelector('#training-coach-panel .coach-card-actions button:first-child');
        await page.waitFor(() => !document.getElementById('training-coach-panel'));
        assert.equal((await page.evaluate(() => window.wizardChess.getHistoryUci())).length, 0);

        await selectAndClickMove(page, 'd1', 'a4', { expectExecuted: false });
        await page.waitForSelector('#training-coach-panel.verdict-blunder', { timeoutMs: 12000 });
        await page.clickSelector('#training-coach-panel .coach-card-actions button.secondary');
        await page.waitFor(
          () => {
            const s = window.wizardChess.getState();
            const uci = window.wizardChess.getHistoryUci();
            return uci[0] === 'd1a4' && !s.isAnimatingMove;
          },
          { timeoutMs: 10000 }
        );

        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'queen', color: 'w', sq: 'd1' },
            { type: 'king', color: 'b', sq: 'e8' },
            { type: 'pawn', color: 'b', sq: 'b5' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'd1', 'a4', { expectExecuted: false });
        await page.waitForSelector('#training-coach-panel .coach-alt-play-btn', { timeoutMs: 12000 });
        await page.clickSelector('#training-coach-panel .coach-alt-play-btn');
        await page.waitFor(
          () => {
            const s = window.wizardChess.getState();
            const uci = window.wizardChess.getHistoryUci();
            return uci.length >= 1 && uci[0] !== 'd1a4' && !s.isAnimatingMove;
          },
          { timeoutMs: 10000 }
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E5-05',
      tier: 1,
      phase: '1-3',
      feature: 'E5',
      name: 'Coach invokes showCoachHighlights with danger+best arrows and WebGL canvas renders red and green pixels',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await installCoachSpy(page);
        await page.clickSelector('#btn-training-mode');
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'queen', color: 'w', sq: 'd1' },
            { type: 'king', color: 'b', sq: 'e8' },
            { type: 'pawn', color: 'b', sq: 'b5' },
          ],
          'w'
        );

        await selectAndClickMove(page, 'd1', 'a4', { expectExecuted: false });
        await page.waitForSelector('#training-coach-panel.verdict-blunder', { timeoutMs: 12000 });
        await sleep(120);

        const spy = await getCoachSpy(page);
        assert.ok(spy.calls.length >= 1, 'showCoachHighlights was not called');
        const lastCall = spy.calls[spy.calls.length - 1];
        assert.ok(lastCall.arrows.some((a) => a.kind === 'danger'), 'Missing danger arrow');
        assert.ok(lastCall.arrows.some((a) => a.kind === 'best'), 'Missing best arrow');

        const pixels = await sampleCanvasColors(page);
        assert.ok(pixels.redArrowPixels > 8, `Expected red danger arrow pixels, got ${pixels.redArrowPixels}`);
        assert.ok(pixels.greenArrowPixels > 8, `Expected green best arrow pixels, got ${pixels.greenArrowPixels}`);
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E6: Opening & Strategy Lexicon, 3D Demo & Live Opening Detection
    // =========================================================================
    {
      id: 'T1-E6-01',
      tier: 1,
      phase: '1-3',
      feature: 'E6',
      name: 'Lexicon modal displays 16 openings and 12 strategies across switchable tabs',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('#lexicon-modal-title');
        const openingsInfo = await page.evaluate(() => ({
          tabs: Array.from(document.querySelectorAll('.lexicon-tab-btn')).map((b) => b.textContent?.trim()),
          items: document.querySelectorAll('.lexicon-list .lexicon-list-item').length,
        }));
        assert.ok(openingsInfo.tabs[0]?.includes('(16)'), `Unexpected openings tab: ${openingsInfo.tabs[0]}`);
        assert.ok(openingsInfo.tabs[1]?.includes('(12)'), `Unexpected strategies tab: ${openingsInfo.tabs[1]}`);
        assert.equal(openingsInfo.items, 16);

        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[1]?.click();
        });
        const stratCount = await page.evaluate(
          () => document.querySelectorAll('.lexicon-list .lexicon-list-item').length
        );
        assert.equal(stratCount, 12);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E6-02',
      tier: 1,
      phase: '1-3',
      feature: 'E6',
      name: 'Lexicon search query and category filter chips filter entries and show empty state',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('input.lexicon-search');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[0]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });

        await page.typeText('input.lexicon-search', 'C50');
        const c50Names = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.lexicon-list-item .lexicon-item-name')).map((el) =>
            el.textContent?.trim()
          )
        );
        assert.deepEqual(c50Names, ['Italienische Partie']);

        await page.typeText('input.lexicon-search', '');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[2]?.click();
        });
        const semiOpenCount = await page.evaluate(
          () => document.querySelectorAll('.lexicon-list-item').length
        );
        assert.equal(semiOpenCount, 4);

        await page.typeText('input.lexicon-search', 'zzz_nonexistent_opening_xyz');
        await page.waitForSelector('.lexicon-empty');

        // Clean internal React filter state for subsequent modal openings
        await page.typeText('input.lexicon-search', '');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E6-03',
      tier: 1,
      phase: '1-3',
      feature: 'E6',
      name: 'Opening 3D Demo launches demo bar and steps forward & backward updating board FEN',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('#lexicon-modal-title');
        await page.typeText('input.lexicon-search', '');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[0]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        await page.waitForSelector('.lexicon-detail-head button.checkmate-btn');
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');

        await page.waitForSelector('#lexicon-demo-bar');
        assert.equal(
          await page.evaluate(() => document.querySelector('.lexicon-demo-step')?.textContent?.trim()),
          'Zug 0/9'
        );

        await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
        await page.waitFor(
          () => window.wizardChess.getState().scriptCursor === 1 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 5000 }
        );
        await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
        await page.waitFor(
          () => window.wizardChess.getState().scriptCursor === 2 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 5000 }
        );
        assert.deepEqual(
          await page.evaluate(() => window.wizardChess.getHistoryUci()),
          ['e2e4', 'e7e5']
        );

        await page.clickSelector('.lexicon-demo-actions button:nth-child(1)');
        await page.waitFor(() => window.wizardChess.getState().scriptCursor === 1, { timeoutMs: 3000 });
        assert.deepEqual(
          await page.evaluate(() => window.wizardChess.getHistoryUci()),
          ['e2e4']
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E6-04',
      tier: 1,
      phase: '1-3',
      feature: 'E6',
      name: 'Strategy 3D example loads custom FEN with 3D arrows and Exit/Play from Here behave cleanly',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('.lexicon-tab-btn');
        await page.typeText('input.lexicon-search', '');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[1]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        await page.waitForSelector('.lexicon-detail-head button.checkmate-btn');
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');

        const fen = await page.evaluate(() => window.wizardChess.getFen());
        assert.equal(fen, 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1');
        await ensureOverheadCamera(page);
        await sleep(80);
        const pixels = await sampleCanvasColors(page);
        assert.ok(
          pixels.greenArrowPixels > 8 && pixels.redArrowPixels > 8,
          `Expected green+red 3D strategy arrows, got ${JSON.stringify(pixels)}`
        );

        await page.clickSelector('.lexicon-demo-actions button:nth-child(5)');
        await page.waitFor(() => !document.getElementById('lexicon-demo-bar'));
        assert.equal(
          await page.evaluate(() => window.wizardChess.getFen()),
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        );

        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('.lexicon-tab-btn');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[1]?.click();
        });
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');
        await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
        await page.waitFor(
          () => window.wizardChess.getState().scriptCursor === 1 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 5000 }
        );
        await page.clickSelector('.lexicon-demo-actions button:nth-child(4)');
        await page.waitFor(() => !document.getElementById('lexicon-demo-bar'));
        assert.equal(await page.evaluate(() => window.wizardChess.getState().scriptedGameActive), false);
        assert.ok((await page.evaluate(() => window.wizardChess.getHistorySan())).includes('Nc7+'));
        page.assertCleanLogs();
      },
    },
    {
      id: 'T1-E6-05',
      tier: 1,
      phase: '1-3',
      feature: 'E6',
      name: 'Live opening detection updates #opening-badge and clicking badge opens matching Lexicon entry',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await executeDeterministicSequence(page, [
          ['e2', 'e4'],
          ['e7', 'e5'],
        ]);
        await page.waitForSelector('#opening-badge');
        assert.ok(
          (await page.evaluate(() => document.getElementById('opening-badge')?.textContent))?.includes('C20')
        );

        await executeDeterministicSequence(page, [
          ['g1', 'f3'],
          ['b8', 'c6'],
          ['f1', 'c4'],
        ]);
        await page.waitFor(
          () => document.getElementById('opening-badge')?.textContent?.includes('C50'),
          { timeoutMs: 3000 }
        );

        await page.clickSelector('#opening-badge');
        await page.waitForSelector('#lexicon-modal-title');
        await page.waitFor(
          () => document.querySelector('.lexicon-detail-title')?.textContent?.trim() === 'Italienische Partie',
          { timeoutMs: 3000, message: 'Lexicon did not switch to Italienische Partie after clicking opening badge' }
        );
        page.assertCleanLogs();
      },
    },
  ];
}
