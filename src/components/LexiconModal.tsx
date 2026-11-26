import { useEffect, useMemo, useState } from 'react';
import { translate, type Language } from '../i18n/translations.ts';
import { OPENINGS_CATALOG, STRATEGIES_CATALOG } from '../lexicon/lexiconData.ts';
import type {
  DifficultyLevel,
  OpeningCategory,
  OpeningEntry,
  StrategyCategory,
  StrategyEntry,
} from '../lexicon/types.ts';

interface LexiconModalProps {
  open: boolean;
  lang: Language;
  initialOpeningId?: string | null;
  onClose: () => void;
  onStartOpeningDemo: (opening: OpeningEntry) => void;
  onStartStrategyDemo: (strategy: StrategyEntry) => void;
}

const OPENING_CATEGORY_LABELS: Record<OpeningCategory, string> = {
  open: 'catOpen',
  semi_open: 'catSemiOpen',
  closed: 'catClosed',
  indian: 'catIndian',
  flank: 'catFlank',
};

const STRATEGY_CATEGORY_LABELS: Record<StrategyCategory, string> = {
  tactics: 'catTactics',
  strategy: 'catStrategy',
  endgame: 'catEndgame',
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  beginner: 'diffBeginner',
  intermediate: 'diffIntermediate',
  advanced: 'diffAdvanced',
};

function formatMoveList(movesSan: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < movesSan.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const w = movesSan[i];
    const b = movesSan[i + 1];
    parts.push(b ? `${num}.${w} ${b}` : `${num}.${w}`);
  }
  return parts.join(' ');
}

export function LexiconModal({
  open,
  lang,
  initialOpeningId,
  onClose,
  onStartOpeningDemo,
  onStartStrategyDemo,
}: LexiconModalProps) {
  const [activeTab, setActiveTab] = useState<'openings' | 'strategies'>('openings');
  const [openingFilter, setOpeningFilter] = useState<'all' | OpeningCategory>('all');
  const [strategyFilter, setStrategyFilter] = useState<'all' | StrategyCategory>('all');
  const [search, setSearch] = useState('');
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>(OPENINGS_CATALOG[0].id);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(STRATEGIES_CATALOG[0].id);

  useEffect(() => {
    if (!open) return;
    if (initialOpeningId) {
      const exists = OPENINGS_CATALOG.some((o) => o.id === initialOpeningId);
      if (exists) {
        setActiveTab('openings');
        setOpeningFilter('all');
        setSearch('');
        setSelectedOpeningId(initialOpeningId);
      }
    }
  }, [open, initialOpeningId]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const filteredOpenings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return OPENINGS_CATALOG.filter((o) => {
      if (openingFilter !== 'all' && o.category !== openingFilter) return false;
      if (!q) return true;
      return (
        o.name[lang].toLowerCase().includes(q) ||
        o.name.en.toLowerCase().includes(q) ||
        o.eco.toLowerCase().includes(q) ||
        o.summary[lang].toLowerCase().includes(q)
      );
    });
  }, [openingFilter, search, lang]);

  const filteredStrategies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return STRATEGIES_CATALOG.filter((s) => {
      if (strategyFilter !== 'all' && s.category !== strategyFilter) return false;
      if (!q) return true;
      return (
        s.name[lang].toLowerCase().includes(q) ||
        s.name.en.toLowerCase().includes(q) ||
        s.summary[lang].toLowerCase().includes(q)
      );
    });
  }, [strategyFilter, search, lang]);

  if (!open) return null;

  const activeOpening =
    filteredOpenings.find((o) => o.id === selectedOpeningId) ?? filteredOpenings[0] ?? null;
  const activeStrategy =
    filteredStrategies.find((s) => s.id === selectedStrategyId) ?? filteredStrategies[0] ?? null;

  return (
    <div
      className="sanctum-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lexicon-modal-title"
      onClick={onClose}
    >
      <div className="lexicon-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lexicon-header">
          <div>
            <h2 id="lexicon-modal-title" className="lexicon-title">
              {translate(lang, 'lexiconTitle')}
            </h2>
            <p className="lexicon-subtitle">{translate(lang, 'lexiconSubtitle')}</p>
          </div>
          <button
            type="button"
            className="uci-close-btn"
            onClick={onClose}
            aria-label={translate(lang, 'close')}
          >
            ✕
          </button>
        </div>

        <div className="lexicon-toolbar">
          <div className="lexicon-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'openings'}
              className={`lexicon-tab-btn ${activeTab === 'openings' ? 'active' : ''}`}
              onClick={() => setActiveTab('openings')}
            >
              {translate(lang, 'tabOpenings')} ({OPENINGS_CATALOG.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'strategies'}
              className={`lexicon-tab-btn ${activeTab === 'strategies' ? 'active' : ''}`}
              onClick={() => setActiveTab('strategies')}
            >
              {translate(lang, 'tabStrategies')} ({STRATEGIES_CATALOG.length})
            </button>
          </div>

          <input
            type="search"
            className="lexicon-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={translate(lang, 'searchPlaceholder')}
          />
        </div>

        <div className="lexicon-filters">
          {activeTab === 'openings' ? (
            <>
              <button
                type="button"
                className={`lexicon-chip ${openingFilter === 'all' ? 'active' : ''}`}
                onClick={() => setOpeningFilter('all')}
              >
                {translate(lang, 'filterAll')}
              </button>
              {(Object.keys(OPENING_CATEGORY_LABELS) as OpeningCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`lexicon-chip ${openingFilter === cat ? 'active' : ''}`}
                  onClick={() => setOpeningFilter(cat)}
                >
                  {translate(lang, OPENING_CATEGORY_LABELS[cat])}
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                type="button"
                className={`lexicon-chip ${strategyFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStrategyFilter('all')}
              >
                {translate(lang, 'filterAll')}
              </button>
              {(Object.keys(STRATEGY_CATEGORY_LABELS) as StrategyCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`lexicon-chip ${strategyFilter === cat ? 'active' : ''}`}
                  onClick={() => setStrategyFilter(cat)}
                >
                  {translate(lang, STRATEGY_CATEGORY_LABELS[cat])}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="lexicon-body">
          <div className="lexicon-list">
            {activeTab === 'openings' ? (
              filteredOpenings.length === 0 ? (
                <div className="lexicon-empty">{translate(lang, 'noLexiconMatches')}</div>
              ) : (
                filteredOpenings.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`lexicon-list-item ${activeOpening?.id === o.id ? 'active' : ''}`}
                    onClick={() => setSelectedOpeningId(o.id)}
                  >
                    <div className="lexicon-item-top">
                      <span className="lexicon-item-name">{o.name[lang]}</span>
                      <span className="lexicon-eco-badge">{o.eco}</span>
                    </div>
                    <div className="lexicon-item-meta">
                      <span>{translate(lang, OPENING_CATEGORY_LABELS[o.category])}</span>
                      <span>•</span>
                      <span>{translate(lang, DIFFICULTY_LABELS[o.difficulty])}</span>
                    </div>
                  </button>
                ))
              )
            ) : filteredStrategies.length === 0 ? (
              <div className="lexicon-empty">{translate(lang, 'noLexiconMatches')}</div>
            ) : (
              filteredStrategies.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`lexicon-list-item ${activeStrategy?.id === s.id ? 'active' : ''}`}
                  onClick={() => setSelectedStrategyId(s.id)}
                >
                  <div className="lexicon-item-top">
                    <span className="lexicon-item-name">{s.name[lang]}</span>
                    <span className="lexicon-eco-badge">
                      {translate(lang, STRATEGY_CATEGORY_LABELS[s.category])}
                    </span>
                  </div>
                  <div className="lexicon-item-meta">
                    <span>{translate(lang, DIFFICULTY_LABELS[s.difficulty])}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="lexicon-detail">
            {activeTab === 'openings' && activeOpening && (
              <>
                <div className="lexicon-detail-head">
                  <div>
                    <div className="lexicon-detail-badges">
                      <span className="lexicon-eco-badge">{activeOpening.eco}</span>
                      <span className="lexicon-meta-tag">
                        {translate(lang, OPENING_CATEGORY_LABELS[activeOpening.category])}
                      </span>
                      <span className="lexicon-meta-tag">
                        {translate(lang, DIFFICULTY_LABELS[activeOpening.difficulty])}
                      </span>
                    </div>
                    <h3 className="lexicon-detail-title">{activeOpening.name[lang]}</h3>
                  </div>
                  <button
                    type="button"
                    className="checkmate-btn"
                    onClick={() => onStartOpeningDemo(activeOpening)}
                  >
                    {translate(lang, 'btnDemoOnBoard')}
                  </button>
                </div>

                <p className="lexicon-detail-summary">{activeOpening.summary[lang]}</p>

                <div className="lexicon-section">
                  <div className="lexicon-section-title">{translate(lang, 'sectionMoves')}</div>
                  <div className="lexicon-moves-box">
                    {formatMoveList(activeOpening.movesSan)}
                  </div>
                </div>

                <div className="lexicon-plans-grid">
                  <div className="lexicon-section">
                    <div className="lexicon-section-title">
                      {translate(lang, 'sectionIdeasWhite')}
                    </div>
                    <ul className="lexicon-ul">
                      {activeOpening.keyIdeasWhite.map((idea, idx) => (
                        <li key={idx}>{idea[lang]}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="lexicon-section">
                    <div className="lexicon-section-title">
                      {translate(lang, 'sectionIdeasBlack')}
                    </div>
                    <ul className="lexicon-ul">
                      {activeOpening.keyIdeasBlack.map((idea, idx) => (
                        <li key={idx}>{idea[lang]}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="lexicon-warn-box">
                  <strong>{translate(lang, 'sectionWatchOut')}:</strong>{' '}
                  {activeOpening.watchOut[lang]}
                </div>
              </>
            )}

            {activeTab === 'strategies' && activeStrategy && (
              <>
                <div className="lexicon-detail-head">
                  <div>
                    <div className="lexicon-detail-badges">
                      <span className="lexicon-eco-badge">
                        {translate(lang, STRATEGY_CATEGORY_LABELS[activeStrategy.category])}
                      </span>
                      <span className="lexicon-meta-tag">
                        {translate(lang, DIFFICULTY_LABELS[activeStrategy.difficulty])}
                      </span>
                    </div>
                    <h3 className="lexicon-detail-title">{activeStrategy.name[lang]}</h3>
                  </div>
                  <button
                    type="button"
                    className="checkmate-btn"
                    onClick={() => onStartStrategyDemo(activeStrategy)}
                  >
                    {translate(lang, 'btnLoadExample')}
                  </button>
                </div>

                <p className="lexicon-detail-summary">{activeStrategy.summary[lang]}</p>

                <div className="lexicon-section">
                  <div className="lexicon-section-title">
                    {translate(lang, 'sectionPrinciples')}
                  </div>
                  <ul className="lexicon-ul">
                    {activeStrategy.keyPrinciples.map((p, idx) => (
                      <li key={idx}>{p[lang]}</li>
                    ))}
                  </ul>
                </div>

                <div className="lexicon-section">
                  <div className="lexicon-section-title">
                    {translate(lang, 'sectionExample')}
                  </div>
                  <div className="lexicon-moves-box">
                    {formatMoveList(activeStrategy.exampleMovesSan)}
                  </div>
                  <p className="lexicon-example-desc">
                    {activeStrategy.exampleExplanation[lang]}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
