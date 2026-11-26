import { sanListToUciMoves } from '../chess/rules.ts';
import { OPENINGS_CATALOG } from './lexiconData.ts';
import type { DetectedOpening, LocalizedText } from './types.ts';

interface OpeningPattern {
  uciLine: string[];
  eco: string;
  name: LocalizedText;
  openingId?: string;
}

const GENERIC_OPENING_ROOTS: Array<{
  uciLine: string[];
  eco: string;
  name: LocalizedText;
  openingId?: string;
}> = [
  {
    uciLine: ['e2e4'],
    eco: 'B00',
    name: { de: 'Königsbauern-Eröffnung', en: "King's Pawn Opening" },
  },
  {
    uciLine: ['e2e4', 'e7e5'],
    eco: 'C20',
    name: { de: 'Offenes Spiel', en: 'Open Game' },
  },
  {
    uciLine: ['e2e4', 'c7c5'],
    eco: 'B20',
    name: { de: 'Sizilianische Verteidigung', en: 'Sicilian Defense' },
    openingId: 'sicilian-defense',
  },
  {
    uciLine: ['e2e4', 'e7e6'],
    eco: 'C00',
    name: { de: 'Französische Verteidigung', en: 'French Defense' },
    openingId: 'french-defense',
  },
  {
    uciLine: ['e2e4', 'c7c6'],
    eco: 'B10',
    name: { de: 'Caro-Kann-Verteidigung', en: 'Caro-Kann Defense' },
    openingId: 'caro-kann',
  },
  {
    uciLine: ['e2e4', 'd7d5'],
    eco: 'B01',
    name: { de: 'Skandinavische Verteidigung', en: 'Scandinavian Defense' },
    openingId: 'scandinavian-defense',
  },
  {
    uciLine: ['d2d4'],
    eco: 'A40',
    name: { de: 'Damenbauern-Eröffnung', en: "Queen's Pawn Opening" },
  },
  {
    uciLine: ['d2d4', 'd7d5'],
    eco: 'D00',
    name: { de: 'Geschlossenes Spiel', en: 'Closed Game' },
  },
  {
    uciLine: ['d2d4', 'g8f6'],
    eco: 'A45',
    name: { de: 'Indische Verteidigung', en: 'Indian Defense' },
  },
  {
    uciLine: ['d2d4', 'd7d5', 'c2c4'],
    eco: 'D06',
    name: { de: 'Damengambit', en: "Queen's Gambit" },
    openingId: 'queens-gambit',
  },
  {
    uciLine: ['c2c4'],
    eco: 'A10',
    name: { de: 'Englische Eröffnung', en: 'English Opening' },
    openingId: 'english-opening',
  },
  {
    uciLine: ['g1f3'],
    eco: 'A04',
    name: { de: 'Réti / Zukertort-Eröffnung', en: 'Réti / Zukertort Opening' },
    openingId: 'reti-opening',
  },
];

// Also include key recognizable prefixes (3-6 plies) for popular openings so detection triggers early
const OPENING_PREFIX_MAP: Array<{ openingId: string; minPlies: number }> = [
  { openingId: 'italian-game', minPlies: 5 },     // 1.e4 e5 2.Nf3 Nc6 3.Bc4
  { openingId: 'ruy-lopez', minPlies: 5 },        // 1.e4 e5 2.Nf3 Nc6 3.Bb5
  { openingId: 'scotch-game', minPlies: 5 },      // 1.e4 e5 2.Nf3 Nc6 3.d4
  { openingId: 'two-knights-defense', minPlies: 6 }, // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6
  { openingId: 'vienna-game', minPlies: 3 },      // 1.e4 e5 2.Nc3
  { openingId: 'london-system', minPlies: 5 },    // 1.d4 d5 2.Bf4
  { openingId: 'slav-defense', minPlies: 4 },     // 1.d4 d5 2.c4 c6
  { openingId: 'kings-indian', minPlies: 6 },     // 1.d4 Nf6 2.c4 g6 3.Nc3 Bg7
  { openingId: 'nimzo-indian', minPlies: 6 },     // 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4
];

const OPENING_PATTERNS: OpeningPattern[] = (() => {
  const patterns: OpeningPattern[] = [];

  for (const root of GENERIC_OPENING_ROOTS) {
    patterns.push(root);
  }

  for (const entry of OPENINGS_CATALOG) {
    const uciMoves = sanListToUciMoves(entry.movesSan).map((m) => m.uci);
    patterns.push({
      uciLine: uciMoves,
      eco: entry.eco,
      name: entry.name,
      openingId: entry.id,
    });

    const prefixCfg = OPENING_PREFIX_MAP.find((p) => p.openingId === entry.id);
    if (prefixCfg && uciMoves.length >= prefixCfg.minPlies) {
      for (let len = prefixCfg.minPlies; len < uciMoves.length; len++) {
        patterns.push({
          uciLine: uciMoves.slice(0, len),
          eco: entry.eco,
          name: entry.name,
          openingId: entry.id,
        });
      }
    }
  }

  return patterns;
})();

export function detectOpening(historyUci: string[]): DetectedOpening | null {
  if (!Array.isArray(historyUci) || historyUci.length === 0) return null;

  let bestMatch: OpeningPattern | null = null;
  let bestScore = -1;

  for (const pattern of OPENING_PATTERNS) {
    const len = pattern.uciLine.length;
    if (len > historyUci.length) continue;

    let matches = true;
    for (let i = 0; i < len; i++) {
      if (historyUci[i] !== pattern.uciLine[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    // Score prefers longer matches, with tie-breaker favoring specific catalog entries
    const score = len * 10 + (pattern.openingId ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pattern;
    }
  }

  if (!bestMatch) return null;

  return {
    eco: bestMatch.eco,
    name: bestMatch.name,
    openingId: bestMatch.openingId,
    matchedPlies: bestMatch.uciLine.length,
  };
}
