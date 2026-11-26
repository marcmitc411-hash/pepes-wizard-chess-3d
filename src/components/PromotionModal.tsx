import { useEffect } from 'react';
import type { PieceColor, PromotionPiece } from '../chess/types.ts';
import type { Language } from '../i18n/translations.ts';
import { translate } from '../i18n/translations.ts';

interface PromotionModalProps {
  open: boolean;
  color: PieceColor;
  lang: Language;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

const PROMOTION_OPTIONS: Array<{
  type: PromotionPiece;
  whiteGlyph: string;
  blackGlyph: string;
}> = [
  { type: 'queen', whiteGlyph: '♕', blackGlyph: '♛' },
  { type: 'rook', whiteGlyph: '♖', blackGlyph: '♜' },
  { type: 'bishop', whiteGlyph: '♗', blackGlyph: '♝' },
  { type: 'knight', whiteGlyph: '♘', blackGlyph: '♞' },
];

export function PromotionModal({ open, color, lang, onSelect, onCancel }: PromotionModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="sanctum-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promotion-modal-title"
      onClick={onCancel}
    >
      <div className="sanctum-modal promotion-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sanctum-modal-eyebrow">{translate(lang, 'sanctumJudgment')}</div>
        <h2 id="promotion-modal-title" className="sanctum-modal-title">
          {translate(lang, 'promotePawn')}
        </h2>
        <p className="sanctum-modal-subtitle">{translate(lang, 'promoteSubtitle')}</p>

        <div className="promotion-grid">
          {PROMOTION_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              className="promotion-choice-btn"
              onClick={() => onSelect(opt.type)}
            >
              <span className="promotion-glyph" aria-hidden="true">
                {color === 'w' ? opt.whiteGlyph : opt.blackGlyph}
              </span>
              <span className="promotion-label">{translate(lang, opt.type)}</span>
            </button>
          ))}
        </div>

        <div className="promotion-footer">
          <button type="button" className="checkmate-btn secondary" onClick={onCancel}>
            {translate(lang, 'cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
