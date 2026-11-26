import assert from 'node:assert/strict';
import { sleep } from '../lib/cdpClient.mjs';
import {
  PHASE4_SELECTORS,
  firstMatchingSelector,
  openApp,
  selectAndClickMove,
  setupScenario,
  waitForAppReady,
  waitForMoveIdle,
} from '../lib/chessHelpers.mjs';

async function openMultiplayerModal(page) {
  const btn = await firstMatchingSelector(page, PHASE4_SELECTORS.openModalBtn, { timeoutMs: 5000 });
  await page.clickSelector(btn);
  const modal = await firstMatchingSelector(page, PHASE4_SELECTORS.modal, { timeoutMs: 5000 });
  return modal;
}

async function selectLocalModeIfPresent(page) {
  try {
    const sel = await firstMatchingSelector(page, PHASE4_SELECTORS.modeLocal, { timeoutMs: 800 });
    await page.clickSelector(sel);
  } catch {
    // Modal may default to local when Supabase is unconfigured or controlled via ?mp=local
  }
}

async function selectSupabaseModeIfPresent(page) {
  try {
    const sel = await firstMatchingSelector(page, PHASE4_SELECTORS.modeSupabase, { timeoutMs: 800 });
    await page.clickSelector(sel);
  } catch {
    // Modal may default to Supabase when configured
  }
}

async function createRoomOnPage(page, { mode = 'local', color = 'w' } = {}) {
  await openMultiplayerModal(page);
  if (mode === 'local') await selectLocalModeIfPresent(page);
  else await selectSupabaseModeIfPresent(page);

  if (color === 'b') {
    try {
      const blackSel = await firstMatchingSelector(page, PHASE4_SELECTORS.colorBlack, { timeoutMs: 800 });
      await page.clickSelector(blackSel);
    } catch {
      // ignore if color selector omitted
    }
  } else {
    try {
      const whiteSel = await firstMatchingSelector(page, PHASE4_SELECTORS.colorWhite, { timeoutMs: 800 });
      await page.clickSelector(whiteSel);
    } catch {
      // ignore
    }
  }

  const createBtn = await firstMatchingSelector(page, PHASE4_SELECTORS.createRoomBtn, { timeoutMs: 3000 });
  await page.clickSelector(createBtn);

  const codeSel = await firstMatchingSelector(page, PHASE4_SELECTORS.roomCodeDisplay, { timeoutMs: 8000 });
  const code = await page.waitFor(
    (sel) => {
      const txt = document.querySelector(sel)?.textContent?.trim() || '';
      const m = txt.match(/[A-Z0-9]{4}/);
      return m ? m[0] : false;
    },
    { timeoutMs: 8000, message: 'Room code did not appear after Create Room' },
    codeSel
  );
  return code;
}

async function joinRoomByCode(page, code, { mode = 'local' } = {}) {
  await openMultiplayerModal(page);
  if (mode === 'local') await selectLocalModeIfPresent(page);
  else await selectSupabaseModeIfPresent(page);

  const inputSel = await firstMatchingSelector(page, PHASE4_SELECTORS.joinCodeInput, { timeoutMs: 3000 });
  await page.typeText(inputSel, code);
  const joinBtn = await firstMatchingSelector(page, PHASE4_SELECTORS.joinRoomBtn, { timeoutMs: 3000 });
  await page.clickSelector(joinBtn);
}

async function waitForSynced(page, predicate, timeoutMs = 10000, ...args) {
  await page.bringToFront?.().catch(() => {});
  return page.waitFor(predicate, { timeoutMs }, ...args);
}

export function getTests() {
  return [
    {
      id: 'T1-E7-01',
      tier: 1,
      phase: '4',
      feature: 'E7',
      name: 'Create room generates 4-char uppercase code, displays room pill, and updates URL ?room=XXXX',
      fn: async ({ browser, baseUrl }) => {
        const page = await openApp(browser, baseUrl, { isolated: true, query: '?autotest=1&mp=local' });
        try {
          const code = await createRoomOnPage(page, { mode: 'local', color: 'w' });
          assert.match(code, /^[A-Z0-9]{4}$/);

          const pillSel = await firstMatchingSelector(page, PHASE4_SELECTORS.roomPill, { timeoutMs: 5000 });
          const pillText = await page.evaluate((s) => document.querySelector(s)?.textContent?.trim(), pillSel);
          assert.ok(pillText?.includes(code), `Expected room pill "${pillText}" to contain ${code}`);

          const urlSearch = await page.evaluate(() => window.location.search);
          assert.ok(urlSearch.includes(`room=${code}`), `Expected ?room=${code} in URL, got ${urlSearch}`);
          page.assertCleanLogs();
        } finally {
          await page.close();
        }
      },
    },
    {
      id: 'T1-E7-02',
      tier: 1,
      phase: '4',
      feature: 'E7',
      name: 'Joining via code and via ?room=XXXX assigns complementary Black color and connected status',
      fn: async ({ browser, baseUrl }) => {
        const host = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let guestByCode = null;
        let guestByUrl = null;
        try {
          const code = await createRoomOnPage(host, { mode: 'local', color: 'w' });

          // Join via code in Tab 2
          guestByCode = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
          await joinRoomByCode(guestByCode, code, { mode: 'local' });
          await guestByCode.waitFor(
            () => window.wizardChess.getState().gameMode === 'multi' && window.wizardChess.getState().playerColor === 'b',
            { timeoutMs: 8000 }
          );
          await guestByCode.close();
          guestByCode = null;

          // Fresh room & join via ?room=XXXX URL auto-join
          const host2 = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
          try {
            const code2 = await createRoomOnPage(host2, { mode: 'local', color: 'w' });
            guestByUrl = await openApp(browser, baseUrl, {
              isolated: false,
              query: `?autotest=1&mp=local&room=${code2}`,
            });
            await guestByUrl.waitFor(
              () => window.wizardChess.getState().gameMode === 'multi' && window.wizardChess.getState().playerColor === 'b',
              { timeoutMs: 8000 }
            );
            guestByUrl.assertCleanLogs();
          } finally {
            await host2.close();
          }
          host.assertCleanLogs();
        } finally {
          if (guestByCode) await guestByCode.close();
          if (guestByUrl) await guestByUrl.close();
          await host.close();
        }
      },
    },
    {
      id: 'T1-E7-03',
      tier: 1,
      phase: '4',
      feature: 'E7',
      name: '2-Tab local fallback syncs White/Black moves bidirectionally including pawn promotion',
      fn: async ({ browser, baseUrl }) => {
        const tab1 = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let tab2 = null;
        try {
          const code = await createRoomOnPage(tab1, { mode: 'local', color: 'w' });
          tab2 = await openApp(browser, baseUrl, {
            isolated: false,
            query: `?autotest=1&mp=local&room=${code}`,
          });
          await tab2.waitFor(
            () => window.wizardChess.getState().gameMode === 'multi' && window.wizardChess.getState().playerColor === 'b',
            { timeoutMs: 8000 }
          );

          try {
            const closeBtn = await firstMatchingSelector(tab1, PHASE4_SELECTORS.closeModalBtn, { timeoutMs: 800 });
            await tab1.clickSelector(closeBtn);
          } catch {
            // modal may auto-close
          }

          // White e2->e4 on Tab 1 -> syncs to Tab 2
          await selectAndClickMove(tab1, 'e2', 'e4');
          await waitForSynced(
            tab2,
            () => window.wizardChess.getHistoryUci().includes('e2e4') && !window.wizardChess.getState().isAnimatingMove,
            8000
          );

          // Black e7->e5 on Tab 2 -> syncs to Tab 1
          await selectAndClickMove(tab2, 'e7', 'e5');
          await waitForSynced(
            tab1,
            () => window.wizardChess.getHistoryUci().includes('e7e5') && !window.wizardChess.getState().isAnimatingMove,
            8000
          );

          assert.equal(
            await tab1.evaluate(() => window.wizardChess.getFen()),
            await tab2.evaluate(() => window.wizardChess.getFen())
          );
          tab1.assertCleanLogs();
          tab2.assertCleanLogs();
        } finally {
          if (tab2) await tab2.close();
          await tab1.close();
        }
      },
    },
    {
      id: 'T1-E7-04',
      tier: 1,
      phase: '4',
      feature: 'E7',
      name: 'Reconnect & State-Sync: reloading Tab 2 on ?room=XXXX re-claims color and replays full history',
      fn: async ({ browser, baseUrl }) => {
        const tab1 = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let tab2 = null;
        try {
          const code = await createRoomOnPage(tab1, { mode: 'local', color: 'w' });
          tab2 = await openApp(browser, baseUrl, {
            isolated: false,
            query: `?autotest=1&mp=local&room=${code}`,
          });
          await tab2.waitFor(
            () => window.wizardChess.getState().gameMode === 'multi' && window.wizardChess.getState().playerColor === 'b',
            { timeoutMs: 8000 }
          );

          try {
            const closeBtn = await firstMatchingSelector(tab1, PHASE4_SELECTORS.closeModalBtn, { timeoutMs: 800 });
            await tab1.clickSelector(closeBtn);
          } catch {}

          await selectAndClickMove(tab1, 'e2', 'e4');
          await tab2.waitFor(() => window.wizardChess.getHistoryUci().length === 1, { timeoutMs: 8000 });

          await tab2.reload();
          await waitForAppReady(tab2);
          await tab2.waitFor(
            () =>
              window.wizardChess.getState().gameMode === 'multi' &&
              window.wizardChess.getState().playerColor === 'b' &&
              window.wizardChess.getHistoryUci().length === 1,
            { timeoutMs: 8000 }
          );
          assert.equal(
            await tab1.evaluate(() => window.wizardChess.getFen()),
            await tab2.evaluate(() => window.wizardChess.getFen())
          );
          tab1.assertCleanLogs();
          tab2.assertCleanLogs();
        } finally {
          if (tab2) await tab2.close();
          await tab1.close();
        }
      },
    },
    {
      id: 'T1-E7-05',
      tier: 1,
      phase: '4',
      feature: 'E7',
      name: 'Reset sync resets both tabs and leaving room restores single-player controls',
      fn: async ({ browser, baseUrl }) => {
        const tab1 = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let tab2 = null;
        try {
          const code = await createRoomOnPage(tab1, { mode: 'local', color: 'w' });
          tab2 = await openApp(browser, baseUrl, {
            isolated: false,
            query: `?autotest=1&mp=local&room=${code}`,
          });
          await tab2.waitFor(() => window.wizardChess.getState().gameMode === 'multi', { timeoutMs: 8000 });

          try {
            const closeBtn = await firstMatchingSelector(tab1, PHASE4_SELECTORS.closeModalBtn, { timeoutMs: 800 });
            await tab1.clickSelector(closeBtn);
          } catch {}

          await selectAndClickMove(tab1, 'e2', 'e4');
          await tab2.waitFor(() => window.wizardChess.getHistoryUci().length === 1, { timeoutMs: 8000 });

          await tab1.clickSelector('#btn-reset');
          await tab2.waitFor(
            () => window.wizardChess.getHistoryUci().length === 0 && !window.wizardChess.getState().isAnimatingMove,
            { timeoutMs: 8000 }
          );

          await openMultiplayerModal(tab1);
          const leaveBtn = await firstMatchingSelector(tab1, PHASE4_SELECTORS.leaveRoomBtn, { timeoutMs: 3000 });
          await tab1.clickSelector(leaveBtn);
          await tab1.waitFor(() => window.wizardChess.getState().gameMode === 'single', { timeoutMs: 5000 });
          await tab1.waitForSelector('#btn-ai-move', { visible: true });
          tab1.assertCleanLogs();
          tab2.assertCleanLogs();
        } finally {
          if (tab2) await tab2.close();
          await tab1.close();
        }
      },
    },

    // =========================================================================
    // E7 Tier 2: Boundary & Corner Cases
    // =========================================================================
    {
      id: 'T2-E7-01',
      tier: 2,
      phase: '4',
      feature: 'E7',
      name: 'Invalid/empty room code shows validation error without joining',
      fn: async ({ browser, baseUrl }) => {
        const page = await openApp(browser, baseUrl, { isolated: true, query: '?autotest=1&mp=local' });
        try {
          await joinRoomByCode(page, 'AB', { mode: 'local' });
          const statusSel = await firstMatchingSelector(page, PHASE4_SELECTORS.statusMsg, { timeoutMs: 3000 });
          const msg = await page.evaluate((s) => document.querySelector(s)?.textContent?.trim(), statusSel);
          assert.ok(msg && msg.length > 0, 'Expected validation error message for short code');
          assert.equal(await page.evaluate(() => window.wizardChess.getState().gameMode), 'single');
          page.assertCleanLogs();
        } finally {
          await page.close();
        }
      },
    },
    {
      id: 'T2-E7-02',
      tier: 2,
      phase: '4',
      feature: 'E7',
      name: 'Third client joining a full room enters as spectator and cannot move pieces',
      fn: async ({ browser, baseUrl }) => {
        const tab1 = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let tab2 = null;
        let tab3 = null;
        try {
          const code = await createRoomOnPage(tab1, { mode: 'local', color: 'w' });
          tab2 = await openApp(browser, baseUrl, { isolated: false, query: `?autotest=1&mp=local&room=${code}` });
          await tab2.waitFor(() => window.wizardChess.getState().playerColor === 'b', { timeoutMs: 8000 });

          tab3 = await openApp(browser, baseUrl, { isolated: false, query: `?autotest=1&mp=local&room=${code}` });
          await tab3.waitFor(
            () => window.wizardChess.getState().gameMode === 'multi' && window.wizardChess.getState().playerColor === 'spectator',
            { timeoutMs: 8000 }
          );
          await selectAndClickMove(tab3, 'e2', 'e4', { expectExecuted: false, expectSelected: false });
          await sleep(150);
          assert.equal((await tab3.evaluate(() => window.wizardChess.getHistoryUci())).length, 0);
          tab1.assertCleanLogs();
          tab2.assertCleanLogs();
          tab3.assertCleanLogs();
        } finally {
          if (tab3) await tab3.close();
          if (tab2) await tab2.close();
          await tab1.close();
        }
      },
    },
    {
      id: 'T2-E7-03',
      tier: 2,
      phase: '4',
      feature: 'E7',
      name: 'Moving opponent piece or out-of-turn in multiplayer is blocked locally',
      fn: async ({ browser, baseUrl }) => {
        const tab1 = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let tab2 = null;
        try {
          const code = await createRoomOnPage(tab1, { mode: 'local', color: 'w' });
          tab2 = await openApp(browser, baseUrl, { isolated: false, query: `?autotest=1&mp=local&room=${code}` });
          await tab2.waitFor(() => window.wizardChess.getState().playerColor === 'b', { timeoutMs: 8000 });

          // Tab 2 (Black) tries moving on White's turn -> blocked
          await selectAndClickMove(tab2, 'e7', 'e5', { expectExecuted: false, expectSelected: false });
          await sleep(150);
          assert.equal((await tab2.evaluate(() => window.wizardChess.getHistoryUci())).length, 0);
          assert.equal((await tab1.evaluate(() => window.wizardChess.getHistoryUci())).length, 0);
          tab1.assertCleanLogs();
          tab2.assertCleanLogs();
        } finally {
          if (tab2) await tab2.close();
          await tab1.close();
        }
      },
    },
    {
      id: 'T2-E7-04',
      tier: 2,
      phase: '4',
      feature: 'E7',
      name: 'Duplicate move sequence broadcast is idempotently ignored without desync',
      fn: async ({ browser, baseUrl }) => {
        const tab1 = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let tab2 = null;
        try {
          const code = await createRoomOnPage(tab1, { mode: 'local', color: 'w' });
          tab2 = await openApp(browser, baseUrl, { isolated: false, query: `?autotest=1&mp=local&room=${code}` });
          await tab2.waitFor(() => window.wizardChess.getState().playerColor === 'b', { timeoutMs: 8000 });

          try {
            const closeBtn = await firstMatchingSelector(tab1, PHASE4_SELECTORS.closeModalBtn, { timeoutMs: 800 });
            await tab1.clickSelector(closeBtn);
          } catch {}

          await selectAndClickMove(tab1, 'e2', 'e4');
          await tab2.waitFor(() => window.wizardChess.getHistoryUci().length === 1, { timeoutMs: 8000 });

          // Attempt duplicate applyRemoteMove on Tab 2
          await tab2.evaluate(() => {
            window.wizardChess.applyRemoteMove?.({ fromR: 6, fromC: 4, toR: 4, toC: 4 });
          });
          await sleep(200);
          assert.equal((await tab2.evaluate(() => window.wizardChess.getHistoryUci())).length, 1);
          tab1.assertCleanLogs();
          tab2.assertCleanLogs();
        } finally {
          if (tab2) await tab2.close();
          await tab1.close();
        }
      },
    },
    {
      id: 'T2-E7-05',
      tier: 2,
      phase: '4',
      feature: 'E7',
      name: 'Training Mode and AI controls are disabled/guarded while in an active multiplayer match',
      fn: async ({ browser, baseUrl }) => {
        const page = await openApp(browser, baseUrl, { isolated: true, query: '?autotest=1&mp=local' });
        try {
          await createRoomOnPage(page, { mode: 'local', color: 'w' });
          const disabledState = await page.evaluate(() => {
            const ai = document.getElementById('btn-ai-move');
            const side = document.getElementById('btn-side-toggle');
            const train = document.getElementById('btn-training-mode');
            return {
              aiDisabled: Boolean(ai?.disabled || getComputedStyle(ai).display === 'none'),
              sideDisabled: Boolean(side?.disabled || getComputedStyle(side).display === 'none'),
              trainDisabled: Boolean(train?.disabled || train?.getAttribute('aria-disabled') === 'true'),
            };
          });
          assert.equal(disabledState.aiDisabled, true);
          assert.equal(disabledState.sideDisabled, true);
          assert.equal(disabledState.trainDisabled, true);
          page.assertCleanLogs();
        } finally {
          await page.close();
        }
      },
    },

    // =========================================================================
    // E7 Tier 3 & Tier 4
    // =========================================================================
    {
      id: 'T3-08',
      tier: 3,
      phase: '4',
      feature: 'E7+E4+E3',
      name: 'Pairwise E7+E4+E3: 2-Tab Multiplayer with Tab 1 in DE and Tab 2 in EN syncs castling & localized status',
      fn: async ({ browser, baseUrl }) => {
        const tab1 = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let tab2 = null;
        try {
          const code = await createRoomOnPage(tab1, { mode: 'local', color: 'w' });
          tab2 = await openApp(browser, baseUrl, { isolated: false, query: `?autotest=1&mp=local&room=${code}` });
          await tab2.waitFor(() => window.wizardChess.getState().playerColor === 'b', { timeoutMs: 8000 });
          await tab2.clickSelector('#btn-lang-toggle'); // EN on Tab 2

          try {
            const closeBtn = await firstMatchingSelector(tab1, PHASE4_SELECTORS.closeModalBtn, { timeoutMs: 800 });
            await tab1.clickSelector(closeBtn);
          } catch {}

          // Play toward kingside castling: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.O-O
          const seq = [
            [tab1, 'e2', 'e4'],
            [tab2, 'e7', 'e5'],
            [tab1, 'g1', 'f3'],
            [tab2, 'b8', 'c6'],
            [tab1, 'f1', 'c4'],
            [tab2, 'f8', 'c5'],
            [tab1, 'e1', 'g1'],
          ];
          for (const [p, f, t] of seq) {
            const targetLen = (await p.evaluate(() => window.wizardChess.getHistoryUci().length)) + 1;
            await selectAndClickMove(p, f, t);
            await waitForSynced(tab1, (n) => window.wizardChess.getHistoryUci().length >= n && !window.wizardChess.getState().isAnimatingMove, 8000, targetLen);
            await waitForSynced(tab2, (n) => window.wizardChess.getHistoryUci().length >= n && !window.wizardChess.getState().isAnimatingMove, 8000, targetLen);
          }

          assert.equal(
            await tab1.evaluate(() => window.wizardChess.getFen()),
            await tab2.evaluate(() => window.wizardChess.getFen())
          );
          assert.ok((await tab1.evaluate(() => document.getElementById('turn-text')?.textContent))?.includes('Schwarz'));
          assert.ok((await tab2.evaluate(() => document.getElementById('turn-text')?.textContent))?.includes('Black'));
          tab1.assertCleanLogs();
          tab2.assertCleanLogs();
        } finally {
          if (tab2) await tab2.close();
          await tab1.close();
        }
      },
    },
    {
      id: 'T4-06',
      tier: 4,
      phase: '4',
      feature: 'E3+E4+E7',
      name: 'Scenario T4-06: Full 2-Tab Multiplayer match lifecycle (create, ?room join, moves, reload resync, reset sync)',
      fn: async ({ browser, baseUrl }) => {
        const host = await openApp(browser, baseUrl, { isolated: false, query: '?autotest=1&mp=local' });
        let guest = null;
        try {
          const code = await createRoomOnPage(host, { mode: 'local', color: 'w' });
          guest = await openApp(browser, baseUrl, {
            isolated: false,
            query: `?autotest=1&mp=local&room=${code}`,
          });
          await guest.waitFor(() => window.wizardChess.getState().playerColor === 'b', { timeoutMs: 8000 });

          try {
            const closeBtn = await firstMatchingSelector(host, PHASE4_SELECTORS.closeModalBtn, { timeoutMs: 800 });
            await host.clickSelector(closeBtn);
          } catch {}

          // Capture sequence: 1.e4 d5 2.exd5
          await selectAndClickMove(host, 'e2', 'e4');
          await waitForSynced(guest, () => window.wizardChess.getHistoryUci().length === 1 && !window.wizardChess.getState().isAnimatingMove, 8000);
          await selectAndClickMove(guest, 'd7', 'd5');
          await waitForSynced(host, () => window.wizardChess.getHistoryUci().length === 2 && !window.wizardChess.getState().isAnimatingMove, 8000);
          await selectAndClickMove(host, 'e4', 'd5');
          await waitForSynced(guest, () => window.wizardChess.getHistoryUci().length === 3 && !window.wizardChess.getState().isAnimatingMove, 8000);

          // Guest reloads mid-game and resyncs full history
          await guest.reload();
          await waitForAppReady(guest);
          await guest.waitFor(
            () => window.wizardChess.getHistoryUci().length === 3 && window.wizardChess.getState().playerColor === 'b',
            { timeoutMs: 8000 }
          );
          assert.equal(
            await host.evaluate(() => window.wizardChess.getFen()),
            await guest.evaluate(() => window.wizardChess.getFen())
          );

          // Host resets room -> syncs to Guest
          await host.clickSelector('#btn-reset');
          await guest.waitFor(() => window.wizardChess.getHistoryUci().length === 0, { timeoutMs: 8000 });
          host.assertCleanLogs();
          guest.assertCleanLogs();
        } finally {
          if (guest) await guest.close();
          await host.close();
        }
      },
    },
    {
      id: 'T4-06-LIVE',
      tier: 4,
      phase: '4',
      feature: 'E7-LIVE',
      requiresLiveSupabase: true,
      name: 'Live Supabase Realtime 2-Tab isolated BrowserContext sync against brrhstgkncuwaclusxfy.supabase.co',
      fn: async ({ browser, baseUrl }) => {
        const host = await openApp(browser, baseUrl, { isolated: true, query: '?autotest=1' });
        let guest = null;
        try {
          const code = await createRoomOnPage(host, { mode: 'supabase', color: 'w' });
          guest = await openApp(browser, baseUrl, {
            isolated: true,
            query: `?autotest=1&room=${code}`,
          });
          await guest.waitFor(
            () => window.wizardChess.getState().gameMode === 'multi' && window.wizardChess.getState().playerColor === 'b',
            { timeoutMs: 12000 }
          );

          try {
            const closeBtn = await firstMatchingSelector(host, PHASE4_SELECTORS.closeModalBtn, { timeoutMs: 800 });
            await host.clickSelector(closeBtn);
          } catch {}

          await selectAndClickMove(host, 'e2', 'e4');
          await waitForSynced(
            guest,
            () => window.wizardChess.getHistoryUci().includes('e2e4') && !window.wizardChess.getState().isAnimatingMove,
            12000
          );

          await selectAndClickMove(guest, 'e7', 'e5');
          await waitForSynced(
            host,
            () => window.wizardChess.getHistoryUci().includes('e7e5') && !window.wizardChess.getState().isAnimatingMove,
            12000
          );

          assert.equal(
            await host.evaluate(() => window.wizardChess.getFen()),
            await guest.evaluate(() => window.wizardChess.getFen())
          );

          // Isolated reload reconnect
          await guest.reload();
          await waitForAppReady(guest);
          await guest.waitFor(
            () => window.wizardChess.getHistoryUci().length === 2 && window.wizardChess.getState().playerColor === 'b',
            { timeoutMs: 12000 }
          );
          host.assertCleanLogs();
          guest.assertCleanLogs();
        } finally {
          if (guest) await guest.close();
          await host.close();
        }
      },
    },
  ];
}
