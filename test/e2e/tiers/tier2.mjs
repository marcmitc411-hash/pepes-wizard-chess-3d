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
  selectAndClickMove,
  setupScenario,
  waitForAppReady,
  waitForMoveIdle,
} from '../lib/chessHelpers.mjs';

export function getTests() {
  return [
    // =========================================================================
    // E1 Boundary & Corner Cases
    // =========================================================================
    {
      id: 'T2-E1-01',
      tier: 2,
      phase: '1-3',
      feature: 'E1',
      name: 'Rapid camera preset clicks and reset mid-animation leave no stuck state or errors',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-cam-top');
        await page.clickSelector('#btn-cam-side');
        await page.clickSelector('#btn-cam-wide');
        await page.clickSelector('#btn-cam-player');
        await page.evaluate(() => window.wizardChess.executeChessMove(6, 4, 4, 4));
        await sleep(120);
        await page.clickSelector('#btn-reset');
        await waitForMoveIdle(page);

        const state = await page.evaluate(() => window.wizardChess.getState());
        assert.equal(state.isAnimatingMove, false);
        assert.equal(state.moveHistoryCount, 0);
        assert.equal(
          await page.evaluate(() => window.wizardChess.getFen()),
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E1-02',
      tier: 2,
      phase: '1-3',
      feature: 'E1',
      name: 'Mobile viewport (390x844) opens and closes controls sheet cleanly',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { fresh: true, viewport: { width: 390, height: 844 } });
        try {
          await page.waitForSelector('#btn-mobile-controls', { visible: true });
          await page.clickSelector('#btn-mobile-controls');
          await page.waitForSelector('#hud-right.mobile-sheet-open');
          await sleep(350);
          await page.clickSelector('#btn-mobile-sheet-close');
          await page.waitFor(() => !document.getElementById('hud-right')?.classList.contains('mobile-sheet-open'));
          page.assertCleanLogs();
        } finally {
          await releaseTestPage(ctx, page, { fresh: true });
        }
      },
    },
    {
      id: 'T2-E1-03',
      tier: 2,
      phase: '1-3',
      feature: 'E1',
      name: 'Cathedral column collision slide keeps camera within CATHEDRAL_BOUNDS',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        const result = await page.evaluate(() => {
          const path = window.wizardChess.testColumnCollisionSlide([0, 2.2, 4.0], [50, 2.2, -50], 20);
          const state = window.wizardChess.getState();
          return { last: path[path.length - 1], bounds: state.cathedralBounds };
        });
        const [x, y, z] = result.last;
        const b = result.bounds;
        assert.ok(x >= b.minX && x <= b.maxX, `X out of bounds: ${x} vs [${b.minX}, ${b.maxX}]`);
        assert.ok(y >= b.minY && y <= b.maxY, `Y out of bounds: ${y} vs [${b.minY}, ${b.maxY}]`);
        assert.ok(z >= b.minZ && z <= b.maxZ, `Z out of bounds: ${z} vs [${b.minZ}, ${b.maxZ}]`);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E1-04',
      tier: 2,
      phase: '1-3',
      feature: 'E1',
      name: 'Corrupted localStorage entries fall back safely without uncaught errors',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.evaluate(() => {
          localStorage.setItem('wizard_chess_uci_strength', '{not_valid_json');
          localStorage.setItem('wizard_chess_language', 'fr');
          localStorage.setItem('wizard_chess_training_mode', 'maybe');
        });
        await page.reload();
        await waitForAppReady(page);
        const fallback = await page.evaluate(() => ({
          langBtn: document.getElementById('btn-lang-toggle')?.textContent?.trim(),
          uciBtn: document.getElementById('btn-uci-strength')?.textContent?.trim(),
          trainingPressed: document.getElementById('btn-training-mode')?.getAttribute('aria-pressed'),
        }));
        assert.equal(fallback.langBtn, 'DE | EN');
        assert.ok(fallback.uciBtn?.includes('1400 Elo'));
        assert.equal(fallback.trainingPressed, 'false');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E1-05',
      tier: 2,
      phase: '1-3',
      feature: 'E1',
      name: 'Clicking outside chessboard in empty cathedral space clears selection safely',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await ensureOverheadCamera(page);
        await clickBoardSquare(page, 'e2', { keepCamera: true });
        await page.clickAt(40, 200);
        const state = await page.evaluate(() => window.wizardChess.getState());
        assert.equal(state.selectedSquare, null);
        assert.equal(state.highlightMeshCount, 0);
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E2 Boundary & Corner Cases
    // =========================================================================
    {
      id: 'T2-E2-01',
      tier: 2,
      phase: '1-3',
      feature: 'E2',
      name: 'Extreme Elo slider values (200, 4000) clamp safely to [400, 3000]',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-elo-slider');

        await page.setRangeSlider('#uci-elo-slider', 200);
        assert.equal(
          await page.evaluate(() => JSON.parse(localStorage.getItem('wizard_chess_uci_strength')).elo),
          400
        );

        await page.setRangeSlider('#uci-elo-slider', 4000);
        assert.equal(
          await page.evaluate(() => JSON.parse(localStorage.getItem('wizard_chess_uci_strength')).elo),
          3000
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E2-02',
      tier: 2,
      phase: '1-3',
      feature: 'E2',
      name: 'Resetting board while AI is thinking cancels pending search cleanly',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.evaluate(() => {
          document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[6]?.click();
        });
        await page.pressKey('Escape');

        await page.evaluate(() => window.wizardChess.executeChessMove(6, 4, 4, 4));
        await page.evaluate(() => window.wizardChess.stepBy(2.5, 50));
        await page.waitFor(
          () => document.getElementById('turn-text')?.textContent?.includes('UCI denkt'),
          { timeoutMs: 3000 }
        );
        await page.clickSelector('#btn-reset');
        await sleep(1200);

        const uci = await page.evaluate(() => window.wizardChess.getHistoryUci());
        assert.equal(uci.length, 0, `Stale AI move applied after reset: ${JSON.stringify(uci)}`);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E2-03',
      tier: 2,
      phase: '1-3',
      feature: 'E2',
      name: 'UCI strength popover closes via Escape key and outside pointer click',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.pressKey('Escape');
        await page.waitFor(() => !document.getElementById('uci-strength-panel'));

        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.clickAt(50, 400);
        await page.waitFor(() => !document.getElementById('uci-strength-panel'));
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E2-04',
      tier: 2,
      phase: '1-3',
      feature: 'E2',
      name: 'Clicking AI Move on a game-over position is a safe no-op',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await executeDeterministicSequence(page, [
          ['f2', 'f3'],
          ['e7', 'e5'],
          ['g2', 'g4'],
          ['d8', 'h4'],
        ]);
        await page.waitForSelector('#checkmate-overlay.visible');
        await page.clickSelector('#btn-checkmate-dismiss');
        await page.clickSelector('#btn-ai-move');
        await sleep(300);
        assert.equal((await page.evaluate(() => window.wizardChess.getHistoryUci())).length, 4);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E2-05',
      tier: 2,
      phase: '1-3',
      feature: 'E2',
      name: 'Custom Elo 1950 persists across page reload and re-highlights in panel',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-elo-slider');
        await page.setRangeSlider('#uci-elo-slider', 1950);

        await page.reload();
        await waitForAppReady(page);
        assert.ok(
          (await page.evaluate(() => document.getElementById('btn-uci-strength')?.textContent))?.includes('1950 Elo')
        );
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        assert.equal(
          await page.evaluate(() => document.querySelector('#uci-strength-panel .uci-slider-value')?.textContent?.trim()),
          '1950 Elo'
        );
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E3 Boundary & Corner Cases
    // =========================================================================
    {
      id: 'T2-E3-01',
      tier: 2,
      phase: '1-3',
      feature: 'E3',
      name: 'Cancelling PromotionModal via Cancel button or Escape aborts move cleanly',
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
        const fenBefore = await page.evaluate(() => window.wizardChess.getFen());

        await selectAndClickMove(page, 'a7', 'a8', { expectExecuted: false });
        await page.waitForSelector('.promotion-modal .promotion-footer button');
        await page.clickSelector('.promotion-modal .promotion-footer button');
        await page.waitFor(() => !document.querySelector('.promotion-modal'));
        assert.equal(await page.evaluate(() => window.wizardChess.getFen()), fenBefore);

        await selectAndClickMove(page, 'a7', 'a8', { expectExecuted: false, keepCamera: true });
        await page.waitForSelector('.promotion-modal');
        await page.pressKey('Escape');
        await page.waitFor(() => !document.querySelector('.promotion-modal'));
        assert.equal(await page.evaluate(() => window.wizardChess.getFen()), fenBefore);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E3-02',
      tier: 2,
      phase: '1-3',
      feature: 'E3',
      name: 'Castling through an attacked square (f1 attacked by f8 rook) is rejected',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1', hasMoved: false },
            { type: 'rook', color: 'w', sq: 'h1', hasMoved: false },
            { type: 'king', color: 'b', sq: 'a8' },
            { type: 'rook', color: 'b', sq: 'f8' },
          ],
          'w'
        );
        const fenBefore = await page.evaluate(() => window.wizardChess.getFen());
        await selectAndClickMove(page, 'e1', 'g1', { expectExecuted: false });
        await sleep(150);
        assert.equal(await page.evaluate(() => window.wizardChess.getFen()), fenBefore);
        assert.equal((await page.evaluate(() => window.wizardChess.getHistoryUci())).length, 0);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E3-03',
      tier: 2,
      phase: '1-3',
      feature: 'E3',
      name: 'Insufficient material (K+N vs K) immediately triggers draw overlay',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'knight', color: 'w', sq: 'e2' },
            { type: 'king', color: 'b', sq: 'e8' },
          ],
          'w'
        );
        await page.waitForSelector('#checkmate-overlay.visible', { timeoutMs: 3000 });
        const info = await page.evaluate(() => ({
          outcome: window.wizardChess.getGameStatus().outcome,
          sub: document.getElementById('checkmate-subtitle')?.textContent?.trim(),
        }));
        assert.equal(info.outcome, 'draw_material');
        assert.equal(info.sub, 'Remis (Unzureichendes Material)');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E3-04',
      tier: 2,
      phase: '1-3',
      feature: 'E3',
      name: 'Threefold repetition ends game with draw_repetition outcome and localized subtitle',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await executeDeterministicSequence(page, [
          ['g1', 'f3'],
          ['g8', 'f6'],
          ['f3', 'g1'],
          ['f6', 'g8'],
          ['g1', 'f3'],
          ['g8', 'f6'],
          ['f3', 'g1'],
          ['f6', 'g8'],
        ]);
        await page.waitForSelector('#checkmate-overlay.visible', { timeoutMs: 3000 });
        const info = await page.evaluate(() => ({
          outcome: window.wizardChess.getGameStatus().outcome,
          sub: document.getElementById('checkmate-subtitle')?.textContent?.trim(),
        }));
        assert.equal(info.outcome, 'draw_repetition');
        assert.equal(info.sub, 'Remis (Dreifache Stellungswiederholung)');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E3-05',
      tier: 2,
      phase: '1-3',
      feature: 'E3',
      name: 'Friendly-fire capture is blocked and Dismiss hides checkmate banner without resetting board',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        const res = await page.evaluate(() => window.wizardChess.executeChessMove(7, 3, 6, 3));
        assert.equal(res, false);

        await executeDeterministicSequence(page, [
          ['f2', 'f3'],
          ['e7', 'e5'],
          ['g2', 'g4'],
          ['d8', 'h4'],
        ]);
        await page.waitForSelector('#checkmate-overlay.visible');
        await page.clickSelector('#btn-checkmate-dismiss');
        await page.waitFor(() => !document.getElementById('checkmate-overlay')?.classList.contains('visible'));
        assert.equal((await page.evaluate(() => window.wizardChess.getHistoryUci())).length, 4);
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E4 Boundary & Corner Cases
    // =========================================================================
    {
      id: 'T2-E4-01',
      tier: 2,
      phase: '1-3',
      feature: 'E4',
      name: 'Invalid language value in localStorage defaults cleanly to German',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.evaluate(() => localStorage.setItem('wizard_chess_language', 'es'));
        await page.reload();
        await waitForAppReady(page);
        assert.equal(
          await page.evaluate(() => document.getElementById('btn-lang-toggle')?.textContent?.trim()),
          'DE | EN'
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E4-02',
      tier: 2,
      phase: '1-3',
      feature: 'E4',
      name: 'Toggling language updates UCI preset labels and button readout cleanly across DE and EN',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.evaluate(() => {
          document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[3]?.click();
        });
        assert.equal(
          await page.evaluate(() => document.querySelector('#uci-strength-panel .uci-preset-btn.active .uci-preset-name')?.textContent?.trim()),
          'Experte'
        );
        await page.clickSelector('#btn-lang-toggle');
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        assert.equal(
          await page.evaluate(() => document.querySelector('#uci-strength-panel .uci-preset-btn.active .uci-preset-name')?.textContent?.trim()),
          'Expert'
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E4-03',
      tier: 2,
      phase: '1-3',
      feature: 'E4',
      name: 'Toggling language while Training Coach panel is open updates buttons and ARIA labels live',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.setViewport(1600, 900);
        try {
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
          await page.waitForSelector('#training-coach-panel');

          assert.equal(
            await page.evaluate(() => document.querySelector('#training-coach-panel .coach-card-actions button')?.textContent?.trim()),
            'Anderen Zug wählen'
          );
          await page.clickSelector('#btn-lang-toggle');
          assert.equal(
            await page.evaluate(() => document.querySelector('#training-coach-panel .coach-card-actions button')?.textContent?.trim()),
            'Choose Another Move'
          );
          assert.equal(
            await page.evaluate(() => document.getElementById('training-coach-panel')?.getAttribute('aria-label')),
            'UCI Training Coach'
          );
          page.assertCleanLogs();
        } finally {
          await page.setViewport(1280, 800);
        }
      },
    },
    {
      id: 'T2-E4-04',
      tier: 2,
      phase: '1-3',
      feature: 'E4',
      name: 'Toggling language while Lexicon Demo Bar is active updates step counter and buttons live',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('.lexicon-detail-head button.checkmate-btn');
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');

        assert.equal(
          await page.evaluate(() => document.querySelector('.lexicon-demo-step')?.textContent?.trim()),
          'Zug 0/9'
        );
        await page.clickSelector('#btn-lang-toggle');
        assert.equal(
          await page.evaluate(() => document.querySelector('.lexicon-demo-step')?.textContent?.trim()),
          'Move 0/9'
        );
        assert.equal(
          await page.evaluate(() => document.querySelector('.lexicon-demo-actions button:nth-child(5)')?.textContent?.trim()),
          'Exit'
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E4-05',
      tier: 2,
      phase: '1-3',
      feature: 'E4',
      name: 'Checkmate overlay renders localized title and action buttons in English after language switch',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lang-toggle');
        await executeDeterministicSequence(page, [
          ['f2', 'f3'],
          ['e7', 'e5'],
          ['g2', 'g4'],
          ['d8', 'h4'],
        ]);
        await page.waitForSelector('#checkmate-overlay.visible');
        const enUi = await page.evaluate(() => ({
          title: document.getElementById('checkmate-title')?.textContent?.trim(),
          replay: document.getElementById('btn-checkmate-replay')?.textContent?.trim(),
          newGame: document.getElementById('btn-checkmate-newgame')?.textContent?.trim(),
          dismiss: document.getElementById('btn-checkmate-dismiss')?.textContent?.trim(),
        }));
        assert.equal(enUi.title, 'Checkmate');
        assert.equal(enUi.replay, 'Replay King Fall');
        assert.equal(enUi.newGame, 'New Game');
        assert.equal(enUi.dismiss, 'Dismiss');
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E5 Boundary & Corner Cases
    // =========================================================================
    {
      id: 'T2-E5-01',
      tier: 2,
      phase: '1-3',
      feature: 'E5',
      name: 'Clicking boxed-in piece with 0 legal moves triggers no_moves coach diagnostic without Play Anyway',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-training-mode');
        await ensureOverheadCamera(page);
        await clickBoardSquare(page, 'a1', { keepCamera: true });
        await page.waitForSelector('#training-coach-panel', { timeoutMs: 8000 });
        const info = await page.evaluate(() => ({
          title: document.querySelector('#training-coach-panel .coach-card-title')?.textContent?.trim(),
          hasPlayAnyway: Boolean(document.querySelector('#training-coach-panel .coach-card-actions button.secondary')),
        }));
        assert.ok(info.title?.includes('Keine legalen Züge'), `Unexpected title: ${info.title}`);
        assert.equal(info.hasPlayAnyway, false);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E5-02',
      tier: 2,
      phase: '1-3',
      feature: 'E5',
      name: 'Castling when rights are lost produces specific castling rule diagnosis',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-training-mode');
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1', hasMoved: true },
            { type: 'rook', color: 'w', sq: 'h1', hasMoved: false },
            { type: 'king', color: 'b', sq: 'e8' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'e1', 'g1', { expectExecuted: false });
        await page.waitForSelector('#training-coach-panel.verdict-illegal', { timeoutMs: 8000 });
        const title = await page.evaluate(
          () => document.querySelector('#training-coach-panel .coach-card-title')?.textContent?.trim()
        );
        assert.equal(title, 'Rochaderecht verloren');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E5-03',
      tier: 2,
      phase: '1-3',
      feature: 'E5',
      name: 'Good move (1.e4) displays green coach toast without blocking and auto-dismisses',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-training-mode');
        await selectAndClickMove(page, 'e2', 'e4');
        await page.waitForSelector('.coach-floating-status.good', { timeoutMs: 8000 });
        const toast = await page.evaluate(
          () => document.querySelector('.coach-floating-status.good')?.textContent?.trim()
        );
        assert.ok(toast && toast.length > 0, 'Expected non-empty good-move toast');
        await page.waitFor(() => !document.querySelector('.coach-floating-status.good'), { timeoutMs: 6000 });
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E5-04',
      tier: 2,
      phase: '1-3',
      feature: 'E5',
      name: 'Hovering alternative updates 3D highlights and toggling Training Mode OFF cancels prompt cleanly',
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
        await page.waitForSelector('#training-coach-panel .coach-alt-item', { timeoutMs: 12000 });

        const callsBefore = (await getCoachSpy(page)).calls.length;
        await page.hoverSelector('#training-coach-panel .coach-alt-item');
        await sleep(80);
        const callsAfter = (await getCoachSpy(page)).calls.length;
        assert.ok(callsAfter > callsBefore, 'Expected hover on alternative to call showCoachHighlights');

        await page.clickSelector('#btn-training-mode');
        await page.waitFor(() => !document.getElementById('training-coach-panel'));
        assert.ok((await getCoachSpy(page)).clears >= 1, 'Expected clearCoachHighlights on Training OFF');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E5-05',
      tier: 2,
      phase: '1-3',
      feature: 'E5',
      name: 'Pressing Escape while Coach panel is open dismisses review and clears 3D highlights',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await installCoachSpy(page);
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
        await page.waitForSelector('#training-coach-panel');
        const clearsBefore = (await getCoachSpy(page)).clears;

        await page.pressKey('Escape');
        await page.waitFor(() => !document.getElementById('training-coach-panel'));
        assert.ok((await getCoachSpy(page)).clears > clearsBefore);
        page.assertCleanLogs();
      },
    },

    // =========================================================================
    // E6 Boundary & Corner Cases
    // =========================================================================
    {
      id: 'T2-E6-01',
      tier: 2,
      phase: '1-3',
      feature: 'E6',
      name: 'Demo step boundary states: Prev disabled at 0, Next & Auto-Play disabled at end',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('.lexicon-tab-btn');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[1]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        await page.typeText('input.lexicon-search', 'Grundreihenmatt');
        await page.clickSelector('.lexicon-list-item');
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');

        const startDisabled = await page.evaluate(() => ({
          prev: document.querySelector('.lexicon-demo-actions button:nth-child(1)')?.disabled,
          auto: document.querySelector('.lexicon-demo-actions button:nth-child(2)')?.disabled,
          next: document.querySelector('.lexicon-demo-actions button:nth-child(3)')?.disabled,
        }));
        assert.equal(startDisabled.prev, true);
        assert.equal(startDisabled.auto, false);
        assert.equal(startDisabled.next, false);

        await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
        await page.waitFor(
          () => window.wizardChess.getState().scriptCursor === 1 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 5000 }
        );
        const endState = await page.evaluate(() => ({
          prev: document.querySelector('.lexicon-demo-actions button:nth-child(1)')?.disabled,
          auto: document.querySelector('.lexicon-demo-actions button:nth-child(2)')?.disabled,
          next: document.querySelector('.lexicon-demo-actions button:nth-child(3)')?.disabled,
          desc: document.querySelector('.lexicon-demo-desc')?.textContent?.trim(),
        }));
        assert.equal(endState.prev, false);
        assert.equal(endState.auto, true);
        assert.equal(endState.next, true);
        assert.ok(endState.desc?.includes('Alle Züge der Demo gezeigt'), `Desc: ${endState.desc}`);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E6-02',
      tier: 2,
      phase: '1-3',
      feature: 'E6',
      name: 'Demo Auto-Play advances automatically and Pause halts advance cleanly',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('.lexicon-detail-head button.checkmate-btn');
        await page.typeText('input.lexicon-search', '');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[0]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');

        await page.clickSelector('.lexicon-demo-actions button:nth-child(2)');
        await page.waitFor(
          () => window.wizardChess.getState().scriptCursor >= 1 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 6000 }
        );
        await page.clickSelector('.lexicon-demo-actions button:nth-child(2)');
        await page.waitFor(
          () => !window.wizardChess.getState().isAnimatingMove && !window.wizardChess.getState().preMoveHighlightActive,
          { timeoutMs: 5000 }
        );
        const cursorAtPause = await page.evaluate(() => window.wizardChess.getState().scriptCursor);
        await sleep(1700);
        const cursorAfterWait = await page.evaluate(() => window.wizardChess.getState().scriptCursor);
        assert.equal(cursorAfterWait, cursorAtPause);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E6-03',
      tier: 2,
      phase: '1-3',
      feature: 'E6',
      name: 'Manual board move during Lexicon Demo exits scripted mode and hides demo bar',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('#lexicon-modal-title');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[0]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        await page.typeText('input.lexicon-search', '');
        await page.waitForSelector('.lexicon-detail-head button.checkmate-btn');
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');

        await selectAndClickMove(page, 'd2', 'd4');
        await page.waitFor(() => !document.getElementById('lexicon-demo-bar'));
        const state = await page.evaluate(() => window.wizardChess.getState());
        assert.equal(state.scriptedGameActive, false);
        assert.equal(state.scriptDeviated, true);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E6-04',
      tier: 2,
      phase: '1-3',
      feature: 'E6',
      name: 'Uncommon opening (1.h3) leaves #opening-badge absent and badge is hidden during active demo',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await executeDeterministicSequence(page, [['h2', 'h3']]);
        assert.equal(await page.evaluate(() => Boolean(document.getElementById('opening-badge'))), false);

        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('#lexicon-modal-title');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[0]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        await page.typeText('input.lexicon-search', '');
        await page.waitForSelector('.lexicon-detail-head button.checkmate-btn');
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');
        await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
        await page.waitFor(
          () => window.wizardChess.getState().scriptCursor === 1 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 5000 }
        );
        assert.equal(await page.evaluate(() => Boolean(document.getElementById('opening-badge'))), false);
        page.assertCleanLogs();
      },
    },
    {
      id: 'T2-E6-05',
      tier: 2,
      phase: '1-3',
      feature: 'E6',
      name: 'Lexicon closes on Escape or backdrop click and whitespace/case-insensitive search matches ECO codes',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('input.lexicon-search');
        await page.typeText('input.lexicon-search', '  c65  ');
        const matches = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.lexicon-list-item .lexicon-eco-badge')).map((el) =>
            el.textContent?.trim()
          )
        );
        assert.deepEqual(matches, ['C65']);

        await page.pressKey('Escape');
        await page.waitFor(() => !document.getElementById('lexicon-modal-title'));

        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('#lexicon-modal-title');
        await page.clickAt(15, 15);
        await page.waitFor(() => !document.getElementById('lexicon-modal-title'));
        page.assertCleanLogs();
      },
    },
  ];
}
