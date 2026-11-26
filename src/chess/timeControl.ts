export type TimeControlCategory = 'unlimited' | 'bullet' | 'blitz' | 'rapid';

export type TimeControlId =
  | 'unlimited'
  | 'bullet_1_0'
  | 'bullet_2_1'
  | 'blitz_3_0'
  | 'blitz_3_2'
  | 'blitz_5_0'
  | 'rapid_10_0'
  | 'rapid_15_10';

export interface TimeControlPreset {
  id: TimeControlId;
  category: TimeControlCategory;
  label: string;
  initialMs: number;
  incrementMs: number;
  aiMaxMovetimeMs: number | null;
  animSpeedScale: number;
}

export const TIME_CONTROL_STORAGE_KEY = 'wizard_chess_time_control';
export const DEFAULT_TIME_CONTROL_ID: TimeControlId = 'unlimited';

export const TIME_CONTROL_PRESETS: TimeControlPreset[] = [
  {
    id: 'unlimited',
    category: 'unlimited',
    label: '∞',
    initialMs: 0,
    incrementMs: 0,
    aiMaxMovetimeMs: null,
    animSpeedScale: 1.0,
  },
  {
    id: 'bullet_1_0',
    category: 'bullet',
    label: '1+0',
    initialMs: 60_000,
    incrementMs: 0,
    aiMaxMovetimeMs: 260,
    animSpeedScale: 2.2,
  },
  {
    id: 'bullet_2_1',
    category: 'bullet',
    label: '2+1',
    initialMs: 120_000,
    incrementMs: 1_000,
    aiMaxMovetimeMs: 380,
    animSpeedScale: 2.0,
  },
  {
    id: 'blitz_3_0',
    category: 'blitz',
    label: '3+0',
    initialMs: 180_000,
    incrementMs: 0,
    aiMaxMovetimeMs: 520,
    animSpeedScale: 1.65,
  },
  {
    id: 'blitz_3_2',
    category: 'blitz',
    label: '3+2',
    initialMs: 180_000,
    incrementMs: 2_000,
    aiMaxMovetimeMs: 600,
    animSpeedScale: 1.6,
  },
  {
    id: 'blitz_5_0',
    category: 'blitz',
    label: '5+0',
    initialMs: 300_000,
    incrementMs: 0,
    aiMaxMovetimeMs: 750,
    animSpeedScale: 1.45,
  },
  {
    id: 'rapid_10_0',
    category: 'rapid',
    label: '10+0',
    initialMs: 600_000,
    incrementMs: 0,
    aiMaxMovetimeMs: 1100,
    animSpeedScale: 1.15,
  },
  {
    id: 'rapid_15_10',
    category: 'rapid',
    label: '15+10',
    initialMs: 900_000,
    incrementMs: 10_000,
    aiMaxMovetimeMs: 1400,
    animSpeedScale: 1.0,
  },
];

export function isValidTimeControlId(value: unknown): value is TimeControlId {
  return (
    typeof value === 'string' &&
    TIME_CONTROL_PRESETS.some((preset) => preset.id === value)
  );
}

export function getTimeControlById(id: string | null | undefined): TimeControlPreset {
  const found = TIME_CONTROL_PRESETS.find((preset) => preset.id === id);
  return found ?? TIME_CONTROL_PRESETS[0];
}

export function loadSavedTimeControlId(): TimeControlId {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(TIME_CONTROL_STORAGE_KEY)
        : null;
    if (isValidTimeControlId(raw)) {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_TIME_CONTROL_ID;
}

export function saveTimeControlId(id: TimeControlId): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TIME_CONTROL_STORAGE_KEY, id);
    }
  } catch {
    // ignore storage errors
  }
}

export function parseTimeControlFromUrl(search?: string): TimeControlId | null {
  try {
    const rawSearch =
      typeof search === 'string'
        ? search
        : typeof window !== 'undefined'
          ? window.location.search
          : '';
    if (!rawSearch) return null;
    const query = rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch;
    const params = new URLSearchParams(query.split('#')[0]);
    const tc = params.get('tc');
    return isValidTimeControlId(tc) ? tc : null;
  } catch {
    return null;
  }
}

export function formatClockMs(ms: number, isUnlimited = false): string {
  if (isUnlimited) return '∞';
  const clamped = Math.max(0, Math.floor(ms));
  if (clamped < 10_000) {
    const totalTenths = Math.floor(clamped / 100);
    const secs = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    return `0:${String(secs).padStart(2, '0')}.${tenths}`;
  }
  const totalSeconds = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function isLowTime(ms: number, isUnlimited = false): boolean {
  if (isUnlimited) return false;
  return ms > 0 && ms <= 15_000;
}

export function computeAiMovetimeMs(
  preset: TimeControlPreset,
  aiRemainingMs: number,
  configuredMovetimeMs: number
): number | undefined {
  if (preset.id === 'unlimited' || preset.aiMaxMovetimeMs === null) {
    return undefined;
  }
  let cap = Math.min(configuredMovetimeMs, preset.aiMaxMovetimeMs);
  if (aiRemainingMs < 8_000) {
    cap = Math.min(cap, 120);
  } else if (aiRemainingMs < 20_000) {
    cap = Math.min(cap, 220);
  }
  return Math.max(80, cap);
}
