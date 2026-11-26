import assert from 'node:assert/strict';
import { sleep } from '../lib/cdpClient.mjs';
import {
  acquireTestPage,
  ensureOverheadCamera,
  executeDeterministicSequence,
  getCoachSpy,
  installCoachSpy,
  sampleCanvasColors,
  selectAndClickMove,
  setupScenario,
  waitForAiResponse,
  waitForAppReady,
  waitForMoveIdle,
  waitForStockfishReady,
} from '../lib/chessHelpers.mjs';

export function getTests() {
  return [
    {
      id: 'T4-01',
      tier: 4,
      phase: '1-3',
      feature: 'E1+E2+E3',
      name: 'Scenario T4-01: Full match vs Novice AI, checkmate overlay, replay king fall, and clean new game reset',
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
        assert.equal((await page.evaluate(() => window.wizardChess.getHistoryUci())).length, 2);

        await setupScenario(
          page,
          [
            { type: 'king', color: 'b', sq: 'a8' },
            { type: 'king', color: 'w', sq: 'a6' },
            { type: 'queen', color: 'w', sq: 'd5' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'd5', 'b7');
        await page.waitForSelector('#checkmate-overlay.visible', { timeoutMs: 6000 });
        assert.equal(
          await page.evaluate(() => document.getElementById('checkmate-title')?.textContent?.trim()),
          'Schachmatt'
        );

        await page.clickSelector('#btn-checkmate-replay');
        await sleep(600);
        await page.waitForSelector('#checkmate-overlay.visible', { timeoutMs: 4000 });

        await page.clickSelector('#btn-checkmate-newgame');
        await page.waitFor(() => !document.getElementById('checkmate-overlay')?.classList.contains('visible'));
        assert.equal(
          await page.evaluate(() => window.wizardChess.getFen()),
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T4-02',
      tier: 4,
      phase: '1-3',
      feature: 'E3+E5',
      name: 'Scenario T4-02: Beginner coaching session (illegal diagnostic -> blunder 3D arrows -> hover -> play alt -> good move)',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await installCoachSpy(page);
        await page.clickSelector('#btn-training-mode');

        await selectAndClickMove(page, 'e2', 'e1', { expectExecuted: false });
        await page.waitForSelector('#training-coach-panel.verdict-illegal', { timeoutMs: 8000 });
        await page.clickSelector('#training-coach-panel .uci-close-btn');
        await page.waitFor(() => !document.getElementById('training-coach-panel'));

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

        const pixels = await sampleCanvasColors(page);
        assert.ok(pixels.redArrowPixels > 8 && pixels.greenArrowPixels > 8, `Expected red/green arrows: ${JSON.stringify(pixels)}`);

        await page.hoverSelector('#training-coach-panel .coach-alt-item');
        await sleep(60);
        await page.clickSelector('#training-coach-panel .coach-alt-play-btn');
        await page.waitFor(
          () => window.wizardChess.getHistoryUci().length >= 1 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 10000 }
        );

        await page.clickSelector('#btn-reset');
        await waitForMoveIdle(page);
        await selectAndClickMove(page, 'e2', 'e4');
        await page.waitForSelector('.coach-floating-status.good', { timeoutMs: 8000 });
        page.assertCleanLogs();
      },
    },
    {
      id: 'T4-03',
      tier: 4,
      phase: '1-3',
      feature: 'E2+E3+E6',
      name: 'Scenario T4-03: Opening study loop (Italian Game badge -> Lexicon demo -> Ruy Lopez Play from Here vs AI)',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await executeDeterministicSequence(page, [
          ['e2', 'e4'],
          ['e7', 'e5'],
          ['g1', 'f3'],
          ['b8', 'c6'],
          ['f1', 'c4'],
        ]);
        await page.waitForSelector('#opening-badge');
        assert.ok(
          (await page.evaluate(() => document.getElementById('opening-badge')?.textContent))?.includes('C50')
        );

        await page.clickSelector('#opening-badge');
        await page.waitForSelector('.lexicon-detail-title');
        assert.equal(
          await page.evaluate(() => document.querySelector('.lexicon-detail-title')?.textContent?.trim()),
          'Italienische Partie'
        );

        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');
        await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
        await page.waitFor(
          () => window.wizardChess.getState().scriptCursor === 1 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 5000 }
        );
        await page.clickSelector('.lexicon-demo-actions button:nth-child(1)');
        await page.waitFor(() => window.wizardChess.getState().scriptCursor === 0);

        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('input.lexicon-search');
        await page.typeText('input.lexicon-search', 'C65');
        await page.clickSelector('.lexicon-list-item');
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');
        for (let s = 1; s <= 3; s++) {
          await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
          await page.waitFor(
            (t) => window.wizardChess.getState().scriptCursor === t && !window.wizardChess.getState().isAnimatingMove,
            { timeoutMs: 5000 },
            s
          );
        }
        await page.clickSelector('.lexicon-demo-actions button:nth-child(4)');
        await page.waitFor(() => !document.getElementById('lexicon-demo-bar'));
        await page.clickSelector('#btn-ai-move');
        await page.waitFor(
          () => window.wizardChess.getHistoryUci().length === 4 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 20000 }
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T4-04',
      tier: 4,
      phase: '1-3',
      feature: 'E1+E2+E3+E4+E5+E6',
      name: 'Scenario T4-04: Bilingual EN + 1600 Elo + Training persistence across reload, Sicilian badge & Queen promotion',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-lang-toggle');
        await page.clickSelector('#btn-training-mode');
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-elo-slider');
        await page.setRangeSlider('#uci-elo-slider', 1600);
        await page.pressKey('Escape');

        await page.reload();
        await waitForAppReady(page);
        await waitForStockfishReady(page);

        const persisted = await page.evaluate(() => ({
          lang: document.getElementById('btn-lang-toggle')?.textContent?.trim(),
          uci: document.getElementById('btn-uci-strength')?.textContent?.trim(),
          training: document.getElementById('btn-training-mode')?.getAttribute('aria-pressed'),
        }));
        assert.equal(persisted.lang, 'EN | DE');
        assert.equal(persisted.uci, 'UCI: 1600 Elo');
        assert.equal(persisted.training, 'true');

        await executeDeterministicSequence(page, [
          ['e2', 'e4'],
          ['c7', 'c5'],
        ]);
        await page.waitForSelector('#opening-badge');
        assert.ok(
          (await page.evaluate(() => document.getElementById('opening-badge')?.textContent))?.includes('Sicilian Defense')
        );

        await page.clickSelector('#btn-training-mode');
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'pawn', color: 'w', sq: 'c7' },
            { type: 'king', color: 'b', sq: 'h8' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'c7', 'c8', { promoChoiceIndex: 0 });
        assert.equal((await page.evaluate(() => window.wizardChess.getHistoryUci()))[0], 'c7c8q');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T4-05',
      tier: 4,
      phase: '1-3',
      feature: 'E1+E5+E6',
      name: 'Scenario T4-05: Multi-feature stress journey (Cinematic UI, 4 cameras, Escape modals, Fork 3D arrows, Reset)',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await installCoachSpy(page);

        await page.pressKey('h');
        await page.waitFor(() => document.body.classList.contains('cinematic-ui-hidden'));
        await page.pressKey('h');
        await page.waitFor(() => !document.body.classList.contains('cinematic-ui-hidden'));

        for (const btn of ['#btn-cam-top', '#btn-cam-side', '#btn-cam-wide', '#btn-cam-player']) {
          await page.clickSelector(btn);
          await sleep(250);
        }

        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.pressKey('Escape');
        await page.waitFor(() => !document.getElementById('uci-strength-panel'));

        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('#lexicon-modal-title');
        await page.typeText('input.lexicon-search', '');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[1]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');
        await ensureOverheadCamera(page);
        await sleep(80);
        const forkPixels = await sampleCanvasColors(page);
        assert.ok(
          forkPixels.greenArrowPixels > 8 && forkPixels.redArrowPixels > 8,
          `Expected green+red 3D arrows in Fork demo, got ${JSON.stringify(forkPixels)}`
        );

        await page.clickSelector('#btn-reset');
        await page.waitFor(() => !document.getElementById('lexicon-demo-bar'));
        assert.equal(
          await page.evaluate(() => window.wizardChess.getFen()),
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        );
        page.assertCleanLogs();
      },
    },
  ];
}
