import { useEffect, useState } from 'react';
import { translate, type Language } from '../i18n/translations.ts';

export interface ActiveLexiconDemo {
  title: string;
  badge: string;
  description: string;
  totalSteps: number;
}

interface LexiconDemoBarProps {
  lang: Language;
  demo: ActiveLexiconDemo | null;
  cursor: number;
  isAnimating: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPlayFromHere: () => void;
  onExit: () => void;
}

export function LexiconDemoBar({
  lang,
  demo,
  cursor,
  isAnimating,
  onPrev,
  onNext,
  onPlayFromHere,
  onExit,
}: LexiconDemoBarProps) {
  const [autoPlaying, setAutoPlaying] = useState(false);

  useEffect(() => {
    setAutoPlaying(false);
  }, [demo?.title]);

  useEffect(() => {
    if (!demo || !autoPlaying) return;
    if (cursor >= demo.totalSteps) {
      setAutoPlaying(false);
      return;
    }
    if (isAnimating) return;

    const timer = setTimeout(() => {
      onNext();
    }, 1350);
    return () => clearTimeout(timer);
  }, [demo, autoPlaying, cursor, isAnimating, onNext]);

  if (!demo) return null;

  const isDone = cursor >= demo.totalSteps;

  return (
    <div id="lexicon-demo-bar" className="lexicon-demo-bar" role="region" aria-label={translate(lang, 'demoActiveLabel')}>
      <div className="lexicon-demo-info">
        <div className="lexicon-demo-title-row">
          <span className="lexicon-eco-badge">{demo.badge}</span>
          <strong className="lexicon-demo-title">{demo.title}</strong>
          <span className="lexicon-demo-step">
            {translate(lang, 'demoStep', { current: cursor, total: demo.totalSteps })}
          </span>
        </div>
        <div className="lexicon-demo-desc">
          {isDone ? translate(lang, 'demoFinished') : demo.description}
        </div>
      </div>

      <div className="lexicon-demo-actions">
        <button
          type="button"
          className="hud-btn"
          disabled={cursor <= 0}
          onClick={() => {
            setAutoPlaying(false);
            onPrev();
          }}
        >
          ◀ {translate(lang, 'demoPrev')}
        </button>

        <button
          type="button"
          className={`hud-btn ${autoPlaying ? 'active' : ''}`}
          disabled={isDone}
          onClick={() => setAutoPlaying((prev) => !prev)}
        >
          {autoPlaying ? translate(lang, 'demoPause') : translate(lang, 'demoAutoPlay')}
        </button>

        <button
          type="button"
          className="hud-btn primary"
          disabled={isDone}
          onClick={() => {
            setAutoPlaying(false);
            onNext();
          }}
        >
          {translate(lang, 'demoNext')} ▶
        </button>

        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            setAutoPlaying(false);
            onPlayFromHere();
          }}
        >
          {translate(lang, 'demoPlayFromHere')}
        </button>

        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            setAutoPlaying(false);
            onExit();
          }}
        >
          {translate(lang, 'demoExit')}
        </button>
      </div>
    </div>
  );
}
