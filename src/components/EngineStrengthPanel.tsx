import { useEffect, useRef } from 'react';
import type { EngineStatus } from '../engine/stockfishService.ts';
import {
  SLIDER_ELO_MAX,
  SLIDER_ELO_MIN,
  STRENGTH_PRESETS,
  buildUciStrengthCommands,
  configFromCustomElo,
  configFromPreset,
  type EngineStrengthConfig,
  type StrengthPresetId,
} from '../engine/uciStrength.ts';
import type { Language } from '../i18n/translations.ts';
import { translate } from '../i18n/translations.ts';

interface EngineStrengthPanelProps {
  open: boolean;
  lang: Language;
  strength: EngineStrengthConfig;
  status: EngineStatus;
  onChangeStrength: (config: EngineStrengthConfig) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
}

export function EngineStrengthPanel({
  open,
  lang,
  strength,
  status,
  onChangeStrength,
  onClose,
  anchorRef,
}: EngineStrengthPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const plan = buildUciStrengthCommands(strength);
  const activePreset = STRENGTH_PRESETS.find((p) => p.id === strength.presetId);

  const statusKey =
    status === 'thinking'
      ? 'engineThinking'
      : status === 'ready'
        ? 'engineReady'
        : status === 'fallback'
          ? 'engineFallback'
          : 'engineLoading';

  const modeSummary =
    plan.mode === 'max'
      ? translate(lang, 'uciModeMax')
      : plan.mode === 'uci_elo'
        ? translate(lang, 'uciModeElo', { elo: plan.clampedElo ?? strength.elo })
        : translate(lang, 'uciModeSkill', {
            skill: plan.skillLevel,
            depth: plan.depth ?? 3,
          });

  const handlePresetClick = (presetId: StrengthPresetId) => {
    onChangeStrength(configFromPreset(presetId));
  };

  return (
    <div
      ref={panelRef}
      id="uci-strength-panel"
      className="uci-popover"
      role="dialog"
      aria-label={translate(lang, 'engineStrength')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="uci-popover-header">
        <div>
          <div className="uci-popover-title">{translate(lang, 'engineStrength')}</div>
          <div className="uci-status-row">
            <span className={`uci-status-dot ${status}`} aria-hidden="true"></span>
            <span className="uci-status-text">{translate(lang, statusKey)}</span>
          </div>
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

      <div className="uci-presets-grid">
        {STRENGTH_PRESETS.map((preset) => {
          const isSelected =
            (preset.maxStrength && strength.maxStrength) ||
            (!preset.maxStrength && !strength.maxStrength && strength.presetId === preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              className={`uci-preset-btn ${isSelected ? 'active' : ''}`}
              onClick={() => handlePresetClick(preset.id)}
              title={translate(lang, preset.descKey)}
            >
              <span className="uci-preset-name">{translate(lang, preset.labelKey)}</span>
              <span className="uci-preset-elo">
                {preset.maxStrength ? 'Max' : `${preset.elo}`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="uci-slider-section">
        <div className="uci-slider-header">
          <label htmlFor="uci-elo-slider" className="uci-slider-label">
            {translate(lang, 'eloRating')}
          </label>
          <span className="uci-slider-value">
            {strength.maxStrength ? translate(lang, 'maxStrength') : `${strength.elo} Elo`}
          </span>
        </div>
        <input
          id="uci-elo-slider"
          type="range"
          min={SLIDER_ELO_MIN}
          max={SLIDER_ELO_MAX}
          step={50}
          value={strength.maxStrength ? SLIDER_ELO_MAX : Math.min(SLIDER_ELO_MAX, strength.elo)}
          onChange={(e) => onChangeStrength(configFromCustomElo(Number(e.target.value)))}
          className="uci-elo-slider"
        />
        <div className="uci-slider-scale">
          <span>{SLIDER_ELO_MIN}</span>
          <span>1320 (UCI_Elo)</span>
          <span>{SLIDER_ELO_MAX}</span>
        </div>
      </div>

      <div className="uci-mode-footer">
        <div className="uci-mode-desc">
          {activePreset
            ? translate(lang, activePreset.descKey)
            : `${strength.elo} Elo`}
        </div>
        <div className="uci-mode-tech">{translate(lang, 'uciActiveMode', { mode: modeSummary })}</div>
      </div>
    </div>
  );
}
