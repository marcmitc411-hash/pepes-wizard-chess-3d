import assert from 'node:assert/strict';
import {
  acquireTestPage,
  executeDeterministicSequence,
  selectAndClickMove,
  setupScenario,
  waitForAiResponse,
  waitForAppReady,
  waitForStockfishReady,
} from '../lib/chessHelpers.mjs';

export function getTests() {
  return [
    {
      id: 'T3-01',
      tier: 3,
      phase: '1-3',
      feature: 'E2+E3',
      name: 'Pairwise E2+E3: Custom UCI strengths (1000 Casual & 2200 Master) with FIDE castling & promotion',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.evaluate(() => {
          document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[1]?.click();
        });
        await page.pressKey('Escape');

        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1', hasMoved: false },
            { type: 'rook', color: 'w', sq: 'h1', hasMoved: false },
            { type: 'king', color: 'b', sq: 'e8', hasMoved: false },
            { type: 'pawn', color: 'b', sq: 'a7' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'e1', 'g1');
        await waitForAiResponse(page, 0, 'w', 20000);
        assert.equal((await page.evaluate(() => window.wizardChess.getHistorySan()))[0], 'O-O');

        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.evaluate(() => {
          document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[4]?.click();
        });
        await page.pressKey('Escape');

        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'pawn', color: 'w', sq: 'a7' },
            { type: 'king', color: 'b', sq: 'h8' },
            { type: 'pawn', color: 'b', sq: 'g7' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'a7', 'a8', { promoChoiceIndex: 0 });
        await waitForAiResponse(page, 0, 'w', 20000);
        assert.equal((await page.evaluate(() => window.wizardChess.getHistoryUci()))[0], 'a7a8q');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T3-02',
      tier: 3,
      phase: '1-3',
      feature: 'E4+E5',
      name: 'Pairwise E4+E5: Localized Coach rule & tactical blunder diagnostics in EN and DE',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.setViewport(1600, 900);
        try {
          await page.clickSelector('#btn-lang-toggle');
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
          await page.waitForSelector('#training-coach-panel.verdict-illegal');
          assert.equal(
            await page.evaluate(() => document.querySelector('#training-coach-panel .coach-verdict-badge')?.textContent?.trim()),
            'Illegal Move'
          );
          await page.pressKey('Escape');

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
          assert.equal(
            await page.evaluate(() => document.querySelector('#training-coach-panel .coach-verdict-badge')?.textContent?.trim()),
            'Blunder'
          );
          await page.clickSelector('#btn-lang-toggle');
          assert.equal(
            await page.evaluate(() => document.querySelector('#training-coach-panel .coach-verdict-badge')?.textContent?.trim()),
            'Grober Patzer'
          );
          page.assertCleanLogs();
        } finally {
          await page.setViewport(1280, 800);
        }
      },
    },
    {
      id: 'T3-03',
      tier: 3,
      phase: '1-3',
      feature: 'E4+E6',
      name: 'Pairwise E4+E6: Bilingual Lexicon browsing, Sicilian Defense 3D demo, and live opening badge',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx);
        await page.clickSelector('#btn-lang-toggle');
        await page.clickSelector('#btn-lexicon');
        await page.waitForSelector('#lexicon-modal-title');
        await page.evaluate(() => {
          document.querySelectorAll('.lexicon-tab-btn')[0]?.click();
          document.querySelectorAll('.lexicon-filters .lexicon-chip')[0]?.click();
        });
        await page.typeText('input.lexicon-search', '');
        assert.equal(
          await page.evaluate(() => document.querySelector('.lexicon-tab-btn')?.textContent?.trim()),
          'Openings (16)'
        );
        await page.typeText('input.lexicon-search', 'Sicilian');
        await page.clickSelector('.lexicon-list-item');
        await page.clickSelector('.lexicon-detail-head button.checkmate-btn');
        await page.waitForSelector('#lexicon-demo-bar');
        assert.equal(
          await page.evaluate(() => document.querySelector('.lexicon-demo-title')?.textContent?.trim()),
          'Sicilian Defense'
        );

        await page.clickSelector('#btn-lang-toggle');
        assert.ok(
          (await page.evaluate(() => document.querySelector('.lexicon-demo-step')?.textContent))?.startsWith('Zug ')
        );
        await page.clickSelector('.lexicon-demo-actions button:nth-child(5)');

        await executeDeterministicSequence(page, [
          ['e2', 'e4'],
          ['c7', 'c5'],
        ]);
        await page.waitForSelector('#opening-badge');
        assert.ok(
          (await page.evaluate(() => document.getElementById('opening-badge')?.textContent))?.includes('Sizilianische Verteidigung')
        );
        await page.clickSelector('#btn-lang-toggle');
        assert.ok(
          (await page.evaluate(() => document.getElementById('opening-badge')?.textContent))?.includes('Sicilian Defense')
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T3-04',
      tier: 3,
      phase: '1-3',
      feature: 'E5+E3',
      name: 'Pairwise E5+E3: Underpromotion blunder triggers Training Coach review before completing promotion',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-training-mode');
        await setupScenario(
          page,
          [
            { type: 'king', color: 'w', sq: 'e1' },
            { type: 'pawn', color: 'w', sq: 'a7' },
            { type: 'king', color: 'b', sq: 'h8' },
          ],
          'w'
        );
        await selectAndClickMove(page, 'a7', 'a8', { promoChoiceIndex: 2, expectExecuted: false });
        await page.waitForSelector('#training-coach-panel', { timeoutMs: 12000 });
        const moveChip = await page.evaluate(
          () => document.querySelector('#training-coach-panel .coach-move-chip')?.textContent?.trim()
        );
        assert.ok(moveChip?.includes('=B'), `Expected underpromotion chip =B, got ${moveChip}`);

        await page.clickSelector('#training-coach-panel .coach-card-actions button.secondary');
        await page.waitFor(
          () => window.wizardChess.getHistoryUci()[0] === 'a7a8b' && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 8000 }
        );
        page.assertCleanLogs();
      },
    },
    {
      id: 'T3-05',
      tier: 3,
      phase: '1-3',
      feature: 'E6+E3',
      name: 'Pairwise E6+E3: Back-Rank Mate strategy demo steps to Rd8# and triggers FIDE checkmate overlay',
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

        await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
        await page.waitForSelector('#checkmate-overlay.visible', { timeoutMs: 6000 });
        const status = await page.evaluate(() => window.wizardChess.getGameStatus());
        assert.equal(status.outcome, 'checkmate');
        assert.equal(status.winner, 'w');
        page.assertCleanLogs();
      },
    },
    {
      id: 'T3-06',
      tier: 3,
      phase: '1-3',
      feature: 'E2+E4+E6',
      name: 'Pairwise E2+E4+E6: UCI Expert + EN persistence across reload, then Italian demo Play from Here vs Novice AI',
      fn: async (ctx) => {
        const page = await acquireTestPage(ctx, { waitStockfish: true });
        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.evaluate(() => {
          document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[3]?.click();
        });
        await page.pressKey('Escape');
        await page.clickSelector('#btn-lang-toggle');

        await page.reload();
        await waitForAppReady(page);
        await waitForStockfishReady(page);
        assert.equal(
          await page.evaluate(() => document.getElementById('btn-uci-strength')?.textContent?.trim()),
          'UCI: 1800 Elo'
        );
        assert.equal(
          await page.evaluate(() => document.getElementById('btn-lang-toggle')?.textContent?.trim()),
          'EN | DE'
        );

        await page.clickSelector('#btn-uci-strength');
        await page.waitForSelector('#uci-strength-panel');
        await page.evaluate(() => {
          document.querySelectorAll('#uci-strength-panel .uci-preset-btn')[0]?.click();
        });
        await page.pressKey('Escape');

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

        for (let step = 1; step <= 4; step++) {
          await page.clickSelector('.lexicon-demo-actions button:nth-child(3)');
          await page.waitFor(
            (target) => window.wizardChess.getState().scriptCursor === target && !window.wizardChess.getState().isAnimatingMove,
            { timeoutMs: 5000 },
            step
          );
        }

        await page.clickSelector('.lexicon-demo-actions button:nth-child(4)');
        await page.waitFor(() => !document.getElementById('lexicon-demo-bar'));
        assert.deepEqual(
          await page.evaluate(() => window.wizardChess.getHistoryUci()),
          ['e2e4', 'e7e5', 'g1f3', 'b8c6']
        );

        await page.clickSelector('#btn-ai-move');
        await page.waitFor(
          () => window.wizardChess.getHistoryUci().length === 5 && !window.wizardChess.getState().isAnimatingMove,
          { timeoutMs: 20000 }
        );
        page.assertCleanLogs();
      },
    },
  ];
}
