import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

import { sanListToUciMoves } from '../src/chess/rules.ts';
import { TRANSLATIONS } from '../src/i18n/translations.ts';
import { OPENINGS_CATALOG, STRATEGIES_CATALOG } from '../src/lexicon/lexiconData.ts';
import { detectOpening } from '../src/lexicon/openingDetector.ts';

test('Every opening in OPENINGS_CATALOG replays legally and has valid DE/EN metadata', () => {
  assert.ok(OPENINGS_CATALOG.length >= 12);
  for (const opening of OPENINGS_CATALOG) {
    assert.ok(opening.id.length > 0);
    assert.ok(/^[A-E]\d{2}$/.test(opening.eco), `Invalid ECO ${opening.eco}`);
    assert.ok(opening.name.de && opening.name.en);
    assert.ok(opening.summary.de && opening.summary.en);
    assert.ok(opening.watchOut.de && opening.watchOut.en);
    assert.ok(opening.keyIdeasWhite.length > 0);
    assert.ok(opening.keyIdeasBlack.length > 0);

    const converted = sanListToUciMoves(opening.movesSan);
    assert.equal(
      converted.length,
      opening.movesSan.length,
      `Failed converting SAN moves for ${opening.id}`
    );
  }
});

test('Every strategy in STRATEGIES_CATALOG has valid FEN, legal moves, and valid highlight arrows', () => {
  assert.ok(STRATEGIES_CATALOG.length >= 10);
  for (const strategy of STRATEGIES_CATALOG) {
    assert.ok(strategy.id.length > 0);
    assert.ok(strategy.name.de && strategy.name.en);
    assert.ok(strategy.summary.de && strategy.summary.en);
    assert.ok(strategy.exampleExplanation.de && strategy.exampleExplanation.en);
    assert.ok(strategy.keyPrinciples.length > 0);

    const chess = new Chess(strategy.exampleFen);
    assert.ok(chess.fen().length > 0);

    const converted = sanListToUciMoves(strategy.exampleMovesSan, strategy.exampleFen);
    assert.equal(
      converted.length,
      strategy.exampleMovesSan.length,
      `Failed strategy moves for ${strategy.id}`
    );

    if (strategy.highlightArrows) {
      for (const arrow of strategy.highlightArrows) {
        assert.match(arrow.from, /^[a-h][1-8]$/);
        assert.match(arrow.to, /^[a-h][1-8]$/);
      }
    }
  }
});

test('detectOpening identifies openings from move history and prefers deeper specific matches', () => {
  assert.equal(detectOpening([]), null);

  const openRoot = detectOpening(['e2e4', 'e7e5']);
  assert.equal(openRoot?.eco, 'C20');

  const italianPrefix = detectOpening(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']);
  assert.equal(italianPrefix?.openingId, 'italian-game');
  assert.equal(italianPrefix?.eco, 'C50');

  const sicilian = detectOpening(['e2e4', 'c7c5', 'g1f3', 'd7d6']);
  assert.equal(sicilian?.openingId, 'sicilian-defense');

  const french = detectOpening(['e2e4', 'e7e6', 'd2d4', 'd7d5']);
  assert.equal(french?.openingId, 'french-defense');

  const caroKann = detectOpening(['e2e4', 'c7c6', 'd2d4', 'd7d5']);
  assert.equal(caroKann?.openingId, 'caro-kann');

  const qg = detectOpening(['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7']);
  assert.equal(qg?.openingId, 'queens-gambit');
  assert.equal(qg?.matchedPlies, 8);

  const kid = detectOpening(['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7']);
  assert.equal(kid?.openingId, 'kings-indian');

  // Uncommon first move
  assert.equal(detectOpening(['h2h3']), null);
});

test('DE and EN translation dictionaries keep exact key parity after Phase 3 additions', () => {
  const deKeys = Object.keys(TRANSLATIONS.de).sort();
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  assert.deepEqual(deKeys, enKeys);
});
