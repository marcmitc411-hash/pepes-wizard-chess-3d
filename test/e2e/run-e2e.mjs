import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './lib/cdpClient.mjs';
import { startAppServer } from './lib/server.mjs';
import { getTests as getPhase4Tests } from './tiers/phase4Multiplayer.mjs';
import { getTests as getTier1Tests } from './tiers/tier1.mjs';
import { getTests as getTier2Tests } from './tiers/tier2.mjs';
import { getTests as getTier3Tests } from './tiers/tier3.mjs';
import { getTests as getTier4Tests } from './tiers/tier4.mjs';

export function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {
    phase: '1-3',
    tier: 'all',
    server: process.env.E2E_SERVER_MODE || 'dev',
    liveSupabase: process.env.E2E_LIVE_SUPABASE === '1',
    grep: null,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--include-phase4' || arg === '--phase=all') {
      opts.phase = 'all';
    } else if (arg.startsWith('--phase=')) {
      opts.phase = arg.slice('--phase='.length);
    } else if (arg.startsWith('--tier=')) {
      opts.tier = arg.slice('--tier='.length);
    } else if (arg.startsWith('--server=')) {
      opts.server = arg.slice('--server='.length);
    } else if (arg === '--live-supabase') {
      opts.liveSupabase = true;
    } else if (arg.startsWith('--grep=')) {
      opts.grep = arg.slice('--grep='.length);
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg.startsWith('--filter=')) {
      opts.grep = arg.slice('--filter='.length);
    }
  }

  return opts;
}

export function collectAllTests() {
  return [
    ...getTier1Tests(),
    ...getTier2Tests(),
    ...getTier3Tests(),
    ...getTier4Tests(),
    ...getPhase4Tests(),
  ];
}

export async function runE2eSuite(opts) {
  const allTests = collectAllTests();
  const grepRegex = opts.grep ? new RegExp(opts.grep, 'i') : null;

  const selected = [];
  const skipped = [];

  for (const t of allTests) {
    if (opts.tier !== 'all' && String(t.tier) !== String(opts.tier)) {
      continue;
    }
    if (grepRegex && !grepRegex.test(`${t.id} ${t.feature} ${t.name}`)) {
      continue;
    }
    if (opts.phase === '1-3' && t.phase === '4') {
      skipped.push({ id: t.id, tier: t.tier, feature: t.feature, reason: 'skipped_pending_m2' });
      continue;
    }
    if (opts.phase === '4' && t.phase !== '4') {
      continue;
    }
    if (t.requiresLiveSupabase && !opts.liveSupabase) {
      skipped.push({ id: t.id, tier: t.tier, feature: t.feature, reason: 'requires_live_supabase' });
      continue;
    }
    selected.push(t);
  }

  const log = opts.json ? () => {} : (msg) => console.log(msg);
  log(
    `[E2E] Starting Wizard Chess 3D E2E Suite | server=${opts.server} phase=${opts.phase} tier=${opts.tier} liveSupabase=${opts.liveSupabase} selected=${selected.length} skipped=${skipped.length}`
  );

  let server = null;
  let browser = null;
  const session = { warmPage: null };
  const results = [];
  const startedAt = Date.now();

  const cleanup = async () => {
    if (session.warmPage) {
      await session.warmPage.close().catch(() => {});
      session.warmPage = null;
    }
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    if (server) {
      await server.close().catch(() => {});
      server = null;
    }
  };

  const onSignal = async () => {
    await cleanup();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    if (selected.length > 0) {
      server = await startAppServer({ mode: opts.server });
      browser = await launchBrowser();
      log(`[E2E] Vite (${server.mode}) ready at ${server.url}`);

      for (const t of selected) {
        const t0 = Date.now();
        try {
          await t.fn({ browser, baseUrl: server.url, options: opts, session });
          const ms = Date.now() - t0;
          results.push({ id: t.id, tier: t.tier, feature: t.feature, status: 'PASS', durationMs: ms });
          log(`  PASS  ${t.id} (${ms}ms) - ${t.name}`);
        } catch (err) {
          if (session.warmPage) {
            await session.warmPage.close().catch(() => {});
            session.warmPage = null;
          }
          const ms = Date.now() - t0;
          const message = err instanceof Error ? err.stack || err.message : String(err);
          results.push({
            id: t.id,
            tier: t.tier,
            feature: t.feature,
            status: 'FAIL',
            durationMs: ms,
            error: message,
          });
          log(`  FAIL  ${t.id} (${ms}ms) - ${t.name}\n        ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await cleanup();
  }

  for (const s of skipped) {
    results.push({ id: s.id, tier: s.tier, feature: s.feature, status: 'SKIP', durationMs: 0, reason: s.reason });
    log(`  SKIP  ${s.id} (${s.reason})`);
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skippedCount = results.filter((r) => r.status === 'SKIP').length;
  const totalDurationMs = Date.now() - startedAt;

  const summary = {
    passed,
    failed,
    skipped: skippedCount,
    executed: passed + failed,
    totalListed: results.length,
    durationMs: totalDurationMs,
    results,
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `\n[E2E SUMMARY] Passed: ${passed}/${passed + failed} | Failed: ${failed} | Skipped: ${skippedCount} | Duration: ${(totalDurationMs / 1000).toFixed(2)}s`
    );
  }

  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const opts = parseCliArgs();
  runE2eSuite(opts)
    .then((summary) => {
      process.exitCode = summary.failed > 0 ? 1 : 0;
    })
    .catch((err) => {
      console.error('[E2E FATAL]', err);
      process.exitCode = 1;
    });
}
