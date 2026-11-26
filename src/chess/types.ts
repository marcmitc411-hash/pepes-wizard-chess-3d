export type PieceColor = 'w' | 'b';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';

export interface BoardCoord {
  r: number;
  c: number;
}

export interface LegalMoveInfo {
  r: number; // destination row (for compatibility with board interaction)
  c: number; // destination col (for compatibility with board interaction)
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  from: string;
  to: string;
  capture: boolean;
  isEnPassant: boolean;
  enPassantCapturedR?: number;
  enPassantCapturedC?: number;
  castle?: 'k' | 'q';
  rookFromC?: number;
  rookToC?: number;
  isPromotion: boolean;
  promotion?: PromotionPiece;
  san: string;
  uci: string;
}

export type GameOutcome =
  | 'ongoing'
  | 'checkmate'
  | 'stalemate'
  | 'draw_fifty'
  | 'draw_repetition'
  | 'draw_material'
  | 'draw_other';

export interface GameStatus {
  turn: PieceColor;
  inCheck: boolean;
  isGameOver: boolean;
  outcome: GameOutcome;
  winner: PieceColor | null;
  fen: string;
  moveNumber: number;
  historySan: string[];
  historyUci: string[];
  lastMove?: {
    fromR: number;
    fromC: number;
    toR: number;
    toC: number;
    uci: string;
    san: string;
  };
}

export interface CustomBoardPiece {
  type: PieceType;
  color: PieceColor;
  r: number;
  c: number;
  hasMoved?: boolean;
}
