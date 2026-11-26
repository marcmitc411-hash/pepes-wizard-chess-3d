import {
  formatClockMs,
  isLowTime,
  type TimeControlPreset,
} from '../chess/timeControl.ts';
import { translate, type Language } from '../i18n/translations.ts';

interface ChessClockBarProps {
  lang: Language;
  preset: TimeControlPreset;
  whiteMs: number;
  blackMs: number;
  activeTurn: 'w' | 'b';
  isRunning: boolean;
  premoveCount: number;
  onCancelPremoves: () => void;
}

export function ChessClockBar({
  lang,
  preset,
  whiteMs,
  blackMs,
  activeTurn,
  isRunning,
  premoveCount,
  onCancelPremoves,
}: ChessClockBarProps) {
  const isUnlimited = preset.id === 'unlimited';
  if (isUnlimited && premoveCount === 0) {
    return null;
  }

  const whiteActive = !isUnlimited && isRunning && activeTurn === 'w';
  const blackActive = !isUnlimited && isRunning && activeTurn === 'b';
  const whiteLow = isLowTime(whiteMs, isUnlimited);
  const blackLow = isLowTime(blackMs, isUnlimited);

  return (
    <div className="chess-clock-bar" id="chess-clock-bar">
      {!isUnlimited && (
        <>
          <div
            className={`clock-pill white ${whiteActive ? 'active' : ''} ${whiteLow ? 'low' : ''}`}
            id="clock-white"
          >
            <span className="clock-dot white" aria-hidden="true"></span>
            <span className="clock-label">{translate(lang, 'clockWhite')}</span>
            <span className="clock-value">{formatClockMs(whiteMs, false)}</span>
          </div>

          <span className="clock-tc-badge" title={translate(lang, 'timeControlTitle')}>
            {preset.label}
          </span>

          <div
            className={`clock-pill black ${blackActive ? 'active' : ''} ${blackLow ? 'low' : ''}`}
            id="clock-black"
          >
            <span className="clock-dot black" aria-hidden="true"></span>
            <span className="clock-label">{translate(lang, 'clockBlack')}</span>
            <span className="clock-value">{formatClockMs(blackMs, false)}</span>
          </div>
        </>
      )}

      {premoveCount > 0 && (
        <button
          type="button"
          className="premove-pill"
          id="premove-pill"
          title={translate(lang, 'premoveCancelHint')}
          onClick={onCancelPremoves}
        >
          <span>{translate(lang, 'premoveQueuedBadge', { count: premoveCount })}</span>
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}
