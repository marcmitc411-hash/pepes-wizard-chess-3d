import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import type {
  CustomBoardPiece,
  GameOutcome,
  GameStatus,
  LegalMoveInfo,
  PieceColor,
  PieceType,
  PromotionPiece,
} from './types.ts';

const TO_PIECE_TYPE: Record<PieceSymbol, PieceType> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const TO_CHESS_SYMBOL: Record<PieceType, PieceSymbol> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};

export function rcToSquare(r: number, c: number): Square {
  const file = String.fromCharCode(97 + c);
  const rank = String(8 - r);
  return `${file}${rank}` as Square;
}

export function squareToRC(sq: string): { r: number; c: number } {
  const c = sq.charCodeAt(0) - 97;
  const r = 8 - parseInt(sq[1], 10);
  return { r, c };
}

export function parseUciString(uci: string): {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  promotion?: PromotionPiece;
} | null {
  const trimmed = uci.trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(trimmed)) return null;
  const from = squareToRC(trimmed.slice(0, 2));
  const to = squareToRC(trimmed.slice(2, 4));
  const promoChar = trimmed[4] as 'q' | 'r' | 'b' | 'n' | undefined;
  const promotion = promoChar ? (TO_PIECE_TYPE[promoChar] as PromotionPiece) : undefined;
  return {
    fromR: from.r,
    fromC: from.c,
    toR: to.r,
    toC: to.c,
    promotion,
  };
}

function moveToLegalInfo(move: Move): LegalMoveInfo {
  const fromRC = squareToRC(move.from);
  const toRC = squareToRC(move.to);
  const isEp = move.isEnPassant();
  const isKingsideCastle = move.isKingsideCastle();
  const isQueensideCastle = move.isQueensideCastle();
  const isPromotion = move.isPromotion();

  let castle: 'k' | 'q' | undefined;
  let rookFromC: number | undefined;
  let rookToC: number | undefined;
  if (isKingsideCastle) {
    castle = 'k';
    rookFromC = 7;
    rookToC = 5;
  } else if (isQueensideCastle) {
    castle = 'q';
    rookFromC = 0;
    rookToC = 3;
  }

  const promotion = move.promotion
    ? (TO_PIECE_TYPE[move.promotion] as PromotionPiece)
    : undefined;

  return {
    r: toRC.r,
    c: toRC.c,
    fromR: fromRC.r,
    fromC: fromRC.c,
    toR: toRC.r,
    toC: toRC.c,
    from: move.from,
    to: move.to,
    capture: move.isCapture() || isEp,
    isEnPassant: isEp,
    enPassantCapturedR: isEp ? fromRC.r : undefined,
    enPassantCapturedC: isEp ? toRC.c : undefined,
    castle,
    rookFromC,
    rookToC,
    isPromotion,
    promotion,
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
  };
}

export class ChessRulesEngine {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  reset(): void {
    this.chess.reset();
  }

  loadFen(fen: string): boolean {
    try {
      this.chess.load(fen);
      return true;
    } catch {
      return false;
    }
  }

  loadHistoryUci(uciMoves: string[]): boolean {
    const temp = new Chess();
    for (const uci of uciMoves) {
      const parsed = parseUciString(uci);
      if (!parsed) return false;
      const from = rcToSquare(parsed.fromR, parsed.fromC);
      const to = rcToSquare(parsed.toR, parsed.toC);
      const promo = parsed.promotion ? TO_CHESS_SYMBOL[parsed.promotion] : undefined;
      try {
        temp.move({ from, to, promotion: promo });
      } catch {
        return false;
      }
    }
    this.chess = temp;
    return true;
  }

  getFen(): string {
    return this.chess.fen();
  }

  getTurn(): PieceColor {
    return this.chess.turn();
  }

  getPgn(): string {
    return this.chess.pgn();
  }

  getLegalMovesFrom(r: number, c: number): LegalMoveInfo[] {
    if (r < 0 || r > 7 || c < 0 || c > 7) return [];
    const square = rcToSquare(r, c);
    const verboseMoves = this.chess.moves({ square, verbose: true });

    // Deduplicate promotion targets so board highlighting shows one indicator per target square,
    // preferring queen promotion metadata by default.
    const byTarget = new Map<string, LegalMoveInfo>();
    for (const mv of verboseMoves) {
      const info = moveToLegalInfo(mv);
      const key = `${info.toR},${info.toC}`;
      const existing = byTarget.get(key);
      if (!existing || info.promotion === 'queen') {
        byTarget.set(key, info);
      }
    }
    return Array.from(byTarget.values());
  }

  getAllLegalMoves(): LegalMoveInfo[] {
    const verboseMoves = this.chess.moves({ verbose: true });
    return verboseMoves.map(moveToLegalInfo);
  }

  isPromotionMove(fromR: number, fromC: number, toR: number, toC: number): boolean {
    const moves = this.getLegalMovesFrom(fromR, fromC);
    return moves.some((m) => m.toR === toR && m.toC === toC && m.isPromotion);
  }

  applyMove(
    fromR: number,
    fromC: number,
    toR: number,
    toC: number,
    promotion?: PromotionPiece
  ): LegalMoveInfo | null {
    const from = rcToSquare(fromR, fromC);
    const to = rcToSquare(toR, toC);
    const isPromo = this.isPromotionMove(fromR, fromC, toR, toC);
    const promoSymbol = isPromo
      ? TO_CHESS_SYMBOL[promotion ?? 'queen']
      : undefined;

    try {
      const moved = this.chess.move({
        from,
        to,
        promotion: promoSymbol,
      });
      return moveToLegalInfo(moved);
    } catch {
      return null;
    }
  }

  applyUciMove(uci: string): LegalMoveInfo | null {
    const parsed = parseUciString(uci);
    if (!parsed) return null;
    return this.applyMove(
      parsed.fromR,
      parsed.fromC,
      parsed.toR,
      parsed.toC,
      parsed.promotion
    );
  }

  undo(): boolean {
    return this.chess.undo() !== null;
  }

  getStatus(): GameStatus {
    const turn = this.chess.turn();
    const inCheck = this.chess.inCheck();
    const isCheckmate = this.chess.isCheckmate();
    const isStalemate = this.chess.isStalemate();
    const isThreefold = this.chess.isThreefoldRepetition();
    const isFifty = this.chess.isDrawByFiftyMoves();
    const isInsufficient = this.chess.isInsufficientMaterial();
    const isGameOver = this.chess.isGameOver();

    let outcome: GameOutcome = 'ongoing';
    let winner: PieceColor | null = null;

    if (isCheckmate) {
      outcome = 'checkmate';
      winner = turn === 'w' ? 'b' : 'w';
    } else if (isStalemate) {
      outcome = 'stalemate';
    } else if (isThreefold) {
      outcome = 'draw_repetition';
    } else if (isFifty) {
      outcome = 'draw_fifty';
    } else if (isInsufficient) {
      outcome = 'draw_material';
    } else if (isGameOver) {
      outcome = 'draw_other';
    }

    const verboseHistory = this.chess.history({ verbose: true });
    const historySan = verboseHistory.map((m) => m.san);
    const historyUci = verboseHistory.map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
    const lastVerbose = verboseHistory[verboseHistory.length - 1];
    const lastMove = lastVerbose
      ? (() => {
          const f = squareToRC(lastVerbose.from);
          const t = squareToRC(lastVerbose.to);
          return {
            fromR: f.r,
            fromC: f.c,
            toR: t.r,
            toC: t.c,
            uci: `${lastVerbose.from}${lastVerbose.to}${lastVerbose.promotion ?? ''}`,
            san: lastVerbose.san,
          };
        })()
      : undefined;

    return {
      turn,
      inCheck,
      isGameOver,
      outcome,
      winner,
      fen: this.chess.fen(),
      moveNumber: Math.floor(verboseHistory.length / 2) + 1,
      historySan,
      historyUci,
      lastMove,
    };
  }

  syncFromCustomBoard(pieces: CustomBoardPiece[], turn: PieceColor = 'w'): boolean {
    const grid: (CustomBoardPiece | null)[][] = Array.from({ length: 8 }, () =>
      Array(8).fill(null)
    );
    for (const p of pieces) {
      if (p.r >= 0 && p.r < 8 && p.c >= 0 && p.c < 8) {
        grid[p.r][p.c] = p;
      }
    }

    const fenRows: string[] = [];
    for (let r = 0; r < 8; r++) {
      let rowStr = '';
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const cell = grid[r][c];
        if (!cell) {
          empty++;
        } else {
          if (empty > 0) {
            rowStr += String(empty);
            empty = 0;
          }
          const sym = TO_CHESS_SYMBOL[cell.type];
          rowStr += cell.color === 'w' ? sym.toUpperCase() : sym;
        }
      }
      if (empty > 0) rowStr += String(empty);
      fenRows.push(rowStr);
    }

    // Infer castling availability from home-square pieces & hasMoved flags
    let castling = '';
    const wKing = grid[7][4];
    if (wKing && wKing.type === 'king' && wKing.color === 'w' && !wKing.hasMoved) {
      const wKRook = grid[7][7];
      const wQRook = grid[7][0];
      if (wKRook && wKRook.type === 'rook' && wKRook.color === 'w' && !wKRook.hasMoved) castling += 'K';
      if (wQRook && wQRook.type === 'rook' && wQRook.color === 'w' && !wQRook.hasMoved) castling += 'Q';
    }
    const bKing = grid[0][4];
    if (bKing && bKing.type === 'king' && bKing.color === 'b' && !bKing.hasMoved) {
      const bKRook = grid[0][7];
      const bQRook = grid[0][0];
      if (bKRook && bKRook.type === 'rook' && bKRook.color === 'b' && !bKRook.hasMoved) castling += 'k';
      if (bQRook && bQRook.type === 'rook' && bQRook.color === 'b' && !bQRook.hasMoved) castling += 'q';
    }
    if (!castling) castling = '-';

    const fen = `${fenRows.join('/')} ${turn} ${castling} - 0 1`;
    try {
      this.chess.load(fen, { skipValidation: true });
      return true;
    } catch {
      return false;
    }
  }

  getBoardPieces(): Array<{ type: PieceType; color: PieceColor; r: number; c: number }> {
    const board = this.chess.board();
    const pieces: Array<{ type: PieceType; color: PieceColor; r: number; c: number }> = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (cell) {
          pieces.push({
            type: TO_PIECE_TYPE[cell.type],
            color: cell.color,
            r,
            c,
          });
        }
      }
    }
    return pieces;
  }
}

export function sanListToUciMoves(
  sanMoves: string[],
  startFen?: string
): Array<{
  index: number;
  ply: number;
  moveNumber: number;
  color: PieceColor;
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  uci: string;
  san: string;
  pieceType: PieceType;
  capture: boolean;
  promotion?: PromotionPiece;
}> {
  const chess = startFen ? new Chess(startFen, { skipValidation: true }) : new Chess();
  const result = [];
  for (let i = 0; i < sanMoves.length; i++) {
    const sanInput = sanMoves[i];
    const moved = chess.move(sanInput);
    const f = squareToRC(moved.from);
    const t = squareToRC(moved.to);
    const promotion = moved.promotion
      ? (TO_PIECE_TYPE[moved.promotion] as PromotionPiece)
      : undefined;
    result.push({
      index: i,
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: moved.color,
      fromR: f.r,
      fromC: f.c,
      toR: t.r,
      toC: t.c,
      uci: `${moved.from}${moved.to}${moved.promotion ?? ''}`,
      san: moved.san,
      pieceType: TO_PIECE_TYPE[moved.piece],
      capture: moved.isCapture() || moved.isEnPassant(),
      promotion,
    });
  }
  return result;
}
