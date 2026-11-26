import { useEffect } from 'react';
import type { AlternativeSuggestion, CoachReviewResult } from '../coach/tacticalAnalyzer.ts';
import { translate, type Language } from '../i18n/translations.ts';

interface TrainingCoachPanelProps {
  lang: Language;
  isChecking: boolean;
  toastText: string | null;
  review: CoachReviewResult | null;
  onSelectAlternative: (alt: AlternativeSuggestion) => void;
  onHoverAlternative: (alt: AlternativeSuggestion | null) => void;
  onChooseAnother: () => void;
  onPlayAnyway: () => void;
}

export function TrainingCoachPanel({
  lang,
  isChecking,
  toastText,
  review,
  onSelectAlternative,
  onHoverAlternative,
  onChooseAnother,
  onPlayAnyway,
}: TrainingCoachPanelProps) {
  useEffect(() => {
    if (!review) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onChooseAnother();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [review, onChooseAnother]);

  if (isChecking) {
    return (
      <div className="coach-floating-status" role="status" aria-live="polite">
        <span className="uci-inline-dot thinking" aria-hidden="true"></span>
        <span>{translate(lang, 'coachChecking')}</span>
      </div>
    );
  }

  if (review) {
    const verdictKey =
      review.verdict === 'illegal'
        ? 'verdictIllegal'
        : review.verdict === 'blunder'
          ? 'verdictBlunder'
          : review.verdict === 'mistake'
            ? 'verdictMistake'
            : review.verdict === 'inaccuracy'
              ? 'verdictInaccuracy'
              : review.verdict === 'best'
                ? 'verdictBest'
                : 'verdictGood';

    const lossPawns =
      typeof review.cpLoss === 'number' && review.cpLoss > 0
        ? `-${(review.cpLoss / 100).toFixed(1)}`
        : null;

    return (
      <aside
        id="training-coach-panel"
        className={`coach-card verdict-${review.verdict}`}
        role="dialog"
        aria-label={translate(lang, 'coachTitle')}
      >
        <div className="coach-card-header">
          <div className="coach-badges">
            <span className={`coach-verdict-badge ${review.verdict}`}>
              {translate(lang, verdictKey)}
            </span>
            {review.plannedMove && (
              <span className="coach-move-chip">{review.plannedMove.san}</span>
            )}
            {lossPawns && (
              <span className="coach-eval-delta">
                {translate(lang, 'coachEvalLoss', { loss: lossPawns })}
              </span>
            )}
          </div>
          <button
            type="button"
            className="uci-close-btn"
            onClick={onChooseAnother}
            aria-label={translate(lang, 'coachDismiss')}
          >
            ✕
          </button>
        </div>

        <h3 className="coach-card-title">{review.title}</h3>
        <p className="coach-card-reason">{review.reason}</p>

        {review.refutationSan && review.refutationSan.length > 0 && (
          <div className="coach-refutation-box">
            <span className="coach-refutation-label">
              {translate(lang, 'coachRefutationLabel')}:
            </span>{' '}
            <span className="coach-refutation-line">
              {review.refutationSan.join(' ')}
            </span>
          </div>
        )}

        {review.alternatives.length > 0 && (
          <div className="coach-alts-section">
            <div className="coach-alts-heading">
              {translate(lang, 'coachAlternativesTitle')}
            </div>
            <div className="coach-alts-list">
              {review.alternatives.map((alt, idx) => (
                <div
                  key={`${alt.uci}-${idx}`}
                  className="coach-alt-item"
                  onMouseEnter={() => onHoverAlternative(alt)}
                  onMouseLeave={() => onHoverAlternative(null)}
                >
                  <div className="coach-alt-top">
                    <div className="coach-alt-move-group">
                      <span className="coach-alt-san">{alt.san}</span>
                      <span className="coach-alt-eval">{alt.evalText}</span>
                    </div>
                    <button
                      type="button"
                      className="coach-alt-play-btn"
                      onClick={() => onSelectAlternative(alt)}
                    >
                      {translate(lang, 'coachPlayAlternative')}
                    </button>
                  </div>
                  <div className="coach-alt-reason">{alt.reason}</div>
                  {alt.pvSan.length > 1 && (
                    <div className="coach-alt-pv">{alt.pvSan.join(' ')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="coach-card-actions">
          <button
            type="button"
            className="checkmate-btn"
            onClick={onChooseAnother}
          >
            {review.kind === 'no_moves'
              ? translate(lang, 'coachDismiss')
              : translate(lang, 'coachChooseAnother')}
          </button>
          {review.kind === 'legal' && (
            <button
              type="button"
              className="checkmate-btn secondary"
              onClick={onPlayAnyway}
            >
              {translate(lang, 'coachPlayAnyway')}
            </button>
          )}
        </div>
      </aside>
    );
  }

  if (toastText) {
    return (
      <div className="coach-floating-status good" role="status" aria-live="polite">
        <span className="uci-inline-dot ready" aria-hidden="true"></span>
        <span>{toastText}</span>
      </div>
    );
  }

  return null;
}
