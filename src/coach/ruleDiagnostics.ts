import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { rcToSquare, squareToRC } from '../chess/rules.ts';
import type { PieceColor, PieceType } from '../chess/types.ts';
import { translate, type Language } from '../i18n/translations.ts';

export type RuleViolationCode =
  | 'castle_rights_lost'
  | 'castle_in_check'
  | 'castle_blocked'
  | 'castle_through_check'
  | 'pawn_backward'
  | 'pawn_double_only_start'
  | 'pawn_blocked_forward'
  | 'pawn_diagonal_needs_capture'
  | 'path_blocked'
  | 'invalid_pattern'
  | 'must_resolve_check'
  | 'king_moves_into_check'
  | 'piece_pinned'
  | 'no_moves_in_check'
  | 'no_moves_pinned'
  | 'no_moves_blocked';

export interface CoachSquareHighlight {
  r: number;
  c: number;
  kind: 'danger' | 'warn' | 'pin';
}

export interface RuleViolationDiagnosis {
  code: RuleViolationCode;
  title: string;
  reason: string;
  from: string;
  to: string;
  pieceType: PieceType;
  highlightSquares: CoachSquareHighlight[];
}

const SYMBOL_TO_TYPE: Record<PieceSymbol, PieceType> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function pieceName(type: PieceType, lang: Language): string {
  return translate(lang, `piece_${type}`);
}

function findKingSquare(chess: Chess, color: PieceColor): { r: number; c: number; sq: Square } | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.color === color && cell.type === 'k') {
        return { r, c, sq: rcToSquare(r, c) };
      }
    }
  }
  return null;
}

function findPinningAttacker(
  chess: Chess,
  pieceR: number,
  pieceC: number,
  color: PieceColor
): { type: PieceType; r: number; c: number; sq: Square } | null {
  const king = findKingSquare(chess, color);
  if (!king) return null;

  const dr = pieceR - king.r;
  const dc = pieceC - king.c;
  const isOrtho = dr === 0 || dc === 0;
  const isDiag = Math.abs(dr) === Math.abs(dc);
  if ((!isOrtho && !isDiag) || (dr === 0 && dc === 0)) return null;

  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);

  // Verify nothing sits strictly between King and the piece
  let curR = king.r + stepR;
  let curC = king.c + stepC;
  while (curR !== pieceR || curC !== pieceC) {
    if (chess.get(rcToSquare(curR, curC))) return null;
    curR += stepR;
    curC += stepC;
  }

  // Scan beyond the piece for an enemy slider along the same ray
  const oppColor: PieceColor = color === 'w' ? 'b' : 'w';
  curR = pieceR + stepR;
  curC = pieceC + stepC;
  while (curR >= 0 && curR < 8 && curC >= 0 && curC < 8) {
    const sq = rcToSquare(curR, curC);
    const occupant = chess.get(sq);
    if (occupant) {
      if (occupant.color === oppColor) {
        const canPin =
          occupant.type === 'q' ||
          (isOrtho && occupant.type === 'r') ||
          (isDiag && occupant.type === 'b');
        if (canPin) {
          return {
            type: SYMBOL_TO_TYPE[occupant.type],
            r: curR,
            c: curC,
            sq,
          };
        }
      }
      return null;
    }
    curR += stepR;
    curC += stepC;
  }
  return null;
}

function findFirstRayBlocker(
  chess: Chess,
  fromR: number,
  fromC: number,
  toR: number,
  toC: number
): { r: number; c: number; sq: Square } | null {
  const stepR = Math.sign(toR - fromR);
  const stepC = Math.sign(toC - fromC);
  let r = fromR + stepR;
  let c = fromC + stepC;
  while (r !== toR || c !== toC) {
    const sq = rcToSquare(r, c);
    if (chess.get(sq)) {
      return { r, c, sq };
    }
    r += stepR;
    c += stepC;
  }
  return null;
}

function diagnoseCastlingAttempt(
  chess: Chess,
  fen: string,
  color: PieceColor,
  fromSq: string,
  side: 'k' | 'q',
  lang: Language
): RuleViolationDiagnosis {
  const homeRow = color === 'w' ? 7 : 0;
  const oppColor: PieceColor = color === 'w' ? 'b' : 'w';
  const kingSq = rcToSquare(homeRow, 4);
  const targetSq = rcToSquare(homeRow, side === 'k' ? 6 : 2);
  const sideLabel = translate(lang, side === 'k' ? 'castleKingside' : 'castleQueenside');

  const castlingField = fen.split(' ')[2] || '-';
  const rightChar = color === 'w' ? (side === 'k' ? 'K' : 'Q') : side === 'k' ? 'k' : 'q';
  if (!castlingField.includes(rightChar)) {
    return {
      code: 'castle_rights_lost',
      title: translate(lang, 'ruleCastleRightsLostTitle'),
      reason: translate(lang, 'ruleCastleRightsLost', { side: sideLabel }),
      from: fromSq,
      to: targetSq,
      pieceType: 'king',
      highlightSquares: [{ r: homeRow, c: 4, kind: 'warn' }],
    };
  }

  if (chess.inCheck()) {
    return {
      code: 'castle_in_check',
      title: translate(lang, 'ruleCastleInCheckTitle'),
      reason: translate(lang, 'ruleCastleInCheck', { kingSq }),
      from: fromSq,
      to: targetSq,
      pieceType: 'king',
      highlightSquares: [{ r: homeRow, c: 4, kind: 'danger' }],
    };
  }

  const betweenCols = side === 'k' ? [5, 6] : [1, 2, 3];
  const blockers = betweenCols
    .map((c) => ({ r: homeRow, c, sq: rcToSquare(homeRow, c) }))
    .filter((item) => Boolean(chess.get(item.sq)));

  if (blockers.length > 0) {
    return {
      code: 'castle_blocked',
      title: translate(lang, 'ruleCastleBlockedTitle'),
      reason: translate(lang, 'ruleCastleBlocked', {
        squares: blockers.map((b) => b.sq).join(', '),
      }),
      from: fromSq,
      to: targetSq,
      pieceType: 'king',
      highlightSquares: blockers.map((b) => ({ r: b.r, c: b.c, kind: 'warn' })),
    };
  }

  const transitCols = side === 'k' ? [5, 6] : [3, 2];
  for (const col of transitCols) {
    const sq = rcToSquare(homeRow, col);
    if (chess.isAttacked(sq, oppColor)) {
      return {
        code: 'castle_through_check',
        title: translate(lang, 'ruleCastleThroughCheckTitle'),
        reason: translate(lang, 'ruleCastleThroughCheck', { square: sq }),
        from: fromSq,
        to: targetSq,
        pieceType: 'king',
        highlightSquares: [{ r: homeRow, c: col, kind: 'danger' }],
      };
    }
  }

  return {
    code: 'castle_rights_lost',
    title: translate(lang, 'ruleCastleRightsLostTitle'),
    reason: translate(lang, 'ruleCastleRightsLost', { side: sideLabel }),
    from: fromSq,
    to: targetSq,
    pieceType: 'king',
    highlightSquares: [{ r: homeRow, c: 4, kind: 'warn' }],
  };
}

export function diagnoseIllegalMove(
  fen: string,
  fromR: number,
  fromC: number,
  toR: number,
  toC: number,
  lang: Language
): RuleViolationDiagnosis {
  const chess = new Chess(fen, { skipValidation: true });
  const fromSq = rcToSquare(fromR, fromC);
  const toSq = rcToSquare(toR, toC);
  const piece = chess.get(fromSq);

  if (!piece) {
    return {
      code: 'invalid_pattern',
      title: translate(lang, 'ruleInvalidPatternTitle'),
      reason: translate(lang, 'ruleInvalidPatternKing'),
      from: fromSq,
      to: toSq,
      pieceType: 'king',
      highlightSquares: [],
    };
  }

  const pieceType = SYMBOL_TO_TYPE[piece.type];
  const color: PieceColor = piece.color;
  const targetPiece = chess.get(toSq);
  const dr = toR - fromR;
  const dc = toC - fromC;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);
  const homeRow = color === 'w' ? 7 : 0;

  // 1. Castling attempt detection (king to g/c OR king clicking own rook on h/a)
  const isKingCastleDest =
    pieceType === 'king' && fromR === homeRow && fromC === 4 && toR === homeRow && (toC === 6 || toC === 2);
  const isKingClicksOwnRook =
    pieceType === 'king' &&
    fromR === homeRow &&
    fromC === 4 &&
    toR === homeRow &&
    (toC === 7 || toC === 0) &&
    targetPiece?.color === color &&
    targetPiece?.type === 'r';

  if (isKingCastleDest || isKingClicksOwnRook) {
    const side: 'k' | 'q' = toC >= 6 ? 'k' : 'q';
    return diagnoseCastlingAttempt(chess, fen, color, fromSq, side, lang);
  }

  // 2. Geometry & path-blocking checks per piece type
  if (pieceType === 'pawn') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    const forwardStep = dr * dir;

    if (forwardStep < 0) {
      return {
        code: 'pawn_backward',
        title: translate(lang, 'rulePawnBackwardTitle'),
        reason: translate(lang, 'rulePawnBackward', { from: fromSq, to: toSq }),
        from: fromSq,
        to: toSq,
        pieceType,
        highlightSquares: [{ r: toR, c: toC, kind: 'danger' }],
      };
    }

    if (dc === 0 && forwardStep === 1) {
      if (targetPiece) {
        return {
          code: 'pawn_blocked_forward',
          title: translate(lang, 'rulePawnBlockedForwardTitle'),
          reason: translate(lang, 'rulePawnBlockedForward', { to: toSq }),
          from: fromSq,
          to: toSq,
          pieceType,
          highlightSquares: [{ r: toR, c: toC, kind: 'warn' }],
        };
      }
    } else if (dc === 0 && forwardStep === 2) {
      if (fromR !== startRow) {
        return {
          code: 'pawn_double_only_start',
          title: translate(lang, 'rulePawnDoubleOnlyStartTitle'),
          reason: translate(lang, 'rulePawnDoubleOnlyStart'),
          from: fromSq,
          to: toSq,
          pieceType,
          highlightSquares: [{ r: toR, c: toC, kind: 'warn' }],
        };
      }
      const midR = fromR + dir;
      const midSq = rcToSquare(midR, fromC);
      if (chess.get(midSq)) {
        return {
          code: 'path_blocked',
          title: translate(lang, 'rulePathBlockedTitle'),
          reason: translate(lang, 'rulePathBlocked', {
            piece: pieceName(pieceType, lang),
            blocker: midSq,
          }),
          from: fromSq,
          to: toSq,
          pieceType,
          highlightSquares: [{ r: midR, c: fromC, kind: 'warn' }],
        };
      }
      if (targetPiece) {
        return {
          code: 'pawn_blocked_forward',
          title: translate(lang, 'rulePawnBlockedForwardTitle'),
          reason: translate(lang, 'rulePawnBlockedForward', { to: toSq }),
          from: fromSq,
          to: toSq,
          pieceType,
          highlightSquares: [{ r: toR, c: toC, kind: 'warn' }],
        };
      }
    } else if (absDc === 1 && forwardStep === 1) {
      const epSq = fen.split(' ')[3];
      const isEpTarget = epSq && epSq === toSq;
      if ((!targetPiece || targetPiece.color === color) && !isEpTarget) {
        return {
          code: 'pawn_diagonal_needs_capture',
          title: translate(lang, 'rulePawnDiagonalNeedsCaptureTitle'),
          reason: translate(lang, 'rulePawnDiagonalNeedsCapture', { from: fromSq, to: toSq }),
          from: fromSq,
          to: toSq,
          pieceType,
          highlightSquares: [{ r: toR, c: toC, kind: 'warn' }],
        };
      }
    } else {
      return {
        code: 'invalid_pattern',
        title: translate(lang, 'ruleInvalidPatternTitle'),
        reason: translate(lang, 'ruleInvalidPatternPawn', { from: fromSq, to: toSq }),
        from: fromSq,
        to: toSq,
        pieceType,
        highlightSquares: [{ r: toR, c: toC, kind: 'warn' }],
      };
    }
  } else if (pieceType === 'knight') {
    const isL = (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);
    if (!isL) {
      return {
        code: 'invalid_pattern',
        title: translate(lang, 'ruleInvalidPatternTitle'),
        reason: translate(lang, 'ruleInvalidPatternKnight'),
        from: fromSq,
        to: toSq,
        pieceType,
        highlightSquares: [{ r: toR, c: toC, kind: 'warn' }],
      };
    }
  } else if (pieceType === 'bishop' || pieceType === 'rook' || pieceType === 'queen') {
    const isOrtho = (absDr === 0 && absDc > 0) || (absDc === 0 && absDr > 0);
    const isDiag = absDr > 0 && absDr === absDc;
    const patternOk =
      (pieceType === 'bishop' && isDiag) ||
      (pieceType === 'rook' && isOrtho) ||
      (pieceType === 'queen' && (isOrtho || isDiag));

    if (!patternOk) {
      const msgKey =
        pieceType === 'bishop'
          ? 'ruleInvalidPatternBishop'
          : pieceType === 'rook'
            ? 'ruleInvalidPatternRook'
            : 'ruleInvalidPatternQueen';
      return {
        code: 'invalid_pattern',
        title: translate(lang, 'ruleInvalidPatternTitle'),
        reason: translate(lang, msgKey),
        from: fromSq,
        to: toSq,
        pieceType,
        highlightSquares: [{ r: toR, c: toC, kind: 'warn' }],
      };
    }

    const blocker = findFirstRayBlocker(chess, fromR, fromC, toR, toC);
    if (blocker) {
      return {
        code: 'path_blocked',
        title: translate(lang, 'rulePathBlockedTitle'),
        reason: translate(lang, 'rulePathBlocked', {
          piece: pieceName(pieceType, lang),
          blocker: blocker.sq,
        }),
        from: fromSq,
        to: toSq,
        pieceType,
        highlightSquares: [{ r: blocker.r, c: blocker.c, kind: 'warn' }],
      };
    }
  } else if (pieceType === 'king') {
    if (absDr > 1 || absDc > 1 || (absDr === 0 && absDc === 0)) {
      return {
        code: 'invalid_pattern',
        title: translate(lang, 'ruleInvalidPatternTitle'),
        reason: translate(lang, 'ruleInvalidPatternKing'),
        from: fromSq,
        to: toSq,
        pieceType,
        highlightSquares: [{ r: toR, c: toC, kind: 'warn' }],
      };
    }
  }

  // 3. Geometry & path are valid -> FIDE king-safety (check / pin) makes this illegal
  const king = findKingSquare(chess, color);
  const kingSq = king ? king.sq : '';

  if (pieceType === 'king') {
    return {
      code: 'king_moves_into_check',
      title: translate(lang, 'ruleKingMovesIntoCheckTitle'),
      reason: translate(lang, 'ruleKingMovesIntoCheck', { to: toSq }),
      from: fromSq,
      to: toSq,
      pieceType,
      highlightSquares: [{ r: toR, c: toC, kind: 'danger' }],
    };
  }

  if (chess.inCheck()) {
    return {
      code: 'must_resolve_check',
      title: translate(lang, 'ruleMustResolveCheckTitle'),
      reason: translate(lang, 'ruleMustResolveCheck', {
        kingSq,
        from: fromSq,
        to: toSq,
      }),
      from: fromSq,
      to: toSq,
      pieceType,
      highlightSquares: king ? [{ r: king.r, c: king.c, kind: 'danger' }] : [],
    };
  }

  const pinner = findPinningAttacker(chess, fromR, fromC, color);
  if (pinner) {
    const highlights: CoachSquareHighlight[] = [
      { r: pinner.r, c: pinner.c, kind: 'pin' },
    ];
    if (king) highlights.push({ r: king.r, c: king.c, kind: 'danger' });

    return {
      code: 'piece_pinned',
      title: translate(lang, 'rulePiecePinnedTitle'),
      reason: translate(lang, 'rulePiecePinned', {
        piece: pieceName(pieceType, lang),
        from: fromSq,
        pinner: pieceName(pinner.type, lang),
        pinnerSq: pinner.sq,
        kingSq,
      }),
      from: fromSq,
      to: toSq,
      pieceType,
      highlightSquares: highlights,
    };
  }

  return {
    code: 'piece_pinned',
    title: translate(lang, 'rulePiecePinnedTitle'),
    reason: translate(lang, 'rulePiecePinnedGeneric', {
      piece: pieceName(pieceType, lang),
      from: fromSq,
      kingSq,
    }),
    from: fromSq,
    to: toSq,
    pieceType,
    highlightSquares: king ? [{ r: king.r, c: king.c, kind: 'danger' }] : [],
  };
}

export function diagnoseNoLegalMoves(
  fen: string,
  r: number,
  c: number,
  lang: Language
): RuleViolationDiagnosis | null {
  const chess = new Chess(fen, { skipValidation: true });
  const sq = rcToSquare(r, c);
  const piece = chess.get(sq);
  if (!piece) return null;

  const moves = chess.moves({ square: sq });
  if (moves.length > 0) return null;

  const pieceType = SYMBOL_TO_TYPE[piece.type];
  const color: PieceColor = piece.color;
  const king = findKingSquare(chess, color);
  const kingSq = king ? king.sq : '';
  const pName = pieceName(pieceType, lang);
  const title = translate(lang, 'coachNoMovesTitle', { piece: pName });

  if (chess.inCheck()) {
    return {
      code: 'no_moves_in_check',
      title,
      reason: translate(lang, 'ruleNoMovesInCheck', {
        kingSq,
        piece: pName,
        from: sq,
      }),
      from: sq,
      to: sq,
      pieceType,
      highlightSquares: king ? [{ r: king.r, c: king.c, kind: 'danger' }] : [],
    };
  }

  const pinner = findPinningAttacker(chess, r, c, color);
  if (pinner) {
    const highlights: CoachSquareHighlight[] = [
      { r: pinner.r, c: pinner.c, kind: 'pin' },
    ];
    if (king) highlights.push({ r: king.r, c: king.c, kind: 'danger' });
    return {
      code: 'no_moves_pinned',
      title,
      reason: translate(lang, 'ruleNoMovesPinned', {
        piece: pName,
        from: sq,
        pinner: pieceName(pinner.type, lang),
        pinnerSq: pinner.sq,
        kingSq,
      }),
      from: sq,
      to: sq,
      pieceType,
      highlightSquares: highlights,
    };
  }

  return {
    code: 'no_moves_blocked',
    title,
    reason: translate(lang, 'ruleNoMovesBlocked', {
      piece: pName,
      from: sq,
    }),
    from: sq,
    to: sq,
    pieceType,
    highlightSquares: [{ r, c, kind: 'warn' }],
  };
}

export function getSquareCoords(sq: string): { r: number; c: number } {
  return squareToRC(sq);
}
