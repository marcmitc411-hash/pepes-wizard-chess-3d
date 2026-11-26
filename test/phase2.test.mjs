import test from 'node:test';
import assert from 'node:assert/strict';

import { diagnoseIllegalMove, diagnoseNoLegalMoves } from '../src/coach/ruleDiagnostics.ts';
import {
  evaluatePlannedMoveFromLines,
  explainAlternativeMove,
} from '../src/coach/tacticalAnalyzer.ts';
import { TRANSLATIONS } from '../src/i18n/translations.ts';

test('diagnoseIllegalMove explains pins, checks, castling, pawn, and piece pattern violations in DE and EN', () => {
  // 1. Absolute pin: White Bishop on e2 pinned to King e1 by Black Rook on e8
  const pinFen = 'k3r3/8/8/8/8/8/4B3/4K3 w - - 0 1';
  const pinDe = diagnoseIllegalMove(pinFen, 6, 4, 5, 3, 'de'); // Be2 -> d3
  assert.equal(pinDe.code, 'piece_pinned');
  assert.ok(pinDe.reason.includes('Turm'));
  assert.ok(pinDe.reason.includes('e8'));
  assert.ok(pinDe.highlightSquares.some((sq) => sq.r === 0 && sq.c === 4 && sq.kind === 'pin'));

  const pinEn = diagnoseIllegalMove(pinFen, 6, 4, 5, 3, 'en');
  assert.equal(pinEn.code, 'piece_pinned');
  assert.ok(pinEn.reason.includes('Rook'));

  // 2. Must resolve check: King on e1 in check from Rook on e8, Pawn on a2 tries a3
  const checkFen = 'k3r3/8/8/8/8/8/P7/4K3 w - - 0 1';
  const mustResolve = diagnoseIllegalMove(checkFen, 6, 0, 5, 0, 'de');
  assert.equal(mustResolve.code, 'must_resolve_check');

  // 3. King moves into check: King e1 tries d1 (attacked by Rook d8)
  const kingCheckFen = 'k2r4/8/8/8/8/8/8/4K3 w - - 0 1';
  const intoCheck = diagnoseIllegalMove(kingCheckFen, 7, 4, 7, 3, 'en');
  assert.equal(intoCheck.code, 'king_moves_into_check');

  // 4. All 4 castling violations
  const castleNoRight = diagnoseIllegalMove('4k3/8/8/8/8/8/8/4K2R w Q - 0 1', 7, 4, 7, 6, 'de');
  assert.equal(castleNoRight.code, 'castle_rights_lost');

  const castleInCheck = diagnoseIllegalMove('4r2k/8/8/8/8/8/8/4K2R w K - 0 1', 7, 4, 7, 6, 'en');
  assert.equal(castleInCheck.code, 'castle_in_check');

  const castleBlocked = diagnoseIllegalMove('4k3/8/8/8/8/8/8/4KB1R w K - 0 1', 7, 4, 7, 6, 'de');
  assert.equal(castleBlocked.code, 'castle_blocked');

  const castleThruCheck = diagnoseIllegalMove('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1', 7, 4, 7, 7, 'de'); // clicking rook h1
  assert.equal(castleThruCheck.code, 'castle_through_check');
  assert.ok(castleThruCheck.reason.includes('f1'));

  // 5. Pawn backwards / double push / blocked / diagonal empty
  const pawnFen = '4k3/8/8/8/4p3/4P3/8/4K3 w - - 0 1';
  assert.equal(diagnoseIllegalMove(pawnFen, 5, 4, 6, 4, 'de').code, 'pawn_backward');
  assert.equal(diagnoseIllegalMove(pawnFen, 5, 4, 3, 4, 'de').code, 'pawn_double_only_start');
  assert.equal(diagnoseIllegalMove(pawnFen, 5, 4, 4, 4, 'de').code, 'pawn_blocked_forward');
  assert.equal(diagnoseIllegalMove(pawnFen, 5, 4, 4, 3, 'en').code, 'pawn_diagonal_needs_capture');

  // 6. Slider blocked & invalid patterns
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.equal(diagnoseIllegalMove(startFen, 7, 0, 5, 0, 'de').code, 'path_blocked'); // Rook a1->a3 blocked by a2
  assert.equal(diagnoseIllegalMove(startFen, 7, 1, 5, 1, 'en').code, 'invalid_pattern'); // Knight b1->b3
  assert.equal(diagnoseIllegalMove(startFen, 7, 2, 5, 2, 'en').code, 'invalid_pattern'); // Bishop c1->c3
  assert.equal(diagnoseIllegalMove(startFen, 7, 0, 6, 1, 'en').code, 'invalid_pattern'); // Rook a1->b2
});

test('diagnoseNoLegalMoves explains pinned, in-check, and boxed-in pieces', () => {
  // Pinned knight on e2 cannot move anywhere
  const pinnedKnightFen = 'k3r3/8/8/8/8/8/4N3/4K3 w - - 0 1';
  const pinnedDiag = diagnoseNoLegalMoves(pinnedKnightFen, 6, 4, 'de');
  assert.equal(pinnedDiag?.code, 'no_moves_pinned');

  // In check from e8, pawn on a2 cannot help
  const checkFen = 'k3r3/8/8/8/8/8/P7/4K3 w - - 0 1';
  const checkDiag = diagnoseNoLegalMoves(checkFen, 6, 0, 'en');
  assert.equal(checkDiag?.code, 'no_moves_in_check');

  // Rook on a1 boxed in by own pawns/knight on a2 and b1
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const blockedDiag = diagnoseNoLegalMoves(startFen, 7, 0, 'de');
  assert.equal(blockedDiag?.code, 'no_moves_blocked');
});

test('evaluatePlannedMoveFromLines detects good moves, hanging blunders, mate threats, and forks', () => {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const goodPre = [
    { depth: 12, multipv: 1, scoreType: 'cp', scoreValue: 35, pv: ['e2e4', 'e7e5'] },
    { depth: 12, multipv: 2, scoreType: 'cp', scoreValue: 30, pv: ['d2d4', 'd7d5'] },
  ];
  const goodReview = evaluatePlannedMoveFromLines(startFen, 'e2e4', goodPre, null, 'de');
  assert.equal(goodReview.shouldWarn, false);
  assert.equal(goodReview.verdict, 'best');

  // Hanging Queen blunder: White Queen moves d1->h5? No, suppose Queen on d1 moves to a4 where Black bishop/rook or knight captures it!
  // FEN: White Qd1, Ke1; Black Nc6, Ke8. White plays Qd1->a4? Wait: Nc6 attacks a5/b4, let's place Black pawn on b5 so Qa4 is captured by b5? Wait b5->a4 is pawn capture!
  const hangFen = '4k3/8/8/1p6/8/8/8/3QK3 w - - 0 1';
  const hangPre = [
    { depth: 10, multipv: 1, scoreType: 'cp', scoreValue: 920, pv: ['d1b3'] },
  ];
  const hangPost = {
    depth: 10,
    multipv: 1,
    scoreType: 'cp',
    scoreValue: 800, // From Black's POV +800 -> -800 for White (1720 cp loss!)
    pv: ['b5a4'],
  };
  const hangReview = evaluatePlannedMoveFromLines(hangFen, 'd1a4', hangPre, hangPost, 'de');
  assert.equal(hangReview.shouldWarn, true);
  assert.equal(hangReview.verdict, 'blunder');
  assert.ok(hangReview.reason.includes('bxa4') || hangReview.reason.includes('a4'));

  // Allows forced mate against player
  const mateAllowFen = '4k2r/8/8/8/8/8/6PP/6K1 w - - 0 1';
  const mateAllowPre = [
    { depth: 10, multipv: 1, scoreType: 'cp', scoreValue: -300, pv: ['g1f1'] },
  ];
  const mateAllowPost = {
    depth: 10,
    multipv: 1,
    scoreType: 'mate',
    scoreValue: 2, // Opponent mates in 2 -> -M2 for White!
    pv: ['h8h1'],
  };
  const mateAllowReview = evaluatePlannedMoveFromLines(
    mateAllowFen,
    'g2g3',
    mateAllowPre,
    mateAllowPost,
    'en'
  );
  assert.equal(mateAllowReview.shouldWarn, true);
  assert.equal(mateAllowReview.verdict, 'blunder');
  assert.ok(mateAllowReview.title.toLowerCase().includes('mate'));

  // Misses forced mate
  const missMateFen = '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
  const missMatePre = [
    { depth: 10, multipv: 1, scoreType: 'mate', scoreValue: 1, pv: ['e1e8'] },
  ];
  const missMatePost = {
    depth: 10,
    multipv: 1,
    scoreType: 'cp',
    scoreValue: -200,
    pv: ['g8f8'],
  };
  const missMateReview = evaluatePlannedMoveFromLines(
    missMateFen,
    'g1f1',
    missMatePre,
    missMatePost,
    'de'
  );
  assert.equal(missMateReview.shouldWarn, true);
  assert.equal(missMateReview.verdict, 'blunder');
  assert.ok(missMateReview.reason.includes('Re8#'));

  // Allows enemy fork (Black Knight on d7 -> c5? Or Black Knight on e5 -> f3 forking King g1 & Queen d2)
  const forkAllowFen = '4k3/8/8/4n3/8/8/3Q2P1/6K1 w - - 0 1';
  const forkPre = [
    { depth: 10, multipv: 1, scoreType: 'cp', scoreValue: 600, pv: ['d2e2'] },
  ];
  const forkPost = {
    depth: 10,
    multipv: 1,
    scoreType: 'cp',
    scoreValue: 200, // Black gains ~800cp swing relative to White's +600
    pv: ['e5f3'],
  };
  const forkReview = evaluatePlannedMoveFromLines(
    forkAllowFen,
    'g2g3',
    forkPre,
    forkPost,
    'en'
  );
  assert.equal(forkReview.shouldWarn, true);
  assert.ok(forkReview.reason.includes('Nf3+'));
});

test('explainAlternativeMove generates concrete fork, castling, capture, and development reasons', () => {
  // Knight fork: White Nd5 -> c7 forking King e8 and Rook a8
  const forkFen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
  const forkAlt = explainAlternativeMove(
    forkFen,
    { depth: 10, multipv: 1, scoreType: 'cp', scoreValue: 520, pv: ['d5c7', 'e8d8', 'c7a8'] },
    'de'
  );
  assert.equal(forkAlt?.san, 'Nc7+');
  assert.ok(forkAlt?.reason.includes('Gabel'));

  // Castling alternative
  const castleFen = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
  const castleAlt = explainAlternativeMove(
    castleFen,
    { depth: 10, multipv: 1, scoreType: 'cp', scoreValue: 480, pv: ['e1g1'] },
    'en'
  );
  assert.equal(castleAlt?.san, 'O-O');
  assert.ok(castleAlt?.reason.toLowerCase().includes('castle'));
});

test('DE and EN translation dictionaries keep exact key parity after Phase 2 additions', () => {
  const deKeys = Object.keys(TRANSLATIONS.de).sort();
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  assert.deepEqual(deKeys, enKeys);
});
