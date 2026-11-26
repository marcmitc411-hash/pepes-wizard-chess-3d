import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ChessRulesEngine, rcToSquare, squareToRC, parseUciString } from '../src/chess/rules.ts';
import {
  buildUciStrengthCommands,
  configFromCustomElo,
  configFromPreset,
  parseBestMoveLine,
  parseUciInfoLine,
  selectMoveForStrength,
} from '../src/engine/uciStrength.ts';
import { STOCKFISH_JS_FILENAME, STOCKFISH_WASM_FILENAME } from '../src/engine/stockfishConfig.ts';
import { TRANSLATIONS, translate } from '../src/i18n/translations.ts';

const ROOT = process.cwd();

test('Stockfish single-threaded WASM assets exist in public/stockfish with valid WASM header', () => {
  const jsPath = path.join(ROOT, 'public/stockfish', STOCKFISH_JS_FILENAME);
  const wasmPath = path.join(ROOT, 'public/stockfish', STOCKFISH_WASM_FILENAME);

  assert.ok(fs.existsSync(jsPath), `Missing worker JS at ${jsPath}`);
  assert.ok(fs.existsSync(wasmPath), `Missing WASM binary at ${wasmPath}`);

  const wasmHead = fs.readFileSync(wasmPath).subarray(0, 4);
  assert.equal(wasmHead.toString('binary'), '\0asm', 'Invalid WASM magic header');
});

test('ChessRulesEngine handles coordinates, en passant, castling, and underpromotion', () => {
  assert.equal(rcToSquare(7, 4), 'e1');
  assert.equal(rcToSquare(0, 0), 'a8');
  assert.deepEqual(squareToRC('e4'), { r: 4, c: 4 });
  assert.deepEqual(parseUciString('e7e8n'), {
    fromR: 1,
    fromC: 4,
    toR: 0,
    toC: 4,
    promotion: 'knight',
  });

  const engine = new ChessRulesEngine();
  // 1. e4 a6 2. e5 d5 -> White can capture en passant exd6 (c3 -> row 2, col 3)
  assert.ok(engine.applyUciMove('e2e4'));
  assert.ok(engine.applyUciMove('a7a6'));
  assert.ok(engine.applyUciMove('e4e5'));
  assert.ok(engine.applyUciMove('d7d5'));

  const e5Moves = engine.getLegalMovesFrom(3, 4); // e5
  const epMove = e5Moves.find((m) => m.to === 'd6');
  assert.ok(epMove, 'En passant d6 should be legal');
  assert.equal(epMove.isEnPassant, true);
  assert.equal(epMove.capture, true);
  assert.equal(epMove.enPassantCapturedR, 3);
  assert.equal(epMove.enPassantCapturedC, 3);

  const appliedEp = engine.applyMove(3, 4, 2, 3);
  assert.ok(appliedEp?.isEnPassant);

  // Test castling blocked through check
  const castleBlocked = new ChessRulesEngine('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1');
  const kMovesBlocked = castleBlocked.getLegalMovesFrom(7, 4);
  assert.equal(kMovesBlocked.some((m) => m.castle === 'k'), false, 'Castling through check on f1 must be illegal');

  // Test legal kingside castling
  const castleOk = new ChessRulesEngine('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  const kMovesOk = castleOk.getLegalMovesFrom(7, 4);
  const kCastle = kMovesOk.find((m) => m.castle === 'k');
  assert.ok(kCastle, 'Kingside castling should be legal');
  assert.equal(kCastle.rookFromC, 7);
  assert.equal(kCastle.rookToC, 5);

  // Test promotion detection and knight underpromotion
  const promoEngine = new ChessRulesEngine('4k3/4P3/8/8/8/8/8/4K3 w - - 0 1');
  // Move e7->e8 is illegal because black king on e8, let's place pawn on a7
  promoEngine.loadFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(promoEngine.isPromotionMove(1, 0, 0, 0), true);
  const promoMoves = promoEngine.getLegalMovesFrom(1, 0);
  assert.equal(promoMoves.length, 1, 'Destination squares should be deduplicated for board UI');
  const knightPromo = promoEngine.applyMove(1, 0, 0, 0, 'knight');
  assert.equal(knightPromo?.promotion, 'knight');
  assert.equal(knightPromo?.uci, 'a7a8n');
});

test('ChessRulesEngine detects checkmate, stalemate, threefold repetition, and insufficient material', () => {
  // Fool's mate
  const mate = new ChessRulesEngine();
  assert.ok(mate.applyUciMove('f2f3'));
  assert.ok(mate.applyUciMove('e7e5'));
  assert.ok(mate.applyUciMove('g2g4'));
  assert.ok(mate.applyUciMove('d8h4'));
  const mateStatus = mate.getStatus();
  assert.equal(mateStatus.isGameOver, true);
  assert.equal(mateStatus.outcome, 'checkmate');
  assert.equal(mateStatus.winner, 'b');

  // Stalemate
  const stale = new ChessRulesEngine('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const staleStatus = stale.getStatus();
  assert.equal(staleStatus.isGameOver, true);
  assert.equal(staleStatus.outcome, 'stalemate');
  assert.equal(staleStatus.winner, null);

  // Insufficient material (K+N vs K)
  const insuff = new ChessRulesEngine('4k3/8/8/8/8/8/4N3/4K3 w - - 0 1');
  assert.equal(insuff.getStatus().outcome, 'draw_material');

  // Threefold repetition
  const rep = new ChessRulesEngine();
  for (let i = 0; i < 2; i++) {
    rep.applyUciMove('g1f3');
    rep.applyUciMove('g8f6');
    rep.applyUciMove('f3g1');
    rep.applyUciMove('f6g8');
  }
  assert.equal(rep.getStatus().outcome, 'draw_repetition');
});

test('ChessRulesEngine syncFromCustomBoard & loadHistoryUci work properly', () => {
  const engine = new ChessRulesEngine();
  const ok = engine.syncFromCustomBoard(
    [
      { type: 'king', color: 'w', r: 7, c: 4, hasMoved: false },
      { type: 'rook', color: 'w', r: 7, c: 7, hasMoved: false },
      { type: 'king', color: 'b', r: 0, c: 4, hasMoved: true },
    ],
    'w'
  );
  assert.equal(ok, true);
  assert.ok(engine.getFen().includes(' w K - '));

  const replayed = new ChessRulesEngine();
  assert.equal(replayed.loadHistoryUci(['e2e4', 'e7e5', 'g1f3']), true);
  assert.equal(replayed.getStatus().historySan.join(' '), 'e4 e5 Nf3');
});

test('UCI strength commands and MultiPV parsing work across all Elo tiers', () => {
  const novicePlan = buildUciStrengthCommands(configFromPreset('novice'));
  assert.equal(novicePlan.mode, 'skill_depth');
  assert.ok(novicePlan.options.some((o) => o.includes('UCI_LimitStrength value false')));
  assert.ok(novicePlan.options.some((o) => o.includes('Skill Level value')));
  assert.ok(novicePlan.multiPv >= 3);

  const clubPlan = buildUciStrengthCommands(configFromPreset('club'));
  assert.equal(clubPlan.mode, 'uci_elo');
  assert.ok(clubPlan.options.includes('setoption name UCI_LimitStrength value true'));
  assert.ok(clubPlan.options.includes('setoption name UCI_Elo value 1400'));

  const customPlan = buildUciStrengthCommands(configFromCustomElo(2050));
  assert.equal(customPlan.mode, 'uci_elo');
  assert.ok(customPlan.options.includes('setoption name UCI_Elo value 2050'));

  const maxPlan = buildUciStrengthCommands(configFromPreset('max'));
  assert.equal(maxPlan.mode, 'max');
  assert.ok(maxPlan.options.includes('setoption name Skill Level value 20'));

  const cpInfo = parseUciInfoLine('info depth 12 seldepth 16 multipv 2 score cp -45 nodes 12345 pv d7d5 e4d5 d8d5');
  assert.deepEqual(cpInfo, {
    depth: 12,
    multipv: 2,
    scoreType: 'cp',
    scoreValue: -45,
    pv: ['d7d5', 'e4d5', 'd8d5'],
  });

  const mateInfo = parseUciInfoLine('info depth 8 multipv 1 score mate 2 pv d8h4 g2g3 h4e4');
  assert.equal(mateInfo?.scoreType, 'mate');
  assert.equal(mateInfo?.scoreValue, 2);

  assert.deepEqual(parseBestMoveLine('bestmove e2e4 ponder e7e5'), {
    bestMove: 'e2e4',
    ponder: 'e7e5',
  });

  const pvLines = [
    { depth: 2, multipv: 1, scoreType: 'cp', scoreValue: 40, pv: ['e2e4'] },
    { depth: 2, multipv: 2, scoreType: 'cp', scoreValue: 25, pv: ['d2d4'] },
    { depth: 2, multipv: 3, scoreType: 'cp', scoreValue: 10, pv: ['c2c4'] },
  ];
  // For UCI_Elo >= 1320 always returns bestMove
  assert.equal(selectMoveForStrength('e2e4', pvLines, configFromPreset('club'), () => 0.99), 'e2e4');
  // For novice (<1320) high RNG pick can select an alternative PV move
  const picked = selectMoveForStrength('e2e4', pvLines, configFromPreset('novice'), () => 0.95);
  assert.ok(['e2e4', 'd2d4', 'c2c4'].includes(picked));
});

test('DE and EN translations have exact key parity and working placeholders', () => {
  const deKeys = Object.keys(TRANSLATIONS.de).sort();
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  assert.deepEqual(deKeys, enKeys);

  assert.equal(
    translate('de', 'checkmateWinner', { winner: 'Weiß' }),
    'Schachmatt — Weiß gewinnt'
  );
  assert.equal(
    translate('en', 'checkmateWinner', { winner: 'White' }),
    'Checkmate — White Wins'
  );
});
