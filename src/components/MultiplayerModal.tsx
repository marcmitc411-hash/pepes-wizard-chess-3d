import { useEffect, useRef, useState } from 'react';
import {
  TIME_CONTROL_PRESETS,
  type TimeControlId,
} from '../chess/timeControl.ts';
import { translate, type Language } from '../i18n/translations.ts';
import {
  buildInviteUrl,
  isValidRoomCode,
  normalizeRoomCode,
  type MultiplayerSessionInfo,
  type MultiplayerTransportMode,
  type PlayerColor,
  type RoomState,
} from '../multiplayer/index.ts';

interface MultiplayerModalProps {
  open: boolean;
  lang: Language;
  session: MultiplayerSessionInfo;
  room: RoomState | null;
  transportMode: MultiplayerTransportMode;
  supabaseConfigured: boolean;
  busy: boolean;
  errorText: string | null;
  initialJoinCode?: string;
  timeControlId: TimeControlId;
  onSelectTimeControl: (id: TimeControlId) => void;
  onSelectTransportMode: (mode: MultiplayerTransportMode) => void;
  onCreateRoom: (hostColor: PlayerColor) => void;
  onJoinRoom: (code: string) => void;
  onResetMatch: () => void;
  onLeaveRoom: () => void;
  onClose: () => void;
}

function getConnectionStatusKey(status: MultiplayerSessionInfo['connectionStatus']): string {
  switch (status) {
    case 'connecting':
      return 'mpConnConnecting';
    case 'connected':
      return 'mpConnConnected';
    case 'reconnecting':
      return 'mpConnReconnecting';
    case 'error':
      return 'mpConnError';
    default:
      return 'mpConnIdle';
  }
}

export function MultiplayerModal({
  open,
  lang,
  session,
  room,
  transportMode,
  supabaseConfigured,
  busy,
  errorText,
  initialJoinCode = '',
  timeControlId,
  onSelectTimeControl,
  onSelectTransportMode,
  onCreateRoom,
  onJoinRoom,
  onResetMatch,
  onLeaveRoom,
  onClose,
}: MultiplayerModalProps) {
  const [hostColor, setHostColor] = useState<PlayerColor>('w');
  const [joinCode, setJoinCode] = useState<string>(() => normalizeRoomCode(initialJoinCode));
  const [copiedWhich, setCopiedWhich] = useState<'code' | 'link' | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const normalized = normalizeRoomCode(initialJoinCode);
    if (normalized) {
      setJoinCode(normalized);
    }
  }, [initialJoinCode]);

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

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  if (!open) return null;

  const isActiveRoom = Boolean(session.active && room && session.roomCode);
  const normalizedJoin = normalizeRoomCode(joinCode);
  const canJoin = isValidRoomCode(normalizedJoin) && !busy;

  const triggerCopy = async (which: 'code' | 'link', text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // Clipboard API may be unavailable in restricted contexts; ignore silently
    }
    setCopiedWhich(which);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopiedWhich(null);
    }, 1800);
  };

  const roleText =
    session.role === 'w'
      ? translate(lang, 'whiteName')
      : session.role === 'b'
        ? translate(lang, 'blackName')
        : translate(lang, 'mpSpectating');

  const dotStateClass =
    session.connectionStatus === 'error'
      ? 'error'
      : session.connectionStatus === 'connecting' || session.connectionStatus === 'reconnecting'
        ? session.connectionStatus
        : session.opponentConnected
          ? 'connected'
          : 'waiting';

  return (
    <div
      className="sanctum-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mp-modal-title"
      onClick={onClose}
    >
      <div
        id="multiplayer-modal"
        className="sanctum-modal multiplayer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mp-modal-header">
          <div>
            <div className="sanctum-modal-eyebrow">{translate(lang, 'mpModalEyebrow')}</div>
            <h2 id="mp-modal-title" className="sanctum-modal-title">
              {translate(lang, 'mpModalTitle')}
            </h2>
            <p className="sanctum-modal-subtitle">{translate(lang, 'mpModalSubtitle')}</p>
          </div>
          <button
            type="button"
            className="uci-close-btn"
            id="btn-mp-close"
            data-testid="btn-close-mp-modal"
            aria-label={translate(lang, 'close')}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {errorText && (
          <div id="mp-error-banner" data-testid="mp-status-msg" className="mp-error-banner" role="alert">
            {errorText}
          </div>
        )}

        {!isActiveRoom ? (
          <div className="mp-lobby-body">
            <div className="mp-section">
              <div className="mp-section-label">{translate(lang, 'mpTransportLabel')}</div>
              <div className="mp-segmented" role="group" aria-label={translate(lang, 'mpTransportLabel')}>
                <button
                  type="button"
                  id="mp-transport-supabase"
                  data-testid="mp-mode-supabase"
                  className={`mp-seg-btn ${transportMode === 'supabase' ? 'active' : ''}`}
                  disabled={!supabaseConfigured || busy}
                  onClick={() => onSelectTransportMode('supabase')}
                >
                  <span className="mp-seg-title">{translate(lang, 'mpTransportSupabase')}</span>
                  <span className="mp-seg-desc">
                    {supabaseConfigured
                      ? translate(lang, 'mpTransportSupabaseDesc')
                      : translate(lang, 'mpSupabaseNotConfigured')}
                  </span>
                </button>
                <button
                  type="button"
                  id="mp-transport-local"
                  data-testid="mp-mode-local"
                  className={`mp-seg-btn ${transportMode === 'local' ? 'active' : ''}`}
                  disabled={busy}
                  onClick={() => onSelectTransportMode('local')}
                >
                  <span className="mp-seg-title">{translate(lang, 'mpTransportLocal')}</span>
                  <span className="mp-seg-desc">{translate(lang, 'mpTransportLocalDesc')}</span>
                </button>
              </div>
            </div>

            <div className="mp-section">
              <div className="mp-section-label">{translate(lang, 'mpCreateTitle')}</div>
              <div className="mp-color-row">
                <span className="mp-inline-label">{translate(lang, 'mpChooseColor')}</span>
                <div className="mp-color-pills">
                  <button
                    type="button"
                    id="mp-pick-white"
                    data-testid="mp-color-w"
                    className={`mp-color-btn ${hostColor === 'w' ? 'selected' : ''}`}
                    disabled={busy}
                    onClick={() => setHostColor('w')}
                  >
                    ♔ {translate(lang, 'whiteName')}
                  </button>
                  <button
                    type="button"
                    id="mp-pick-black"
                    data-testid="mp-color-b"
                    className={`mp-color-btn ${hostColor === 'b' ? 'selected' : ''}`}
                    disabled={busy}
                    onClick={() => setHostColor('b')}
                  >
                    ♚ {translate(lang, 'blackName')}
                  </button>
                </div>
              </div>
              <div className="mp-color-row">
                <span className="mp-inline-label">{translate(lang, 'mpTimeControlLabel')}:</span>
                <div className="mp-tc-grid">
                  {TIME_CONTROL_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`mp-color-btn mp-tc-btn ${timeControlId === preset.id ? 'selected' : ''}`}
                      disabled={busy}
                      onClick={() => onSelectTimeControl(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                id="btn-mp-create"
                data-testid="btn-create-room"
                className="checkmate-btn mp-full-btn"
                disabled={busy}
                onClick={() => onCreateRoom(hostColor)}
              >
                {busy ? translate(lang, 'mpCreatingButton') : translate(lang, 'mpCreateButton')}
              </button>
            </div>

            <div className="mp-section">
              <div className="mp-section-label">{translate(lang, 'mpJoinTitle')}</div>
              <div className="mp-join-row">
                <input
                  type="text"
                  id="mp-join-code-input"
                  data-testid="input-room-code"
                  className="mp-code-input"
                  maxLength={4}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={translate(lang, 'mpJoinPlaceholder')}
                  value={joinCode}
                  disabled={busy}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canJoin) {
                      e.preventDefault();
                      onJoinRoom(normalizedJoin);
                    }
                  }}
                />
                <button
                  type="button"
                  id="btn-mp-join"
                  data-testid="btn-join-room"
                  className="checkmate-btn"
                  disabled={busy}
                  onClick={() => onJoinRoom(normalizedJoin)}
                >
                  {busy ? translate(lang, 'mpJoiningButton') : translate(lang, 'mpJoinButton')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mp-active-body">
            <div className="mp-room-hero">
              <div className="mp-room-hero-label">{translate(lang, 'mpRoomCodeLabel')}</div>
              <div id="mp-active-room-code" data-testid="mp-room-code" className="mp-room-code-big">
                {session.roomCode}
              </div>
              <div className="mp-copy-actions">
                <button
                  type="button"
                  id="btn-mp-copy-code"
                  className="hud-btn"
                  onClick={() => {
                    if (session.roomCode) {
                      void triggerCopy('code', session.roomCode);
                    }
                  }}
                >
                  {copiedWhich === 'code' ? translate(lang, 'mpCopiedCode') : translate(lang, 'mpCopyCode')}
                </button>
                <button
                  type="button"
                  id="btn-mp-copy-link"
                  data-testid="mp-invite-link"
                  className="hud-btn primary"
                  onClick={() => {
                    if (session.roomCode) {
                      void triggerCopy('link', buildInviteUrl(session.roomCode, undefined, timeControlId));
                    }
                  }}
                >
                  {copiedWhich === 'link' ? translate(lang, 'mpCopiedLink') : translate(lang, 'mpCopyLink')}
                </button>
              </div>
            </div>

            <div className="mp-meta-grid">
              <div className="mp-meta-card">
                <span className="mp-meta-label">{translate(lang, 'mpTransportLabel')}</span>
                <span id="mp-transport-badge" className="mp-meta-value">
                  {session.mode === 'supabase'
                    ? translate(lang, 'mpTransportSupabase')
                    : translate(lang, 'mpTransportLocal')}
                </span>
              </div>
              <div className="mp-meta-card">
                <span className="mp-meta-label">{translate(lang, 'mpRoleLabel')}</span>
                <span id="mp-role-badge" className="mp-meta-value">
                  {roleText}
                </span>
              </div>
              <div className="mp-meta-card mp-meta-card-wide">
                <span className="mp-meta-label">{translate(lang, 'mpOpponentLabel')}</span>
                <span id="mp-connection-status" data-testid="mp-connection-status" className="mp-meta-value mp-status-line">
                  <span className={`mp-status-dot ${dotStateClass}`} aria-hidden="true"></span>
                  <span>
                    {session.opponentConnected
                      ? translate(lang, 'mpOpponentConnected')
                      : translate(lang, 'mpOpponentWaiting')}
                  </span>
                  <span className="mp-conn-tag">
                    ({translate(lang, getConnectionStatusKey(session.connectionStatus))})
                  </span>
                </span>
              </div>
              <div className="mp-meta-card mp-meta-card-wide">
                <span className="mp-meta-value mp-moves-count">
                  {translate(lang, 'mpMovesCount', { count: room?.moves.length ?? 0 })}
                </span>
              </div>
            </div>

            <div className="mp-active-actions">
              {session.role !== 'spectator' && (
                <button
                  type="button"
                  id="btn-mp-reset"
                  className="checkmate-btn"
                  disabled={busy}
                  onClick={onResetMatch}
                >
                  {busy ? translate(lang, 'mpResettingMatch') : translate(lang, 'mpResetMatch')}
                </button>
              )}
              <button
                type="button"
                id="btn-mp-leave"
                data-testid="btn-leave-room"
                className="checkmate-btn danger"
                disabled={busy}
                onClick={onLeaveRoom}
              >
                {translate(lang, 'mpLeaveRoom')}
              </button>
              <button
                type="button"
                id="btn-mp-close-bottom"
                className="checkmate-btn secondary"
                onClick={onClose}
              >
                {translate(lang, 'mpBackToBoard')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
