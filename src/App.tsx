import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChessRulesEngine } from './chess/rules.ts';
import {
  computeAiMovetimeMs,
  getTimeControlById,
  loadSavedTimeControlId,
  parseTimeControlFromUrl,
  saveTimeControlId,
  type TimeControlId,
} from './chess/timeControl.ts';
import type { GameOutcome, PieceColor, PromotionPiece } from './chess/types.ts';
import {
  diagnoseIllegalMove,
  diagnoseNoLegalMoves,
  type CoachSquareHighlight,
} from './coach/ruleDiagnostics.ts';
import {
  buildIllegalMoveReviewWithEngine,
  reviewPlannedMoveWithEngine,
  type AlternativeSuggestion,
  type CoachReviewResult,
} from './coach/tacticalAnalyzer.ts';
import { ChessClockBar } from './components/ChessClockBar.tsx';
import { EngineStrengthPanel } from './components/EngineStrengthPanel.tsx';
import {
  LexiconDemoBar,
  type ActiveLexiconDemo,
} from './components/LexiconDemoBar.tsx';
import { LexiconModal } from './components/LexiconModal.tsx';
import { MultiplayerModal } from './components/MultiplayerModal.tsx';
import { PromotionModal } from './components/PromotionModal.tsx';
import { TimeControlPanel } from './components/TimeControlPanel.tsx';
import { TrainingCoachPanel } from './components/TrainingCoachPanel.tsx';
import { StockfishService, type EngineStatus } from './engine/stockfishService.ts';
import { loadSavedStrength, type EngineStrengthConfig } from './engine/uciStrength.ts';
import {
  loadSavedLanguage,
  saveLanguage,
  translate,
  type Language,
} from './i18n/translations.ts';
import { detectOpening } from './lexicon/openingDetector.ts';
import type { LexiconArrow, OpeningEntry, StrategyEntry } from './lexicon/types.ts';
import {
  getDefaultTransportMode,
  isSupabaseConfigured,
  MultiplayerError,
  normalizeRoomCode,
  parseRoomCodeFromUrl,
  RoomManager,
  type MultiplayerSessionInfo,
  type MultiplayerTransportMode,
  type PlayerColor,
  type RemoteMovePayload,
  type RoomMove,
  type RoomRole,
  type RoomState,
  type SyncStatePayload,
} from './multiplayer/index.ts';
import { initWizardChess } from './wizardChessEngine.js';

const TRAINING_MODE_STORAGE_KEY = 'wizard_chess_training_mode';

function loadSavedTrainingMode(): boolean {
  try {
    return typeof localStorage !== 'undefined' &&
      localStorage.getItem(TRAINING_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveTrainingMode(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TRAINING_MODE_STORAGE_KEY, String(enabled));
    }
  } catch {
    // ignore storage errors
  }
}

type CoachDecision =
  | { action: 'proceed' }
  | { action: 'cancel' }
  | {
      action: 'alternative';
      fromR: number;
      fromC: number;
      toR: number;
      toC: number;
      promotion?: PromotionPiece;
    };

interface HudGameState {
  turn: PieceColor;
  playerColor: RoomRole;
  inCheck: boolean;
  isGameOver: boolean;
  outcome: GameOutcome | 'timeout';
  winner: PieceColor | null;
  isAIThinking: boolean;
  capturedByWhite: number;
  capturedByBlack: number;
  historyUci: string[];
  gameMode: 'single' | 'multi';
  roomCode: string | null;
  scriptedGameActive: boolean;
  scriptCursor: number;
  scriptMovesCount: number;
  premoveCount?: number;
}

interface PendingPromotion {
  color: PieceColor;
  resolve: (choice: PromotionPiece | null) => void;
}

interface PendingCoachPrompt {
  review: CoachReviewResult;
  resolve: (decision: CoachDecision) => void;
}

interface WizardChessWindowApi {
  toggleUI?: (force?: boolean) => void;
  showCoachHighlights?: (cfg: {
    arrows?: Array<{
      fromR: number;
      fromC: number;
      toR: number;
      toC: number;
      kind: 'danger' | 'best' | 'alt';
    }>;
    squares?: CoachSquareHighlight[];
  }) => void;
  clearCoachHighlights?: () => void;
  loadLexiconDemo?: (cfg: {
    fen?: string | null;
    movesSan: string[];
    orientSide?: 'w' | 'b';
    highlightArrows?: LexiconArrow[];
  }) => { ok: boolean; count: number };
  exitLexiconDemo?: (playFromHere?: boolean) => void;
  stepScriptForward?: () => boolean;
  stepScriptBackward?: () => boolean;
  enterMultiplayerGame?: (cfg: {
    roomCode: string;
    playerColor: RoomRole;
    moves?: RoomMove[];
    resetCount?: number;
  }) => void;
  leaveMultiplayerGame?: () => void;
  applyRemoteMove?: (move: RemoteMovePayload) => boolean;
  syncMultiplayerState?: (payload: SyncStatePayload) => boolean;
  declareTimeout?: (loserColor: PieceColor) => boolean;
  setAnimationSpeedScale?: (scale: number) => void;
  clearPremoves?: () => void;
}

function formatMultiplayerError(
  lang: Language,
  err: MultiplayerError,
  roomCode?: string
): string {
  switch (err.code) {
    case 'NOT_CONFIGURED':
      return translate(lang, 'mpErrNotConfigured');
    case 'TABLE_NOT_DEPLOYED':
      return translate(lang, 'mpErrTableNotDeployed');
    case 'ROOM_NOT_FOUND':
      return translate(lang, 'mpErrRoomNotFound', { code: roomCode || '----' });
    case 'ROOM_ALREADY_EXISTS':
      return translate(lang, 'mpErrRoomExists');
    case 'INVALID_ROOM_CODE':
      return translate(lang, 'mpErrInvalidCode');
    case 'NOT_YOUR_TURN':
      return translate(lang, 'mpErrNotYourTurn');
    case 'UNAUTHORIZED':
      return translate(lang, 'mpErrUnauthorized');
    case 'CONFLICT':
      return translate(lang, 'mpErrConflict');
    case 'NETWORK_ERROR':
      return translate(lang, 'mpErrNetwork');
    default:
      return translate(lang, 'mpErrUnknown');
  }
}

function getWizardChessApi(): WizardChessWindowApi | undefined {
  return (window as unknown as { wizardChess?: WizardChessWindowApi }).wizardChess;
}

function showHighlightsForReview(
  review: CoachReviewResult,
  hoveredAlt: AlternativeSuggestion | null = null
): void {
  const api = getWizardChessApi();
  if (!api?.showCoachHighlights) return;

  const arrows: Array<{
    fromR: number;
    fromC: number;
    toR: number;
    toC: number;
    kind: 'danger' | 'best' | 'alt';
  }> = [];

  if (review.plannedMove && review.shouldWarn) {
    arrows.push({
      fromR: review.plannedMove.fromR,
      fromC: review.plannedMove.fromC,
      toR: review.plannedMove.toR,
      toC: review.plannedMove.toC,
      kind: 'danger',
    });
  }

  if (hoveredAlt) {
    arrows.push({
      fromR: hoveredAlt.fromR,
      fromC: hoveredAlt.fromC,
      toR: hoveredAlt.toR,
      toC: hoveredAlt.toC,
      kind: 'best',
    });
  } else {
    review.alternatives.forEach((alt, idx) => {
      arrows.push({
        fromR: alt.fromR,
        fromC: alt.fromC,
        toR: alt.toR,
        toC: alt.toC,
        kind: idx === 0 ? 'best' : 'alt',
      });
    });
  }

  api.showCoachHighlights({
    arrows,
    squares: review.highlightSquares ?? [],
  });
}

export default function App() {
  const initializedRef = useRef(false);
  const rulesRef = useRef<ChessRulesEngine | null>(null);
  const engineRef = useRef<StockfishService | null>(null);
  const uciBtnRef = useRef<HTMLButtonElement | null>(null);

  if (!rulesRef.current) {
    rulesRef.current = new ChessRulesEngine();
  }
  if (!engineRef.current) {
    engineRef.current = new StockfishService(loadSavedStrength());
  }

  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [lang, setLang] = useState<Language>(() => loadSavedLanguage());
  const [trainingMode, setTrainingMode] = useState<boolean>(() => loadSavedTrainingMode());
  const [strength, setStrength] = useState<EngineStrengthConfig>(() =>
    engineRef.current!.getStrength()
  );
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(() =>
    engineRef.current!.getStatus()
  );
  const [strengthPanelOpen, setStrengthPanelOpen] = useState(false);
  const [timeControlId, setTimeControlId] = useState<TimeControlId>(() => {
    const fromUrl = parseTimeControlFromUrl();
    return fromUrl ?? loadSavedTimeControlId();
  });
  const [timeControlPanelOpen, setTimeControlPanelOpen] = useState(false);
  const [whiteTimeMs, setWhiteTimeMs] = useState<number>(() =>
    getTimeControlById(parseTimeControlFromUrl() ?? loadSavedTimeControlId()).initialMs
  );
  const [blackTimeMs, setBlackTimeMs] = useState<number>(() =>
    getTimeControlById(parseTimeControlFromUrl() ?? loadSavedTimeControlId()).initialMs
  );
  const [lexiconOpen, setLexiconOpen] = useState(false);
  const [lexiconInitialOpeningId, setLexiconInitialOpeningId] = useState<string | null>(null);
  const [activeDemo, setActiveDemo] = useState<ActiveLexiconDemo | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [coachChecking, setCoachChecking] = useState(false);
  const [coachToast, setCoachToast] = useState<string | null>(null);
  const [pendingCoach, setPendingCoach] = useState<PendingCoachPrompt | null>(null);
  const [transportMode, setTransportMode] = useState<MultiplayerTransportMode>(() => {
    if (typeof window !== 'undefined') {
      const mpParam = new URLSearchParams(window.location.search).get('mp');
      if (mpParam === 'local') return 'local';
      if (mpParam === 'supabase' && isSupabaseConfigured()) return 'supabase';
    }
    return getDefaultTransportMode();
  });
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [mpBusy, setMpBusy] = useState(false);
  const [mpError, setMpError] = useState<{ err: MultiplayerError; code?: string } | null>(
    null
  );
  const [mpSession, setMpSession] = useState<MultiplayerSessionInfo>(() => ({
    active: false,
    mode: getDefaultTransportMode(),
    roomCode: null,
    role: null,
    opponentConnected: false,
    connectionStatus: 'idle',
    errorMessage: null,
  }));
  const [mpRoom, setMpRoom] = useState<RoomState | null>(null);
  const [initialJoinCode, setInitialJoinCode] = useState<string>(
    () => parseRoomCodeFromUrl() ?? ''
  );
  const [engineReady, setEngineReady] = useState(false);
  const [gameState, setGameState] = useState<HudGameState>({
    turn: 'w',
    playerColor: 'w',
    inCheck: false,
    isGameOver: false,
    outcome: 'ongoing',
    winner: null,
    isAIThinking: false,
    capturedByWhite: 0,
    capturedByBlack: 0,
    historyUci: [],
    gameMode: 'single',
    roomCode: null,
    scriptedGameActive: false,
    scriptCursor: 0,
    scriptMovesCount: 0,
  });

  const langRef = useRef(lang);
  langRef.current = lang;
  const trainingModeRef = useRef(trainingMode);
  trainingModeRef.current = trainingMode;
  const pendingCoachRef = useRef<PendingCoachPrompt | null>(null);
  pendingCoachRef.current = pendingCoach;
  const coachRequestSeqRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomManagerRef = useRef<RoomManager | null>(null);
  const isEnteringRoomRef = useRef(false);
  const autoJoinedUrlRef = useRef(false);
  const engineReadyRef = useRef(false);
  const mpSessionRef = useRef(mpSession);
  mpSessionRef.current = mpSession;
  const mpBusyRef = useRef(mpBusy);
  mpBusyRef.current = mpBusy;
  const timeControl = useMemo(() => getTimeControlById(timeControlId), [timeControlId]);
  const timeControlRef = useRef(timeControl);
  timeControlRef.current = timeControl;
  const whiteTimeMsRef = useRef(whiteTimeMs);
  whiteTimeMsRef.current = whiteTimeMs;
  const blackTimeMsRef = useRef(blackTimeMs);
  blackTimeMsRef.current = blackTimeMs;
  const prevMoveCountRef = useRef(0);
  const handleResetMultiplayerMatchRef = useRef<(() => Promise<void>) | null>(null);

  const showCoachToast = useCallback((text: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setCoachToast(text);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setCoachToast(null);
    }, 2800);
  }, []);

  const clearCoachUi = useCallback(() => {
    coachRequestSeqRef.current += 1;
    setCoachChecking(false);
    setCoachToast(null);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (pendingCoachRef.current) {
      const { resolve } = pendingCoachRef.current;
      pendingCoachRef.current = null;
      setPendingCoach(null);
      resolve({ action: 'cancel' });
    }
    getWizardChessApi()?.clearCoachHighlights?.();
  }, []);

  const teardownTransientBoardOverlays = useCallback(() => {
    clearCoachUi();
    setActiveDemo(null);
    setLexiconOpen(false);
    setStrengthPanelOpen(false);
    setPendingPromotion((prev) => {
      prev?.resolve(null);
      return null;
    });
  }, [clearCoachUi]);

  useEffect(() => {
    const manager = new RoomManager({
      mode: transportMode,
      callbacks: {
        onSessionChange: (session, room) => {
          setMpSession(session);
          setMpRoom(room);
        },
        onRemoteMove: (move) => {
          const applied = getWizardChessApi()?.applyRemoteMove?.(move);
          if (applied === false) {
            void manager
              .refreshRoom()
              .then((latest) => {
                if (latest && roomManagerRef.current === manager) {
                  teardownTransientBoardOverlays();
                  getWizardChessApi()?.syncMultiplayerState?.({
                    moves: latest.moves,
                    resetCount: latest.reset_count,
                    playerColor: manager.getSessionInfo().role ?? undefined,
                  });
                }
              })
              .catch(() => {});
          }
        },
        onStateSync: (payload) => {
          if (isEnteringRoomRef.current) return;
          teardownTransientBoardOverlays();
          const lastMove = payload.moves[payload.moves.length - 1];
          if (lastMove?.tc) {
            const remotePreset = getTimeControlById(lastMove.tc);
            setTimeControlId(remotePreset.id);
            if (typeof lastMove.wMs === 'number') setWhiteTimeMs(lastMove.wMs);
            if (typeof lastMove.bMs === 'number') setBlackTimeMs(lastMove.bMs);
          } else if (payload.moves.length === 0) {
            setWhiteTimeMs(timeControlRef.current.initialMs);
            setBlackTimeMs(timeControlRef.current.initialMs);
          }
          getWizardChessApi()?.syncMultiplayerState?.(payload);
        },
        onError: (err) => {
          setMpError({ err, code: mpSessionRef.current.roomCode ?? undefined });
        },
      },
    });
    roomManagerRef.current = manager;
    setMpSession(manager.getSessionInfo());
    setMpRoom(manager.getRoomState());

    return () => {
      if (roomManagerRef.current === manager) {
        roomManagerRef.current = null;
      }
      manager.dispose();
    };
  }, [transportMode, teardownTransientBoardOverlays]);

  useEffect(() => {
    const engine = engineRef.current!;
    const unsubscribe = engine.onStatusChange(setEngineStatus);
    engine.init();

    if (!initializedRef.current) {
      initializedRef.current = true;
      initWizardChess({
        rules: rulesRef.current!,
        requestEngineMove: (fen: string) => {
          const tc = timeControlRef.current;
          const aiColor: PieceColor = rulesRef.current?.getTurn() ?? 'b';
          const aiRem = aiColor === 'w' ? whiteTimeMsRef.current : blackTimeMsRef.current;
          const movetimeCap = computeAiMovetimeMs(
            tc,
            aiRem,
            engine.getStrength().movetimeMs
          );
          return engine.getBestMove(fen, undefined, movetimeCap);
        },
        onCancelEngine: () => engine.stop(),
        onNewGame: () => {
          engine.newGame();
          clearCoachUi();
          setActiveDemo(null);
          prevMoveCountRef.current = 0;
          setWhiteTimeMs(timeControlRef.current.initialMs);
          setBlackTimeMs(timeControlRef.current.initialMs);
        },
        requestPromotion: ({ color }: { color: PieceColor }) =>
          new Promise<PromotionPiece | null>((resolve) => {
            setPendingPromotion({ color, resolve });
          }),
        reviewPlannedMove: async ({
          fen,
          fromR,
          fromC,
          toR,
          toC,
          promotion,
        }: {
          fen: string;
          fromR: number;
          fromC: number;
          toR: number;
          toC: number;
          promotion?: PromotionPiece;
        }): Promise<CoachDecision> => {
          if (!trainingModeRef.current) {
            return { action: 'proceed' };
          }

          clearCoachUi();
          const reqSeq = ++coachRequestSeqRef.current;
          setCoachChecking(true);
          let review: CoachReviewResult;
          try {
            review = await reviewPlannedMoveWithEngine(
              engine,
              fen,
              { fromR, fromC, toR, toC, promotion },
              langRef.current
            );
          } finally {
            if (coachRequestSeqRef.current === reqSeq) {
              setCoachChecking(false);
            }
          }

          if (coachRequestSeqRef.current !== reqSeq) {
            return { action: 'cancel' };
          }
          if (!trainingModeRef.current) {
            return { action: 'proceed' };
          }

          if (!review.shouldWarn) {
            if (review.reason) {
              showCoachToast(review.reason);
            }
            return { action: 'proceed' };
          }

          showHighlightsForReview(review);
          return new Promise<CoachDecision>((resolve) => {
            setPendingCoach({ review, resolve });
          });
        },
        handleIllegalAttempt: async ({
          fen,
          fromR,
          fromC,
          toR,
          toC,
        }: {
          fen: string;
          fromR: number;
          fromC: number;
          toR: number;
          toC: number;
        }): Promise<CoachDecision | null> => {
          if (!trainingModeRef.current) return null;

          clearCoachUi();
          const reqSeq = ++coachRequestSeqRef.current;
          const diagnosis = diagnoseIllegalMove(
            fen,
            fromR,
            fromC,
            toR,
            toC,
            langRef.current
          );
          setCoachChecking(true);
          let review: CoachReviewResult;
          try {
            review = await buildIllegalMoveReviewWithEngine(
              engine,
              fen,
              diagnosis,
              langRef.current,
              'illegal'
            );
          } finally {
            if (coachRequestSeqRef.current === reqSeq) {
              setCoachChecking(false);
            }
          }

          if (coachRequestSeqRef.current !== reqSeq || !trainingModeRef.current) {
            return null;
          }

          showHighlightsForReview(review);
          return new Promise<CoachDecision>((resolve) => {
            setPendingCoach({ review, resolve });
          });
        },
        handlePieceHasNoMoves: async ({
          fen,
          r,
          c,
        }: {
          fen: string;
          r: number;
          c: number;
        }) => {
          if (!trainingModeRef.current) return;
          const diagnosis = diagnoseNoLegalMoves(fen, r, c, langRef.current);
          if (!diagnosis) return;

          clearCoachUi();
          const reqSeq = ++coachRequestSeqRef.current;
          setCoachChecking(true);
          let review: CoachReviewResult;
          try {
            review = await buildIllegalMoveReviewWithEngine(
              engine,
              fen,
              diagnosis,
              langRef.current,
              'no_moves'
            );
          } finally {
            if (coachRequestSeqRef.current === reqSeq) {
              setCoachChecking(false);
            }
          }

          if (coachRequestSeqRef.current !== reqSeq || !trainingModeRef.current) {
            return;
          }
          showHighlightsForReview(review);
          await new Promise<CoachDecision>((resolve) => {
            setPendingCoach({ review, resolve });
          });
        },
        onLocalMoveMade: (move: {
          fromR: number;
          fromC: number;
          toR: number;
          toC: number;
          promotion?: string;
          uci?: string;
          san?: string;
          fen: string;
          color: PlayerColor;
        }) => {
          const mgr = roomManagerRef.current;
          if (!mgr || !mgr.getRoomState()) return;
          const status = rulesRef.current?.getStatus();
          const tc = timeControlRef.current;
          void mgr
            .submitLocalMove(
              {
                ...move,
                ...(tc.id !== 'unlimited'
                  ? {
                      tc: tc.id,
                      wMs: whiteTimeMsRef.current,
                      bMs: blackTimeMsRef.current,
                    }
                  : {}),
              },
              {
                nextStatus: status?.isGameOver ? 'finished' : 'playing',
              }
            )
            .catch(async (err) => {
              const mpErr =
                err instanceof MultiplayerError
                  ? err
                  : new MultiplayerError('UNKNOWN', String(err));
              setMpError({
                err: mpErr,
                code: mgr.getRoomState()?.code ?? undefined,
              });
              try {
                const latest = await mgr.refreshRoom();
                if (latest && roomManagerRef.current === mgr) {
                  teardownTransientBoardOverlays();
                  getWizardChessApi()?.syncMultiplayerState?.({
                    moves: latest.moves,
                    resetCount: latest.reset_count,
                    playerColor: mgr.getSessionInfo().role ?? undefined,
                  });
                }
              } catch {
                // ignore refresh errors after rollback attempt
              }
            });
        },
        onMultiplayerResetRequested: () => {
          void handleResetMultiplayerMatchRef.current?.();
        },
        onStateChange: (next: HudGameState) => {
          if (!engineReadyRef.current) {
            engineReadyRef.current = true;
            setEngineReady(true);
          }
          const nextHistory = Array.isArray(next.historyUci) ? next.historyUci : [];
          const prevLen = prevMoveCountRef.current;
          const tc = timeControlRef.current;
          if (nextHistory.length === 0 && prevLen > 0) {
            setWhiteTimeMs(tc.initialMs);
            setBlackTimeMs(tc.initialMs);
          } else if (nextHistory.length > prevLen && tc.id !== 'unlimited' && tc.incrementMs > 0) {
            if (next.turn === 'b') {
              setWhiteTimeMs((ms) => ms + tc.incrementMs);
            } else {
              setBlackTimeMs((ms) => ms + tc.incrementMs);
            }
          }
          prevMoveCountRef.current = nextHistory.length;
          setGameState({
            turn: next.turn,
            playerColor:
              next.playerColor === 'b' || next.playerColor === 'spectator'
                ? next.playerColor
                : 'w',
            inCheck: next.inCheck,
            isGameOver: next.isGameOver,
            outcome: next.outcome,
            winner: next.winner,
            isAIThinking: next.isAIThinking,
            capturedByWhite: next.capturedByWhite,
            capturedByBlack: next.capturedByBlack,
            historyUci: nextHistory,
            gameMode: next.gameMode === 'multi' ? 'multi' : 'single',
            roomCode: typeof next.roomCode === 'string' ? next.roomCode : null,
            scriptedGameActive: Boolean(next.scriptedGameActive),
            scriptCursor: typeof next.scriptCursor === 'number' ? next.scriptCursor : 0,
            scriptMovesCount:
              typeof next.scriptMovesCount === 'number' ? next.scriptMovesCount : 0,
            premoveCount: typeof next.premoveCount === 'number' ? next.premoveCount : 0,
          });
          if (!next.scriptedGameActive) {
            setActiveDemo(null);
          }
        },
      });
    }

    return () => {
      unsubscribe();
    };
  }, [clearCoachUi, showCoachToast, teardownTransientBoardOverlays]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileSheetOpen(false);
        setStrengthPanelOpen(false);
        setTimeControlPanelOpen(false);
      }
    };
    const handlePointerDown = () => {
      setTimeControlPanelOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileSheetOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (engineReady) {
      getWizardChessApi()?.setAnimationSpeedScale?.(timeControl.animSpeedScale);
    }
  }, [engineReady, timeControl.animSpeedScale]);

  const isClockRunning =
    timeControl.id !== 'unlimited' &&
    !gameState.isGameOver &&
    !gameState.scriptedGameActive &&
    gameState.historyUci.length >= 1;

  useEffect(() => {
    if (!isClockRunning) return;
    let lastTick = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.max(0, now - lastTick);
      lastTick = now;
      if (gameState.turn === 'w') {
        setWhiteTimeMs((prev) => {
          const next = Math.max(0, prev - dt);
          if (next === 0 && prev > 0) {
            getWizardChessApi()?.declareTimeout?.('w');
          }
          return next;
        });
      } else {
        setBlackTimeMs((prev) => {
          const next = Math.max(0, prev - dt);
          if (next === 0 && prev > 0) {
            getWizardChessApi()?.declareTimeout?.('b');
          }
          return next;
        });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [isClockRunning, gameState.turn]);

  const handleSelectTimeControl = useCallback((nextId: TimeControlId) => {
    const preset = getTimeControlById(nextId);
    setTimeControlId(preset.id);
    saveTimeControlId(preset.id);
    setWhiteTimeMs(preset.initialMs);
    setBlackTimeMs(preset.initialMs);
    getWizardChessApi()?.setAnimationSpeedScale?.(preset.animSpeedScale);
  }, []);

  const handleSelectTransportMode = useCallback((nextMode: MultiplayerTransportMode) => {
    if (mpSessionRef.current.active || mpBusyRef.current) return;
    setMpError(null);
    setTransportMode(nextMode);
  }, []);

  const handleCreateRoom = useCallback(
    async (hostColor: PlayerColor) => {
      const mgr = roomManagerRef.current;
      if (!mgr || mpBusyRef.current) return;
      setMpBusy(true);
      setMpError(null);
      isEnteringRoomRef.current = true;
      try {
        const { room, role } = await mgr.createRoom({ hostColor });
        teardownTransientBoardOverlays();
        getWizardChessApi()?.enterMultiplayerGame?.({
          roomCode: room.code,
          playerColor: role,
          moves: room.moves,
          resetCount: room.reset_count,
        });
      } catch (err) {
        const mpErr =
          err instanceof MultiplayerError
            ? err
            : new MultiplayerError('UNKNOWN', String(err));
        setMpError({ err: mpErr });
      } finally {
        isEnteringRoomRef.current = false;
        setMpBusy(false);
      }
    },
    [teardownTransientBoardOverlays]
  );

  const handleJoinRoom = useCallback(
    async (rawCode: string, options?: { keepModalOpenOnSuccess?: boolean }) => {
      const mgr = roomManagerRef.current;
      if (!mgr || mpBusyRef.current) return;
      const normalized = normalizeRoomCode(rawCode);
      setMpBusy(true);
      setMpError(null);
      isEnteringRoomRef.current = true;
      try {
        const { room, role } = await mgr.joinRoom(normalized);
        teardownTransientBoardOverlays();
        getWizardChessApi()?.enterMultiplayerGame?.({
          roomCode: room.code,
          playerColor: role,
          moves: room.moves,
          resetCount: room.reset_count,
        });
        if (!options?.keepModalOpenOnSuccess) {
          setMultiplayerOpen(false);
        }
      } catch (err) {
        const mpErr =
          err instanceof MultiplayerError
            ? err
            : new MultiplayerError('UNKNOWN', String(err));
        setMpError({ err: mpErr, code: normalized });
        setInitialJoinCode(normalized);
        setMultiplayerOpen(true);
      } finally {
        isEnteringRoomRef.current = false;
        setMpBusy(false);
      }
    },
    [teardownTransientBoardOverlays]
  );

  const handleResetMultiplayerMatch = useCallback(async () => {
    const mgr = roomManagerRef.current;
    if (!mgr || !mgr.getRoomState() || mpBusyRef.current) return;
    const role = mgr.getSessionInfo().role;
    if (role === 'spectator') {
      setMpError({
        err: new MultiplayerError('UNAUTHORIZED', 'Spectators cannot reset the room.'),
        code: mgr.getRoomState()?.code,
      });
      return;
    }
    setMpBusy(true);
    setMpError(null);
    try {
      const updated = await mgr.requestReset();
      teardownTransientBoardOverlays();
      getWizardChessApi()?.syncMultiplayerState?.({
        moves: updated.moves,
        resetCount: updated.reset_count,
        playerColor: mgr.getSessionInfo().role ?? undefined,
      });
    } catch (err) {
      const mpErr =
        err instanceof MultiplayerError
          ? err
          : new MultiplayerError('UNKNOWN', String(err));
      setMpError({ err: mpErr, code: mgr.getRoomState()?.code });
    } finally {
      setMpBusy(false);
    }
  }, [teardownTransientBoardOverlays]);

  handleResetMultiplayerMatchRef.current = handleResetMultiplayerMatch;

  const handleLeaveRoom = useCallback(() => {
    roomManagerRef.current?.leaveRoom();
    teardownTransientBoardOverlays();
    getWizardChessApi()?.leaveMultiplayerGame?.();
    setMpError(null);
  }, [teardownTransientBoardOverlays]);

  useEffect(() => {
    if (!engineReady || autoJoinedUrlRef.current) return;
    const urlCode = parseRoomCodeFromUrl();
    if (!urlCode) return;
    autoJoinedUrlRef.current = true;
    setInitialJoinCode(urlCode);
    void handleJoinRoom(urlCode);
  }, [engineReady, handleJoinRoom]);

  const detectedOpening = useMemo(
    () => detectOpening(gameState.historyUci),
    [gameState.historyUci]
  );

  const handleToggleLanguage = useCallback(() => {
    setLang((prev) => {
      const next: Language = prev === 'de' ? 'en' : 'de';
      saveLanguage(next);
      return next;
    });
  }, []);

  const handleToggleTrainingMode = useCallback(() => {
    const inMulti = mpSessionRef.current.active || gameState.gameMode === 'multi';
    setTrainingMode((prev) => {
      const next = !prev;
      saveTrainingMode(next);
      if (!next) {
        clearCoachUi();
      } else if (inMulti) {
        showCoachToast(translate(langRef.current, 'coachOnlySinglePlayer'));
      }
      return next;
    });
  }, [clearCoachUi, gameState.gameMode, showCoachToast]);

  const handleChangeStrength = useCallback((nextConfig: EngineStrengthConfig) => {
    setStrength(nextConfig);
    engineRef.current?.setStrength(nextConfig);
  }, []);

  const handlePromotionSelect = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      const { resolve } = pendingPromotion;
      setPendingPromotion(null);
      resolve(piece);
    },
    [pendingPromotion]
  );

  const handlePromotionCancel = useCallback(() => {
    if (!pendingPromotion) return;
    const { resolve } = pendingPromotion;
    setPendingPromotion(null);
    resolve(null);
  }, [pendingPromotion]);

  const handleCoachSelectAlternative = useCallback((alt: AlternativeSuggestion) => {
    coachRequestSeqRef.current += 1;
    const current = pendingCoachRef.current;
    if (!current) return;
    pendingCoachRef.current = null;
    setPendingCoach(null);
    getWizardChessApi()?.clearCoachHighlights?.();
    current.resolve({
      action: 'alternative',
      fromR: alt.fromR,
      fromC: alt.fromC,
      toR: alt.toR,
      toC: alt.toC,
      promotion: alt.promotion,
    });
  }, []);

  const handleCoachChooseAnother = useCallback(() => {
    coachRequestSeqRef.current += 1;
    const current = pendingCoachRef.current;
    if (!current) return;
    pendingCoachRef.current = null;
    setPendingCoach(null);
    getWizardChessApi()?.clearCoachHighlights?.();
    current.resolve({ action: 'cancel' });
  }, []);

  const handleCoachPlayAnyway = useCallback(() => {
    coachRequestSeqRef.current += 1;
    const current = pendingCoachRef.current;
    if (!current) return;
    pendingCoachRef.current = null;
    setPendingCoach(null);
    getWizardChessApi()?.clearCoachHighlights?.();
    current.resolve({ action: 'proceed' });
  }, []);

  const handleCoachHoverAlternative = useCallback(
    (alt: AlternativeSuggestion | null) => {
      const current = pendingCoachRef.current;
      if (!current) return;
      showHighlightsForReview(current.review, alt);
    },
    []
  );

  const handleStartOpeningDemo = useCallback(
    (opening: OpeningEntry) => {
      if (mpSessionRef.current.active || gameState.gameMode === 'multi') {
        showCoachToast(translate(lang, 'mpDemoBlocked'));
        return;
      }
      clearCoachUi();
      setLexiconOpen(false);
      setActiveDemo({
        title: opening.name[lang],
        badge: opening.eco,
        description: opening.summary[lang],
        totalSteps: opening.movesSan.length,
      });
      getWizardChessApi()?.loadLexiconDemo?.({
        fen: null,
        movesSan: opening.movesSan,
        orientSide: opening.recommendedSide,
      });
    },
    [clearCoachUi, gameState.gameMode, lang, showCoachToast]
  );

  const handleStartStrategyDemo = useCallback(
    (strategy: StrategyEntry) => {
      if (mpSessionRef.current.active || gameState.gameMode === 'multi') {
        showCoachToast(translate(lang, 'mpDemoBlocked'));
        return;
      }
      clearCoachUi();
      setLexiconOpen(false);
      setActiveDemo({
        title: strategy.name[lang],
        badge: translate(
          lang,
          strategy.category === 'tactics'
            ? 'catTactics'
            : strategy.category === 'endgame'
              ? 'catEndgame'
              : 'catStrategy'
        ),
        description: strategy.exampleExplanation[lang],
        totalSteps: strategy.exampleMovesSan.length,
      });
      getWizardChessApi()?.loadLexiconDemo?.({
        fen: strategy.exampleFen,
        movesSan: strategy.exampleMovesSan,
        orientSide: strategy.orientSide,
        highlightArrows: strategy.highlightArrows,
      });
    },
    [clearCoachUi, gameState.gameMode, lang, showCoachToast]
  );

  const handleDemoPrev = useCallback(() => {
    getWizardChessApi()?.stepScriptBackward?.();
  }, []);

  const handleDemoNext = useCallback(() => {
    getWizardChessApi()?.stepScriptForward?.();
  }, []);

  const handleDemoPlayFromHere = useCallback(() => {
    setActiveDemo(null);
    getWizardChessApi()?.exitLexiconDemo?.(true);
  }, []);

  const handleDemoExit = useCallback(() => {
    setActiveDemo(null);
    getWizardChessApi()?.exitLexiconDemo?.(false);
  }, []);

  const handleOpenLexicon = useCallback((openingId: string | null = null) => {
    setLexiconInitialOpeningId(openingId);
    setLexiconOpen(true);
  }, []);

  const handleRestoreUI = () => {
    const win = getWizardChessApi();
    if (win?.toggleUI) {
      win.toggleUI(false);
    } else {
      document.body.classList.remove('cinematic-ui-hidden');
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) btnHide.textContent = translate(lang, 'hideUi');
    }
  };

  const isMulti = gameState.gameMode === 'multi' || mpSession.active;
  const activeRole: RoomRole = isMulti
    ? (mpSession.role ?? gameState.playerColor)
    : gameState.playerColor;
  const supabaseConfigured = isSupabaseConfigured();
  const mpErrorText = mpError
    ? formatMultiplayerError(lang, mpError.err, mpError.code)
    : null;

  // Compute localized status text
  const turnLabel =
    gameState.turn === 'w'
      ? translate(lang, 'whiteToMove')
      : translate(lang, 'blackToMove');

  let statusText = turnLabel;
  if (gameState.isGameOver) {
    if (gameState.outcome === 'checkmate') {
      const winnerName =
        gameState.winner === 'w'
          ? translate(lang, 'whiteName')
          : translate(lang, 'blackName');
      statusText = translate(lang, 'checkmateWinner', { winner: winnerName });
    } else if (gameState.outcome === 'stalemate') {
      statusText = translate(lang, 'stalemateDraw');
    } else if (gameState.outcome === 'draw_fifty') {
      statusText = translate(lang, 'drawFiftyMoves');
    } else if (gameState.outcome === 'draw_repetition') {
      statusText = translate(lang, 'drawRepetition');
    } else if (gameState.outcome === 'draw_material') {
      statusText = translate(lang, 'drawInsufficientMaterial');
    } else {
      statusText = translate(lang, 'drawGeneric');
    }
  } else if (gameState.inCheck) {
    statusText = `${turnLabel} (${translate(lang, 'check')})`;
  } else if (isMulti) {
    if (activeRole === 'spectator') {
      statusText = `${turnLabel} (${translate(lang, 'mpSpectatorBadge')})`;
    } else if (gameState.turn === activeRole) {
      statusText = `${turnLabel} (${translate(
        lang,
        mpSession.opponentConnected ? 'mpYourTurn' : 'mpWaitingShort'
      )})`;
    } else {
      statusText = `${turnLabel} (${translate(lang, 'mpOpponentTurn')})`;
    }
  } else if (
    !gameState.scriptedGameActive &&
    (gameState.isAIThinking || gameState.turn !== gameState.playerColor)
  ) {
    statusText = `${turnLabel} (${translate(lang, 'aiThinking')})`;
  }

  const modeBadgeText =
    activeRole === 'spectator'
      ? translate(lang, 'mpSpectating')
      : activeRole === 'b'
        ? translate(lang, 'playingAsBlack')
        : translate(lang, 'playingAsWhite');

  const capturedText =
    gameState.capturedByWhite > 0 || gameState.capturedByBlack > 0
      ? translate(lang, 'capturedSummary', {
          white: gameState.capturedByWhite,
          black: gameState.capturedByBlack,
        })
      : '';

  const uciShortLabel = strength.maxStrength ? 'Max' : `${strength.elo} Elo`;

  const isCheckmateOutcome = gameState.outcome === 'checkmate';
  const isTimeoutOutcome = gameState.outcome === 'timeout';
  const overlayCrown = isCheckmateOutcome
    ? gameState.winner === 'b'
      ? '♚'
      : '♔'
    : isTimeoutOutcome
      ? '⏱'
      : '⚖';
  const overlayTitle = isCheckmateOutcome
    ? translate(lang, 'checkmate')
    : isTimeoutOutcome
      ? translate(lang, 'timeoutTitle')
      : translate(lang, 'draw');
  const overlaySubtitle = isCheckmateOutcome
    ? gameState.winner === 'b'
      ? translate(lang, 'blackTriumphs')
      : translate(lang, 'whiteTriumphs')
    : isTimeoutOutcome
      ? gameState.winner === 'b'
        ? translate(lang, 'timeoutBlackWins')
        : translate(lang, 'timeoutWhiteWins')
      : gameState.outcome === 'stalemate'
      ? translate(lang, 'stalemateDraw')
      : gameState.outcome === 'draw_fifty'
        ? translate(lang, 'drawFiftyMoves')
        : gameState.outcome === 'draw_repetition'
          ? translate(lang, 'drawRepetition')
          : gameState.outcome === 'draw_material'
            ? translate(lang, 'drawInsufficientMaterial')
            : translate(lang, 'drawSubtitle');

  return (
    <>
      <div id="loading-overlay">
        <div className="loader-title">{translate(lang, 'brandTitle')}</div>
        <div className="loader-bar-wrap">
          <div className="loader-bar" id="loader-bar"></div>
        </div>
        <div id="loader-text">{translate(lang, 'loadingText')}</div>
      </div>

      <div id="canvas-container"></div>

      <button
        type="button"
        className="hud-btn mobile-only-restore-ui"
        id="btn-mobile-show-ui"
        onClick={handleRestoreUI}
        title={translate(lang, 'showUiTitle')}
      >
        {translate(lang, 'showUi')}
      </button>

      <div id="hud-top">
        <div className="hud-group" id="hud-left">
          <div className="brand-pill">
            <span className="brand-title">{translate(lang, 'brandTitle')}</span>
          </div>
          <div className="status-pill" id="status-pill">
            <span
              className={`turn-dot ${gameState.turn === 'b' ? 'black' : ''}`}
              id="turn-dot"
            ></span>
            <span id="turn-text">{statusText}</span>
            <span className="mode-badge" id="mode-badge">
              {modeBadgeText}
            </span>
          </div>
          {mpSession.active && mpSession.roomCode && (
            <button
              type="button"
              id="mp-room-pill"
              data-testid="room-pill"
              className="mp-room-pill"
              title={translate(lang, 'mpRoomPillTitle')}
              onClick={() => setMultiplayerOpen(true)}
            >
              <span
                className={`mp-status-dot ${
                  mpSession.connectionStatus === 'error'
                    ? 'error'
                    : mpSession.connectionStatus === 'connecting' ||
                        mpSession.connectionStatus === 'reconnecting'
                      ? mpSession.connectionStatus
                      : mpSession.opponentConnected
                        ? 'connected'
                        : 'waiting'
                }`}
                aria-hidden="true"
              ></span>
              <span className="mp-pill-code">{mpSession.roomCode}</span>
              <span className="mp-pill-sep">•</span>
              <span className="mp-pill-status">
                {mpSession.opponentConnected
                  ? translate(lang, 'mpConnectedShort')
                  : translate(lang, 'mpWaitingShort')}
              </span>
              <span className="mp-pill-mode">
                {mpSession.mode === 'supabase' ? 'Cloud' : 'Local'}
              </span>
            </button>
          )}
          {detectedOpening && !gameState.scriptedGameActive && (
            <button
              type="button"
              id="opening-badge"
              className="opening-pill"
              title={translate(lang, 'openingClickHint')}
              onClick={() => handleOpenLexicon(detectedOpening.openingId ?? null)}
            >
              <span className="lexicon-eco-badge">{detectedOpening.eco}</span>
              <span>{detectedOpening.name[lang]}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          className={`hud-btn mobile-controls-trigger ${mobileSheetOpen ? 'active' : ''}`}
          id="btn-mobile-controls"
          aria-expanded={mobileSheetOpen}
          aria-controls="hud-right"
          onClick={() => setMobileSheetOpen((prev) => !prev)}
        >
          {mobileSheetOpen ? translate(lang, 'close') : translate(lang, 'controls')}
        </button>

        <div
          className={`mobile-sheet-backdrop ${mobileSheetOpen ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMobileSheetOpen(false);
          }}
          aria-hidden="true"
        ></div>

        <div
          className={`hud-group ${mobileSheetOpen ? 'mobile-sheet-open' : ''}`}
          id="hud-right"
        >
          <div
            className="mobile-sheet-handle-wrap"
            onClick={(e) => {
              e.stopPropagation();
              setMobileSheetOpen(false);
            }}
            aria-hidden="true"
          >
            <div className="mobile-sheet-handle"></div>
          </div>

          <div className="mobile-sheet-header">
            <span className="mobile-sheet-title">{translate(lang, 'controls')}</span>
            <button
              type="button"
              className="mobile-sheet-close"
              id="btn-mobile-sheet-close"
              onClick={(e) => {
                e.stopPropagation();
                setMobileSheetOpen(false);
              }}
              aria-label={translate(lang, 'closeAria')}
            >
              {translate(lang, 'close')} ✕
            </button>
          </div>

          <div className="mobile-sheet-section-label">
            {translate(lang, 'gameActions')}
          </div>

          <button
            className="hud-btn"
            id="btn-side-toggle"
            title={translate(lang, 'sideToggleTitle')}
            disabled={isMulti}
            hidden={isMulti}
            aria-hidden={isMulti}
            onClick={() => setMobileSheetOpen(false)}
          >
            {gameState.playerColor === 'w'
              ? translate(lang, 'playAsBlack')
              : translate(lang, 'playAsWhite')}
          </button>
          <button
            className="hud-btn"
            id="btn-ai-move"
            title={translate(lang, 'aiMoveTitle')}
            disabled={isMulti}
            hidden={isMulti}
            aria-hidden={isMulti}
            onClick={() => setMobileSheetOpen(false)}
          >
            {translate(lang, 'aiMove')}
          </button>
          <button
            className="hud-btn"
            id="btn-reset"
            title={translate(lang, 'resetTitle')}
            disabled={isMulti && activeRole === 'spectator'}
            onClick={() => setMobileSheetOpen(false)}
          >
            {translate(lang, 'newGame')}
          </button>

          <button
            type="button"
            className={`hud-btn ${mpSession.active ? 'active' : ''}`}
            id="btn-multiplayer"
            title={translate(lang, 'mpButtonTitle')}
            onClick={() => {
              setMultiplayerOpen(true);
              setMobileSheetOpen(false);
            }}
          >
            {mpSession.active && mpSession.roomCode
              ? translate(lang, 'mpButtonActive', { code: mpSession.roomCode })
              : translate(lang, 'mpButton')}
          </button>

          <button
            type="button"
            className={`hud-btn ${trainingMode ? 'active' : ''}`}
            id="btn-training-mode"
            aria-pressed={trainingMode}
            disabled={isMulti}
            aria-disabled={isMulti}
            title={translate(lang, 'trainingButtonTitle')}
            onClick={() => {
              handleToggleTrainingMode();
              setMobileSheetOpen(false);
            }}
          >
            {trainingMode
              ? translate(lang, 'trainingModeOn')
              : translate(lang, 'trainingModeOff')}
          </button>

          <button
            type="button"
            className={`hud-btn ${lexiconOpen ? 'active' : ''}`}
            id="btn-lexicon"
            title={translate(lang, 'lexiconButtonTitle')}
            onClick={() => {
              handleOpenLexicon(detectedOpening?.openingId ?? null);
              setMobileSheetOpen(false);
            }}
          >
            {translate(lang, 'lexiconButton')}
          </button>

          <div className="uci-btn-anchor" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`hud-btn ${timeControlPanelOpen ? 'active' : ''}`}
              id="btn-time-control"
              title={translate(lang, 'timeControlTitle')}
              aria-expanded={timeControlPanelOpen}
              disabled={isMulti}
              onClick={() => {
                setStrengthPanelOpen(false);
                setTimeControlPanelOpen((prev) => !prev);
              }}
            >
              ⏱ {timeControl.label}
            </button>

            <TimeControlPanel
              open={timeControlPanelOpen}
              lang={lang}
              selectedId={timeControl.id}
              disabled={isMulti}
              onSelect={handleSelectTimeControl}
              onClose={() => setTimeControlPanelOpen(false)}
            />
          </div>

          <div className="uci-btn-anchor">
            <button
              ref={uciBtnRef}
              type="button"
              className={`hud-btn ${strengthPanelOpen ? 'active' : ''}`}
              id="btn-uci-strength"
              title={translate(lang, 'uciButtonTitle')}
              aria-expanded={strengthPanelOpen}
              onClick={() => setStrengthPanelOpen((prev) => !prev)}
            >
              <span className={`uci-inline-dot ${engineStatus}`} aria-hidden="true"></span>
              {translate(lang, 'engineButtonLabel', { label: uciShortLabel })}
            </button>

            <EngineStrengthPanel
              open={strengthPanelOpen}
              lang={lang}
              strength={strength}
              status={engineStatus}
              onChangeStrength={handleChangeStrength}
              onClose={() => setStrengthPanelOpen(false)}
              anchorRef={uciBtnRef}
            />
          </div>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">
            <span>{translate(lang, 'cameraViews')}</span>
            <span className="mobile-sheet-section-sub">
              {translate(lang, 'tapActiveFlip')}
            </span>
          </div>

          <button
            className="hud-btn active"
            id="btn-cam-player"
            title={translate(lang, 'camPlayerTitle')}
          >
            {translate(lang, 'playerCam')}
          </button>
          <button
            className="hud-btn"
            id="btn-cam-top"
            title={translate(lang, 'camTopTitle')}
          >
            {translate(lang, 'overhead')}
          </button>
          <button
            className="hud-btn"
            id="btn-cam-side"
            title={translate(lang, 'camSideTitle')}
          >
            {translate(lang, 'side')}
          </button>
          <button
            className="hud-btn"
            id="btn-cam-wide"
            title={translate(lang, 'camWideTitle')}
          >
            {translate(lang, 'cathedral')}
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">
            {translate(lang, 'displayGestures')}
          </div>

          <button
            type="button"
            className="hud-btn lang-toggle-btn"
            id="btn-lang-toggle"
            title={translate(lang, 'langToggleTitle')}
            onClick={handleToggleLanguage}
          >
            {lang === 'de' ? 'DE | EN' : 'EN | DE'}
          </button>

          <button
            className="hud-btn"
            id="btn-hide-ui"
            title={translate(lang, 'hideUiTitle')}
            onClick={() => setMobileSheetOpen(false)}
          >
            {translate(lang, 'hideUi')}
          </button>

          <div className="mobile-sheet-hint">
            <strong>{translate(lang, 'touchHintPrefix')}</strong>{' '}
            {translate(lang, 'touchHintBody')}
          </div>
        </div>
      </div>

      <ChessClockBar
        lang={lang}
        preset={timeControl}
        whiteMs={whiteTimeMs}
        blackMs={blackTimeMs}
        activeTurn={gameState.turn}
        isRunning={isClockRunning}
        premoveCount={gameState.premoveCount ?? 0}
        onCancelPremoves={() => getWizardChessApi()?.clearPremoves?.()}
      />

      <TrainingCoachPanel
        lang={lang}
        isChecking={coachChecking}
        toastText={coachToast}
        review={pendingCoach?.review ?? null}
        onSelectAlternative={handleCoachSelectAlternative}
        onHoverAlternative={handleCoachHoverAlternative}
        onChooseAnother={handleCoachChooseAnother}
        onPlayAnyway={handleCoachPlayAnyway}
      />

      <LexiconDemoBar
        lang={lang}
        demo={activeDemo}
        cursor={gameState.scriptCursor}
        isAnimating={false}
        onPrev={handleDemoPrev}
        onNext={handleDemoNext}
        onPlayFromHere={handleDemoPlayFromHere}
        onExit={handleDemoExit}
      />

      <div id="hud-bottom">
        <div className="hint-pill" id="controls-hint">
          <strong>{translate(lang, 'desktopHintPrefix')}</strong>{' '}
          {translate(lang, 'desktopHintBody')}
        </div>
        <div className="captured-pill" id="captured-tray">
          {capturedText}
        </div>
      </div>

      <div id="checkmate-overlay" role="status" aria-live="polite">
        <div className="checkmate-banner">
          <div className="checkmate-ornament">
            {translate(lang, 'sanctumJudgment')}
          </div>
          <div className="checkmate-crown" id="checkmate-crown">
            {overlayCrown}
          </div>
          <div className="checkmate-title" id="checkmate-title">
            {overlayTitle}
          </div>
          <div className="checkmate-rule"></div>
          <div className="checkmate-subtitle" id="checkmate-subtitle">
            {overlaySubtitle}
          </div>
          <div className="checkmate-actions">
            {isCheckmateOutcome && (
              <button className="checkmate-btn" id="btn-checkmate-replay">
                {translate(lang, 'replayKingFall')}
              </button>
            )}
            <button
              className="checkmate-btn"
              id="btn-checkmate-newgame"
              disabled={isMulti && activeRole === 'spectator'}
            >
              {translate(lang, 'newGame')}
            </button>
            <button className="checkmate-btn secondary" id="btn-checkmate-dismiss">
              {translate(lang, 'dismiss')}
            </button>
          </div>
        </div>
      </div>

      <PromotionModal
        open={Boolean(pendingPromotion)}
        color={pendingPromotion?.color ?? 'w'}
        lang={lang}
        onSelect={handlePromotionSelect}
        onCancel={handlePromotionCancel}
      />

      <LexiconModal
        open={lexiconOpen}
        lang={lang}
        initialOpeningId={lexiconInitialOpeningId}
        onClose={() => setLexiconOpen(false)}
        onStartOpeningDemo={handleStartOpeningDemo}
        onStartStrategyDemo={handleStartStrategyDemo}
      />

      <MultiplayerModal
        open={multiplayerOpen}
        lang={lang}
        session={mpSession}
        room={mpRoom}
        transportMode={transportMode}
        supabaseConfigured={supabaseConfigured}
        busy={mpBusy}
        errorText={mpErrorText}
        initialJoinCode={initialJoinCode}
        timeControlId={timeControl.id}
        onSelectTimeControl={handleSelectTimeControl}
        onSelectTransportMode={handleSelectTransportMode}
        onCreateRoom={(color) => void handleCreateRoom(color)}
        onJoinRoom={(code) => void handleJoinRoom(code)}
        onResetMatch={() => void handleResetMultiplayerMatch()}
        onLeaveRoom={handleLeaveRoom}
        onClose={() => setMultiplayerOpen(false)}
      />
    </>
  );
}
