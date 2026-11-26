import {
  TIME_CONTROL_PRESETS,
  type TimeControlCategory,
  type TimeControlId,
  type TimeControlPreset,
} from '../chess/timeControl.ts';
import { translate, type Language } from '../i18n/translations.ts';

interface TimeControlPanelProps {
  open: boolean;
  lang: Language;
  selectedId: TimeControlId;
  disabled?: boolean;
  onSelect: (id: TimeControlId) => void;
  onClose: () => void;
}

const GROUPS: Array<{ category: TimeControlCategory; titleKey: string }> = [
  { category: 'unlimited', titleKey: 'tcUnlimited' },
  { category: 'bullet', titleKey: 'tcBullet' },
  { category: 'blitz', titleKey: 'tcBlitz' },
  { category: 'rapid', titleKey: 'tcRapid' },
];

export function TimeControlPanel({
  open,
  lang,
  selectedId,
  disabled = false,
  onSelect,
  onClose,
}: TimeControlPanelProps) {
  if (!open) return null;

  const byCategory = (cat: TimeControlCategory): TimeControlPreset[] =>
    TIME_CONTROL_PRESETS.filter((p) => p.category === cat);

  return (
    <div
      className="uci-popover time-control-panel"
      id="time-control-panel"
      role="dialog"
      aria-label={translate(lang, 'timeControlTitle')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="uci-popover-header">
        <span className="uci-popover-title">{translate(lang, 'timeControlTitle')}</span>
        <button
          type="button"
          className="uci-close-btn"
          onClick={onClose}
          aria-label={translate(lang, 'close')}
        >
          ✕
        </button>
      </div>

      <div className="tc-groups">
        {GROUPS.map((group) => {
          const items = byCategory(group.category);
          return (
            <div className="tc-group" key={group.category}>
              <div className="tc-group-label">{translate(lang, group.titleKey)}</div>
              <div className="tc-preset-grid">
                {items.map((preset) => {
                  const active = preset.id === selectedId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={disabled}
                      className={`uci-preset-btn tc-preset-btn ${active ? 'active' : ''}`}
                      onClick={() => {
                        onSelect(preset.id);
                        onClose();
                      }}
                    >
                      <span className="uci-preset-name">
                        {preset.id === 'unlimited'
                          ? translate(lang, 'tcNoLimit')
                          : preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
