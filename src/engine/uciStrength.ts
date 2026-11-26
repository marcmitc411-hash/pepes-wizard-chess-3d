export type StrengthPresetId =
  | 'novice'
  | 'casual'
  | 'club'
  | 'expert'
  | 'master'
  | 'grandmaster'
  | 'max';

export interface EngineStrengthConfig {
  presetId: StrengthPresetId | 'custom';
  elo: number;
  maxStrength: boolean;
  movetimeMs: number;
}

export interface StrengthPreset {
  id: StrengthPresetId;
  elo: number;
  maxStrength: boolean;
  movetimeMs: number;
  labelKey: string;
  descKey: string;
}

export const STRENGTH_PRESETS: StrengthPreset[] = [
  { id: 'novice', elo: 600, maxStrength: false, movetimeMs: 250, labelKey: 'presetNovice', descKey: 'presetNoviceDesc' },
  { id: 'casual', elo: 1000, maxStrength: false, movetimeMs: 320, labelKey: 'presetCasual', descKey: 'presetCasualDesc' },
  { id: 'club', elo: 1400, maxStrength: false, movetimeMs: 450, labelKey: 'presetClub', descKey: 'presetClubDesc' },
  { id: 'expert', elo: 1800, maxStrength: false, movetimeMs: 650, labelKey: 'presetExpert', descKey: 'presetExpertDesc' },
  { id: 'master', elo: 2200, maxStrength: false, movetimeMs: 900, labelKey: 'presetMaster', descKey: 'presetMasterDesc' },
  { id: 'grandmaster', elo: 2600, maxStrength: false, movetimeMs: 1200, labelKey: 'presetGrandmaster', descKey: 'presetGrandmasterDesc' },
  { id: 'max', elo: 3190, maxStrength: true, movetimeMs: 1500, labelKey: 'presetMax', descKey: 'presetMaxDesc' },
];

export const DEFAULT_STRENGTH_CONFIG: EngineStrengthConfig = {
  presetId: 'club',
  elo: 1400,
  maxStrength: false,
  movetimeMs: 450,
};

const STRENGTH_STORAGE_KEY = 'wizard_chess_uci_strength';

export const UCI_ELO_MIN = 1320;
export const UCI_ELO_MAX = 3190;
export const SLIDER_ELO_MIN = 400;
export const SLIDER_ELO_MAX = 3000;

export interface UciCommandPlan {
  mode: 'max' | 'uci_elo' | 'skill_depth';
  options: string[];
  goCommand: string;
  skillLevel: number;
  multiPv: number;
  depth?: number;
  clampedElo?: number;
}

export interface UciInfoLine {
  depth: number;
  multipv: number;
  scoreType: 'cp' | 'mate';
  scoreValue: number;
  pv: string[];
}

export function clampElo(elo: number): number {
  if (!Number.isFinite(elo)) return DEFAULT_STRENGTH_CONFIG.elo;
  return Math.max(SLIDER_ELO_MIN, Math.min(UCI_ELO_MAX, Math.round(elo)));
}

export function configFromPreset(presetId: StrengthPresetId): EngineStrengthConfig {
  const preset = STRENGTH_PRESETS.find((p) => p.id === presetId) ?? STRENGTH_PRESETS[2];
  return {
    presetId: preset.id,
    elo: preset.elo,
    maxStrength: preset.maxStrength,
    movetimeMs: preset.movetimeMs,
  };
}

export function configFromCustomElo(elo: number): EngineStrengthConfig {
  const clamped = Math.max(SLIDER_ELO_MIN, Math.min(SLIDER_ELO_MAX, Math.round(elo)));
  const exactPreset = STRENGTH_PRESETS.find((p) => !p.maxStrength && p.elo === clamped);
  const movetimeMs =
    clamped < 1000 ? 250 :
    clamped < 1320 ? 350 :
    clamped < 1700 ? 480 :
    clamped < 2100 ? 700 :
    clamped < 2500 ? 950 : 1200;

  return {
    presetId: exactPreset ? exactPreset.id : 'custom',
    elo: clamped,
    maxStrength: false,
    movetimeMs,
  };
}

export function buildUciStrengthCommands(config: EngineStrengthConfig): UciCommandPlan {
  const movetime = Math.max(120, Math.min(5000, Math.round(config.movetimeMs || 450)));

  if (config.maxStrength) {
    return {
      mode: 'max',
      options: [
        'setoption name UCI_LimitStrength value false',
        'setoption name Skill Level value 20',
        'setoption name MultiPV value 1',
      ],
      goCommand: `go movetime ${movetime}`,
      skillLevel: 20,
      multiPv: 1,
    };
  }

  const elo = clampElo(config.elo);
  if (elo >= UCI_ELO_MIN) {
    const clampedUciElo = Math.max(UCI_ELO_MIN, Math.min(UCI_ELO_MAX, elo));
    return {
      mode: 'uci_elo',
      options: [
        'setoption name UCI_LimitStrength value true',
        `setoption name UCI_Elo value ${clampedUciElo}`,
        'setoption name MultiPV value 1',
      ],
      goCommand: `go movetime ${movetime}`,
      skillLevel: 20,
      multiPv: 1,
      clampedElo: clampedUciElo,
    };
  }

  // Sub-1320 Elo: Stockfish's UCI_Elo floor is 1320, so use low Skill Level + shallow depth + MultiPV sampling
  const ratio = Math.max(0, Math.min(1, (elo - SLIDER_ELO_MIN) / (UCI_ELO_MIN - SLIDER_ELO_MIN)));
  const skillLevel = Math.round(ratio * 4); // 0..4
  const depth = 1 + Math.round(ratio * 4); // 1..5
  const multiPv = elo < 900 ? 4 : 3;

  return {
    mode: 'skill_depth',
    options: [
      'setoption name UCI_LimitStrength value false',
      `setoption name Skill Level value ${skillLevel}`,
      `setoption name MultiPV value ${multiPv}`,
    ],
    goCommand: `go depth ${depth} movetime ${movetime}`,
    skillLevel,
    multiPv,
    depth,
  };
}

export function parseUciInfoLine(line: string): UciInfoLine | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('info ')) return null;
  if (trimmed.includes(' upperbound') || trimmed.includes(' lowerbound')) return null;

  const tokens = trimmed.split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let scoreType: 'cp' | 'mate' | null = null;
  let scoreValue = 0;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === 'depth' && i + 1 < tokens.length) {
      depth = parseInt(tokens[++i], 10) || 0;
    } else if (tok === 'multipv' && i + 1 < tokens.length) {
      multipv = parseInt(tokens[++i], 10) || 1;
    } else if (tok === 'score' && i + 2 < tokens.length) {
      const kind = tokens[i + 1];
      const val = parseInt(tokens[i + 2], 10);
      if ((kind === 'cp' || kind === 'mate') && !Number.isNaN(val)) {
        scoreType = kind;
        scoreValue = val;
      }
      i += 2;
    } else if (tok === 'pv') {
      pv = tokens.slice(i + 1).filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(m));
      break;
    }
  }

  if (!scoreType || pv.length === 0) return null;
  return { depth, multipv, scoreType, scoreValue, pv };
}

export function parseBestMoveLine(line: string): { bestMove: string; ponder?: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('bestmove ')) return null;
  const parts = trimmed.split(/\s+/);
  const move = parts[1];
  if (!move || move === '(none)') return null;
  const ponderIdx = parts.indexOf('ponder');
  const ponder = ponderIdx !== -1 && parts[ponderIdx + 1] ? parts[ponderIdx + 1] : undefined;
  return { bestMove: move, ponder };
}

function normalizeScoreCp(info: UciInfoLine): number {
  if (info.scoreType === 'cp') return info.scoreValue;
  return info.scoreValue > 0 ? 30000 - info.scoreValue * 100 : -30000 - info.scoreValue * 100;
}

export function selectMoveForStrength(
  bestMove: string,
  pvLines: UciInfoLine[],
  config: EngineStrengthConfig,
  rng: () => number = Math.random
): string {
  if (config.maxStrength || config.elo >= UCI_ELO_MIN || pvLines.length <= 1) {
    return bestMove;
  }

  // Keep highest-depth entry per multipv index
  const maxDepth = pvLines.reduce((acc, l) => Math.max(acc, l.depth), 0);
  const latestByPv = new Map<number, UciInfoLine>();
  for (const line of pvLines) {
    const existing = latestByPv.get(line.multipv);
    if (!existing || line.depth >= existing.depth) {
      latestByPv.set(line.multipv, line);
    }
  }

  const candidates = Array.from(latestByPv.values())
    .filter((l) => l.depth >= Math.max(1, maxDepth - 1) && l.pv.length > 0)
    .sort((a, b) => a.multipv - b.multipv);

  if (candidates.length <= 1) return bestMove;

  const topScore = normalizeScoreCp(candidates[0]);
  // At 400 Elo allow wider inaccuracies; at 1250 Elo stay much closer to top move
  const ratio = Math.max(0, Math.min(1, (config.elo - SLIDER_ELO_MIN) / (UCI_ELO_MIN - SLIDER_ELO_MIN)));
  const maxDropCp = Math.round(450 - ratio * 280); // 450cp at 400 Elo -> 170cp at 1300 Elo
  const temperature = Math.max(45, 220 - ratio * 145);

  const eligible = candidates.filter((c) => {
    const cp = normalizeScoreCp(c);
    // Avoid walking straight into mate unless all moves get mated or Elo is very low
    if (c.scoreType === 'mate' && c.scoreValue < 0 && ratio > 0.35 && candidates[0].scoreType !== 'mate') {
      return false;
    }
    return topScore - cp <= maxDropCp;
  });

  if (eligible.length <= 1) {
    return candidates[0].pv[0] || bestMove;
  }

  const weights = eligible.map((c) => {
    const delta = Math.max(0, topScore - normalizeScoreCp(c));
    return Math.exp(-delta / temperature);
  });
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return bestMove;

  let pick = rng() * totalWeight;
  for (let i = 0; i < eligible.length; i++) {
    pick -= weights[i];
    if (pick <= 0) {
      return eligible[i].pv[0];
    }
  }
  return eligible[0].pv[0] || bestMove;
}

export function loadSavedStrength(): EngineStrengthConfig {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STRENGTH_STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_STRENGTH_CONFIG };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.elo === 'number') {
      if (parsed.maxStrength) {
        return configFromPreset('max');
      }
      if (parsed.presetId && parsed.presetId !== 'custom') {
        const preset = STRENGTH_PRESETS.find((p) => p.id === parsed.presetId);
        if (preset) return configFromPreset(preset.id);
      }
      return configFromCustomElo(parsed.elo);
    }
  } catch {
    // ignore storage errors
  }
  return { ...DEFAULT_STRENGTH_CONFIG };
}

export function saveStrength(config: EngineStrengthConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STRENGTH_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // ignore storage errors
  }
}
