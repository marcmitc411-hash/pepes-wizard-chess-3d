import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { parseUciString, rcToSquare, squareToRC } from '../chess/rules.ts';
import type { PieceColor, PieceType, PromotionPiece } from '../chess/types.ts';
import type { StockfishService } from '../engine/stockfishService.ts';
import type { UciInfoLine } from '../engine/uciStrength.ts';
import { translate, type Language } from '../i18n/translations.ts';
import type { CoachSquareHighlight, RuleViolationDiagnosis } from './ruleDiagnostics.ts';

export type MoveVerdict =
  | 'illegal'
  | 'blunder'
  | 'mistake'
  | 'inaccuracy'
  | 'good'
  | 'best';

export interface AlternativeSuggestion {
  uci: string;
  san: string;
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  promotion?: PromotionPiece;
  evalText: string;
  pvSan: string[];
  reason: string;
}

export interface CoachReviewResult {
  kind: 'legal' | 'illegal' | 'no_moves';
  verdict: MoveVerdict;
  shouldWarn: boolean;
  plannedMove?: {
    fromR: number;
    fromC: number;
    toR: number;
    toC: number;
    uci: string;
    san: string;
    promotion?: PromotionPiece;
  };
  cpLoss?: number;
  evalBeforeText?: string;
  evalAfterText?: string;
  title: string;
  reason: string;
  refutationSan?: string[];
  alternatives: AlternativeSuggestion[];
  highlightSquares?: CoachSquareHighlight[];
}

const SYMBOL_TO_TYPE: Record<PieceSymbol, PieceType> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const PIECE_CP: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

function pieceName(type: PieceType, lang: Language): string {
  return translate(lang, `piece_${type}`);
}

function uciToChessMoveObj(uci: string): { from: string; to: string; promotion?: string } | null {
  const trimmed = uci.trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(trimmed)) return null;
  return {
    from: trimmed.slice(0, 2),
    to: trimmed.slice(2, 4),
    promotion: trimmed[4],
  };
}

function normalizeToPlayerCp(scoreType: 'cp' | 'mate', scoreValue: number): number {
  if (scoreType === 'cp') return scoreValue;
  return scoreValue > 0 ? 20000 - scoreValue * 100 : -20000 - scoreValue * 100;
}

export function formatEvalText(scoreType: 'cp' | 'mate', scoreValue: number): string {
  if (scoreType === 'mate') {
    return scoreValue > 0 ? `+M${scoreValue}` : `-M${Math.abs(scoreValue)}`;
  }
  const pawns = scoreValue / 100;
  const sign = pawns > 0.04 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

export function convertPvToSan(fen: string, pvUci: string[], maxPlies = 4): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (let i = 0; i < Math.min(pvUci.length, maxPlies); i++) {
    const mvObj = uciToChessMoveObj(pvUci[i]);
    if (!mvObj) break;
    try {
      const moved = chess.move(mvObj);
      sans.push(moved.san);
    } catch {
      break;
    }
  }
  return sans;
}

export function detectForkTargets(
  chessAfterMove: Chess,
  movedToSquare: Square,
  moverColor: PieceColor
): Array<{ square: Square; piece: PieceType }> {
  const attacker = chessAfterMove.get(movedToSquare);
  if (!attacker || attacker.color !== moverColor) return [];

  const oppColor: PieceColor = moverColor === 'w' ? 'b' : 'w';
  const board = chessAfterMove.board();
  const targets: Array<{ square: Square; piece: PieceType }> = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell || cell.color !== oppColor) continue;
      const sq = rcToSquare(r, c);
      if (!chessAfterMove.attackers(sq, moverColor).includes(movedToSquare)) continue;

      const isKing = cell.type === 'k';
      const higherValue = PIECE_CP[cell.type] > PIECE_CP[attacker.type];
      const undefended = chessAfterMove.attackers(sq, oppColor).length === 0;
      if (isKing || higherValue || undefended) {
        targets.push({ square: sq, piece: SYMBOL_TO_TYPE[cell.type] });
      }
    }
  }

  return targets;
}

export function explainAlternativeMove(
  fenBefore: string,
  line: UciInfoLine,
  lang: Language
): AlternativeSuggestion | null {
  const uci = line.pv[0];
  if (!uci) return null;
  const parsed = parseUciString(uci);
  const mvObj = uciToChessMoveObj(uci);
  if (!parsed || !mvObj) return null;

  const chess = new Chess(fenBefore);
  const moverColor = chess.turn();
  let moved;
  try {
    moved = chess.move(mvObj);
  } catch {
    return null;
  }

  const evalText = formatEvalText(line.scoreType, line.scoreValue);
  const pvSan = convertPvToSan(fenBefore, line.pv, 4);

  let reason: string;
  if (line.scoreType === 'mate' && line.scoreValue > 0) {
    reason = translate(lang, 'altForcesMate', { mate: line.scoreValue });
  } else if (moved.captured) {
    const capType = SYMBOL_TO_TYPE[moved.captured];
    reason = translate(lang, 'altWinsMaterial', {
      captured: pieceName(capType, lang),
      to: moved.to,
    });
  } else {
    const forkTargets = detectForkTargets(chess, moved.to, moverColor);
    if (forkTargets.length >= 2) {
      const targetStr = forkTargets
        .slice(0, 2)
        .map((t) => `${pieceName(t.piece, lang)} (${t.square})`)
        .join(' & ');
      reason = translate(lang, 'altCreatesFork', { targets: targetStr });
    } else if (moved.isKingsideCastle() || moved.isQueensideCastle()) {
      reason = translate(lang, 'altCastlesSafety');
    } else if (chess.inCheck()) {
      reason = translate(lang, 'altGivesCheck');
    } else if (
      (moved.piece === 'n' || moved.piece === 'b') &&
      ((moverColor === 'w' && moved.from[1] === '1') ||
        (moverColor === 'b' && moved.from[1] === '8'))
    ) {
      reason = translate(lang, 'altDevelopsPiece');
    } else if (
      moved.to === 'd4' ||
      moved.to === 'd5' ||
      moved.to === 'e4' ||
      moved.to === 'e5'
    ) {
      reason = translate(lang, 'altControlsCenter');
    } else {
      reason = translate(lang, 'altDefendsBest', { eval: evalText });
    }
  }

  return {
    uci,
    san: moved.san,
    fromR: parsed.fromR,
    fromC: parsed.fromC,
    toR: parsed.toR,
    toC: parsed.toC,
    promotion: parsed.promotion,
    evalText,
    pvSan,
    reason,
  };
}

function deduplicateLatestPv(lines: UciInfoLine[]): UciInfoLine[] {
  const maxDepth = lines.reduce((acc, l) => Math.max(acc, l.depth), 0);
  const byPv = new Map<number, UciInfoLine>();
  for (const l of lines) {
    const existing = byPv.get(l.multipv);
    if (!existing || l.depth >= existing.depth) {
      byPv.set(l.multipv, l);
    }
  }
  return Array.from(byPv.values())
    .filter((l) => l.depth >= Math.max(1, maxDepth - 1) && l.pv.length > 0)
    .sort((a, b) => a.multipv - b.multipv);
}

export function evaluatePlannedMoveFromLines(
  fenBefore: string,
  plannedUci: string,
  rawPreLines: UciInfoLine[],
  postBestLine: UciInfoLine | null,
  lang: Language
): CoachReviewResult {
  const parsedPlanned = parseUciString(plannedUci);
  const mvObj = uciToChessMoveObj(plannedUci);
  const chessBefore = new Chess(fenBefore);
  const playerColor = chessBefore.turn();
  const oppColor: PieceColor = playerColor === 'w' ? 'b' : 'w';

  if (!parsedPlanned || !mvObj) {
    return {
      kind: 'legal',
      verdict: 'good',
      shouldWarn: false,
      title: translate(lang, 'verdictGood'),
      reason: '',
      alternatives: [],
    };
  }

  const chessAfter = new Chess(fenBefore);
  let playedMove;
  try {
    playedMove = chessAfter.move(mvObj);
  } catch {
    return {
      kind: 'legal',
      verdict: 'good',
      shouldWarn: false,
      title: translate(lang, 'verdictGood'),
      reason: '',
      alternatives: [],
    };
  }

  const plannedMeta = {
    fromR: parsedPlanned.fromR,
    fromC: parsedPlanned.fromC,
    toR: parsedPlanned.toR,
    toC: parsedPlanned.toC,
    uci: plannedUci.toLowerCase(),
    san: playedMove.san,
    promotion: parsedPlanned.promotion,
  };

  // Immediate checkmate by the player is always best
  if (chessAfter.isCheckmate()) {
    return {
      kind: 'legal',
      verdict: 'best',
      shouldWarn: false,
      plannedMove: plannedMeta,
      cpLoss: 0,
      evalBeforeText: '+M1',
      evalAfterText: '+M1',
      title: translate(lang, 'verdictBest'),
      reason: translate(lang, 'altForcesMate', { mate: 1 }),
      alternatives: [],
    };
  }

  const preLines = deduplicateLatestPv(rawPreLines);
  const bestLine = preLines[0] ?? null;

  if (!bestLine) {
    return {
      kind: 'legal',
      verdict: 'good',
      shouldWarn: false,
      plannedMove: plannedMeta,
      title: translate(lang, 'verdictGood'),
      reason: '',
      alternatives: [],
    };
  }

  const matchedPre = preLines.find((l) => l.pv[0]?.toLowerCase() === plannedMeta.uci);

  let afterScoreType: 'cp' | 'mate' = 'cp';
  let afterScoreValue = 0;
  let refutationUci: string | undefined;

  if (matchedPre) {
    afterScoreType = matchedPre.scoreType;
    afterScoreValue = matchedPre.scoreValue;
    refutationUci = matchedPre.pv[1];
  } else if (postBestLine) {
    // postBestLine is from opponent's turn -> negate to get player's perspective
    afterScoreType = postBestLine.scoreType;
    afterScoreValue = -postBestLine.scoreValue;
    refutationUci = postBestLine.pv[0];
  } else if (chessAfter.isDraw()) {
    afterScoreType = 'cp';
    afterScoreValue = 0;
  } else {
    afterScoreType = bestLine.scoreType;
    afterScoreValue = bestLine.scoreValue;
  }

  const bestCp = normalizeToPlayerCp(bestLine.scoreType, bestLine.scoreValue);
  const afterCp = normalizeToPlayerCp(afterScoreType, afterScoreValue);
  const cpLoss = Math.max(0, bestCp - afterCp);
  const evalBeforeText = formatEvalText(bestLine.scoreType, bestLine.scoreValue);
  const evalAfterText = formatEvalText(afterScoreType, afterScoreValue);

  const allowsMate = afterScoreType === 'mate' && afterScoreValue < 0;
  const missesMate =
    bestLine.scoreType === 'mate' &&
    bestLine.scoreValue > 0 &&
    !(afterScoreType === 'mate' && afterScoreValue > 0);

  let verdict: MoveVerdict;
  if (allowsMate || missesMate || cpLoss >= 260) {
    verdict = 'blunder';
  } else if (cpLoss >= 130) {
    verdict = 'mistake';
  } else if (cpLoss >= 60) {
    verdict = 'inaccuracy';
  } else if (matchedPre === bestLine || cpLoss <= 15) {
    verdict = 'best';
  } else {
    verdict = 'good';
  }

  const shouldWarn = verdict === 'blunder' || verdict === 'mistake' || verdict === 'inaccuracy';

  const alternatives: AlternativeSuggestion[] = [];
  const seenUci = new Set<string>();
  for (const line of preLines) {
    if (line.pv[0]?.toLowerCase() === plannedMeta.uci) continue;
    const alt = explainAlternativeMove(fenBefore, line, lang);
    if (alt && !seenUci.has(alt.uci)) {
      seenUci.add(alt.uci);
      alternatives.push(alt);
    }
    if (alternatives.length >= 3) break;
  }

  if (!shouldWarn) {
    return {
      kind: 'legal',
      verdict,
      shouldWarn: false,
      plannedMove: plannedMeta,
      cpLoss,
      evalBeforeText,
      evalAfterText,
      title: translate(lang, verdict === 'best' ? 'verdictBest' : 'verdictGood'),
      reason: translate(
        lang,
        verdict === 'best' ? 'coachBestMove' : 'coachGoodMove',
        { san: playedMove.san, eval: evalAfterText }
      ),
      alternatives,
    };
  }

  // Diagnose concrete tactical problem for the warning card
  const fenAfter = chessAfter.fen();
  const refutationSan = refutationUci
    ? convertPvToSan(
        fenAfter,
        matchedPre ? matchedPre.pv.slice(1) : postBestLine?.pv ?? [refutationUci],
        4
      )
    : [];
  const firstRefSan = refutationSan[0] || '';
  const bestSan = alternatives[0]?.san || bestLine.pv[0];
  const lossStr = `-${(cpLoss / 100).toFixed(1)}`;

  let title = translate(lang, 'tacticPositionalDropTitle');
  let reason = translate(lang, 'tacticPositionalDrop', {
    san: playedMove.san,
    loss: lossStr,
    best: bestSan,
  });
  const highlightSquares: CoachSquareHighlight[] = [];

  if (allowsMate) {
    title = translate(lang, 'tacticAllowsMateTitle');
    reason = translate(lang, 'tacticAllowsMate', {
      san: playedMove.san,
      mate: Math.abs(afterScoreValue),
      refutation: firstRefSan || '...',
    });
  } else if (missesMate) {
    title = translate(lang, 'tacticMissesMateTitle');
    reason = translate(lang, 'tacticMissesMate', {
      best: bestSan,
      mate: bestLine.scoreValue,
    });
  } else if (refutationUci) {
    const refParsed = parseUciString(refutationUci);
    const refObj = uciToChessMoveObj(refutationUci);
    if (refParsed && refObj) {
      const chessAfterRef = new Chess(fenAfter);
      try {
        const refMoved = chessAfterRef.move(refObj);
        const oppForks = detectForkTargets(chessAfterRef, refMoved.to, oppColor);

        if (refMoved.captured && PIECE_CP[refMoved.captured] >= 300) {
          title = translate(lang, 'tacticHangsPieceTitle', { san: playedMove.san });
          reason = translate(lang, 'tacticHangsPiece', {
            san: playedMove.san,
            refutation: refMoved.san,
            target: refMoved.to,
          });
          highlightSquares.push({ r: refParsed.toR, c: refParsed.toC, kind: 'danger' });
        } else if (oppForks.length >= 2) {
          const targetStr = oppForks
            .slice(0, 2)
            .map((t) => `${pieceName(t.piece, lang)} (${t.square})`)
            .join(' & ');
          title = translate(lang, 'tacticAllowsForkTitle');
          reason = translate(lang, 'tacticAllowsFork', {
            san: playedMove.san,
            refutation: refMoved.san,
            targets: targetStr,
          });
          for (const ft of oppForks.slice(0, 2)) {
            const rc = squareToRC(ft.square);
            highlightSquares.push({ r: rc.r, c: rc.c, kind: 'danger' });
          }
        } else if (chessAfterRef.inCheck()) {
          title = translate(lang, 'tacticAllowsCheckTacticTitle');
          reason = translate(lang, 'tacticAllowsCheckTactic', {
            san: playedMove.san,
            refutation: refMoved.san,
            loss: lossStr,
          });
        } else {
          // Check if our moved piece itself is hanging on its destination square
          const movedSqAttackers = chessAfter.attackers(playedMove.to, oppColor);
          const movedSqDefenders = chessAfter.attackers(playedMove.to, playerColor);
          if (
            movedSqAttackers.length > 0 &&
            movedSqDefenders.length === 0 &&
            PIECE_CP[playedMove.piece] >= 300
          ) {
            title = translate(lang, 'tacticHangsPieceTitle', { san: playedMove.san });
            reason = translate(lang, 'tacticHangsPiece', {
              san: playedMove.san,
              refutation: firstRefSan || movedSqAttackers[0],
              target: playedMove.to,
            });
            highlightSquares.push({
              r: parsedPlanned.toR,
              c: parsedPlanned.toC,
              kind: 'danger',
            });
          } else {
            // Check if best alternative was a material-winning capture
            const bestAltMove = (() => {
              try {
                const c = new Chess(fenBefore);
                const bo = uciToChessMoveObj(bestLine.pv[0]);
                return bo ? c.move(bo) : null;
              } catch {
                return null;
              }
            })();
            if (bestAltMove?.captured) {
              title = translate(lang, 'tacticMissesMaterialTitle');
              reason = translate(lang, 'tacticMissesMaterial', {
                san: playedMove.san,
                best: bestSan,
                loss: lossStr,
              });
            }
          }
        }
      } catch {
        // keep positional fallback
      }
    }
  }

  return {
    kind: 'legal',
    verdict,
    shouldWarn: true,
    plannedMove: plannedMeta,
    cpLoss,
    evalBeforeText,
    evalAfterText,
    title,
    reason,
    refutationSan,
    alternatives,
    highlightSquares,
  };
}

export async function reviewPlannedMoveWithEngine(
  engine: StockfishService,
  fenBefore: string,
  planned: {
    fromR: number;
    fromC: number;
    toR: number;
    toC: number;
    promotion?: PromotionPiece;
  },
  lang: Language
): Promise<CoachReviewResult> {
  const fromSq = rcToSquare(planned.fromR, planned.fromC);
  const toSq = rcToSquare(planned.toR, planned.toC);
  const promoMap: Record<PromotionPiece, string> = {
    queen: 'q',
    rook: 'r',
    bishop: 'b',
    knight: 'n',
  };
  const promoChar = planned.promotion ? promoMap[planned.promotion] : '';
  const plannedUci = `${fromSq}${toSq}${promoChar}`;

  const preAnalysis = await engine.analyzePosition(fenBefore, {
    multiPv: 4,
    movetimeMs: 420,
  });

  if (preAnalysis.lines.length === 0) {
    // Stockfish unavailable (fallback mode): do not block gameplay
    return {
      kind: 'legal',
      verdict: 'good',
      shouldWarn: false,
      title: translate(lang, 'verdictGood'),
      reason: '',
      alternatives: [],
    };
  }

  const matchedPre = preAnalysis.lines.find(
    (l) => l.pv[0]?.toLowerCase() === plannedUci.toLowerCase()
  );

  let postBestLine: UciInfoLine | null = null;
  if (!matchedPre) {
    const chessAfter = new Chess(fenBefore);
    const mvObj = uciToChessMoveObj(plannedUci);
    if (mvObj) {
      try {
        chessAfter.move(mvObj);
        if (!chessAfter.isGameOver()) {
          const postAnalysis = await engine.analyzePosition(chessAfter.fen(), {
            multiPv: 1,
            movetimeMs: 320,
          });
          postBestLine = postAnalysis.lines[0] ?? null;
        }
      } catch {
        // ignore invalid temporary move
      }
    }
  }

  return evaluatePlannedMoveFromLines(
    fenBefore,
    plannedUci,
    preAnalysis.lines,
    postBestLine,
    lang
  );
}

export async function buildIllegalMoveReviewWithEngine(
  engine: StockfishService,
  fenBefore: string,
  diagnosis: RuleViolationDiagnosis,
  lang: Language,
  kind: 'illegal' | 'no_moves' = 'illegal'
): Promise<CoachReviewResult> {
  let alternatives: AlternativeSuggestion[] = [];
  const analysis = await engine.analyzePosition(fenBefore, {
    multiPv: 3,
    movetimeMs: 360,
  });

  const seenUci = new Set<string>();
  for (const line of deduplicateLatestPv(analysis.lines)) {
    const alt = explainAlternativeMove(fenBefore, line, lang);
    if (alt && !seenUci.has(alt.uci)) {
      seenUci.add(alt.uci);
      alternatives.push(alt);
    }
    if (alternatives.length >= 3) break;
  }

  // Fallback to legal chess.js moves if Stockfish is unavailable
  if (alternatives.length === 0) {
    const chess = new Chess(fenBefore);
    const legal = chess.moves({ verbose: true }).slice(0, 3);
    alternatives = legal.map((mv) => {
      const f = squareToRC(mv.from);
      const t = squareToRC(mv.to);
      return {
        uci: `${mv.from}${mv.to}${mv.promotion ?? ''}`,
        san: mv.san,
        fromR: f.r,
        fromC: f.c,
        toR: t.r,
        toC: t.c,
        promotion: mv.promotion ? (SYMBOL_TO_TYPE[mv.promotion] as PromotionPiece) : undefined,
        evalText: '—',
        pvSan: [mv.san],
        reason: mv.captured
          ? translate(lang, 'altWinsMaterial', {
              captured: pieceName(SYMBOL_TO_TYPE[mv.captured], lang),
              to: mv.to,
            })
          : translate(lang, 'altControlsCenter'),
      };
    });
  }

  return {
    kind,
    verdict: 'illegal',
    shouldWarn: true,
    title: diagnosis.title,
    reason: diagnosis.reason,
    alternatives,
    highlightSquares: diagnosis.highlightSquares,
  };
}
