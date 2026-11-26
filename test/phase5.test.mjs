import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  TIME_CONTROL_PRESETS,
  computeAiMovetimeMs,
  formatClockMs,
  getTimeControlById,
  isLowTime,
  parseTimeControlFromUrl,
} from '../src/chess/timeControl.ts';
import { TRANSLATIONS } from '../src/i18n/translations.ts';
import { buildInviteUrl } from '../src/multiplayer/roomManager.ts';

const ROOT = process.cwd();

test('Branding is updated to Pepe’s Wizard Chess in index.html and DE/EN translations with key parity', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  assert.ok(html.includes('<title>Pepe’s Wizard Chess</title>'), 'index.html title should be Pepe’s Wizard Chess');
  assert.equal(TRANSLATIONS.de.brandTitle, 'Pepe’s Wizard Chess');
  assert.equal(TRANSLATIONS.en.brandTitle, 'Pepe’s Wizard Chess');

  const deKeys = Object.keys(TRANSLATIONS.de).sort();
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  assert.deepEqual(deKeys, enKeys, 'DE and EN translation dictionaries must have exact key parity');
});

test('Time control presets cover Unlimited, Bullet, Blitz, and Rapid with valid formatting and AI movetime caps', () => {
  const categories = new Set(TIME_CONTROL_PRESETS.map((p) => p.category));
  assert.deepEqual(Array.from(categories).sort(), ['blitz', 'bullet', 'rapid', 'unlimited']);

  assert.equal(getTimeControlById('unknown').id, 'unlimited');
  assert.equal(formatClockMs(0, true), '∞');
  assert.equal(formatClockMs(180_000, false), '3:00');
  assert.equal(formatClockMs(9_450, false), '0:09.4');
  assert.equal(isLowTime(12_000, false), true);
  assert.equal(isLowTime(12_000, true), false);

  assert.equal(parseTimeControlFromUrl('?room=ABCD&tc=bullet_1_0'), 'bullet_1_0');
  assert.equal(parseTimeControlFromUrl('?room=ABCD&tc=invalid'), null);

  const bullet = getTimeControlById('bullet_1_0');
  assert.equal(computeAiMovetimeMs(bullet, 50_000, 1200), 260);
  assert.equal(computeAiMovetimeMs(bullet, 5_000, 1200), 120);
  assert.equal(computeAiMovetimeMs(getTimeControlById('unlimited'), 50_000, 1200), undefined);

  const inviteWithTc = buildInviteUrl('AB23', 'https://pepes-wizard-chess-3d.netlify.app/', 'blitz_3_2');
  assert.ok(inviteWithTc.includes('room=AB23') && inviteWithTc.includes('tc=blitz_3_2'));
});

test('Engine exposes premove, animation speed scaling, and timeout hooks in wizardChessEngine.js', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  for (const symbol of [
    'premoveHighlightsGroup',
    'tryConsumePremove',
    'declareTimeout',
    'setAnimationSpeedScale',
    'getPremoveQueue',
    'clearPremoves',
  ]) {
    assert.ok(engineJs.includes(symbol), `Missing ${symbol} in src/wizardChessEngine.js`);
  }

  const execIdx = engineJs.indexOf('activeCamTransition = null;');
  assert.ok(execIdx !== -1, 'Expected activeCamTransition = null in executeChessMove');
  const execSlice = engineJs.slice(execIdx, execIdx + 180);
  assert.ok(
    !execSlice.includes('clearPremoves()'),
    'executeChessMove must not clear queued premoves when opponent move starts'
  );
});
