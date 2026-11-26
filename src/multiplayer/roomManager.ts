import { LocalTransport } from './localTransport.ts';
import { isSupabaseConfigured } from './supabaseClient.ts';
import { SupabaseTransport } from './supabaseTransport.ts';
import {
  MultiplayerError,
  type CanonicalPromotion,
  type ConnectionStatus,
  type LocalMoveInput,
  type MultiplayerSessionInfo,
  type MultiplayerTransport,
  type MultiplayerTransportMode,
  type PlayerColor,
  type RoomManagerCallbacks,
  type RoomMove,
  type RoomRole,
  type RoomState,
  type RoomStatus,
  type StorageLike,
} from './types.ts';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INITIAL_CHESS_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const PLAYER_TOKEN_STORAGE_KEY = 'wizard_chess_token';

export function normalizeRoomCode(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

export function isValidRoomCode(raw: string | null | undefined): boolean {
  return /^[A-Z0-9]{4}$/.test(normalizeRoomCode(raw));
}

export function generateRoomCode(randomFn: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(randomFn() * ROOM_CODE_ALPHABET.length);
    const bounded = Math.max(0, Math.min(ROOM_CODE_ALPHABET.length - 1, idx));
    code += ROOM_CODE_ALPHABET[bounded];
  }
  return code;
}

export function parseRoomCodeFromUrl(searchOrUrl?: string): string | null {
  let rawInput = searchOrUrl;
  if (rawInput === undefined) {
    rawInput = typeof window !== 'undefined' ? window.location.search : '';
  }
  if (!rawInput) {
    return null;
  }
  rawInput = rawInput.trim();
  if (!rawInput) {
    return null;
  }

  let search = '';
  if (rawInput.includes('://')) {
    try {
      search = new URL(rawInput).search;
    } catch {
      return null;
    }
  } else {
    const hashIndex = rawInput.indexOf('#');
    const withoutHash =
      hashIndex >= 0 ? rawInput.slice(0, hashIndex) : rawInput;
    if (!withoutHash) {
      return null;
    }
    if (withoutHash.includes('?')) {
      search = withoutHash.slice(withoutHash.indexOf('?'));
    } else {
      search = `?${withoutHash}`;
    }
  }

  const params = new URLSearchParams(search);
  const candidate = normalizeRoomCode(params.get('room'));
  return isValidRoomCode(candidate) ? candidate : null;
}

export const getRoomCodeFromUrl = parseRoomCodeFromUrl;

export function buildInviteUrl(
  roomCode: string,
  baseUrl?: string,
  timeControlId?: string
): string {
  const code = normalizeRoomCode(roomCode);
  if (!isValidRoomCode(code)) {
    throw new MultiplayerError(
      'INVALID_ROOM_CODE',
      `Invalid room code "${roomCode}" for invite URL.`
    );
  }

  const originOrHref =
    baseUrl ??
    (typeof window !== 'undefined' && window.location?.href
      ? window.location.href
      : 'http://localhost/');
  const url = new URL(originOrHref);
  url.searchParams.set('room', code);
  if (timeControlId && timeControlId !== 'unlimited') {
    url.searchParams.set('tc', timeControlId);
  }
  return url.toString();
}

export function syncRoomCodeToUrl(roomCode: string | null): void {
  if (
    typeof window === 'undefined' ||
    !window.location?.href ||
    !window.history?.replaceState
  ) {
    return;
  }
  const url = new URL(window.location.href);
  if (roomCode && isValidRoomCode(roomCode)) {
    url.searchParams.set('room', normalizeRoomCode(roomCode));
  } else {
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url.toString());
}

export function normalizePromotion(
  promotion?: string | null
): CanonicalPromotion | undefined {
  if (!promotion || typeof promotion !== 'string') {
    return undefined;
  }
  switch (promotion.trim().toLowerCase()) {
    case 'q':
    case 'queen':
      return 'queen';
    case 'r':
    case 'rook':
      return 'rook';
    case 'b':
    case 'bishop':
      return 'bishop';
    case 'n':
    case 'knight':
      return 'knight';
    default:
      return undefined;
  }
}

function generatePlayerToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const randA = Math.random().toString(36).slice(2, 10);
  const randB = Math.random().toString(36).slice(2, 10);
  return `wc_${Date.now().toString(36)}_${randA}${randB}`;
}

export function getOrCreatePlayerToken(storage?: StorageLike): string {
  const targetStorage =
    storage ??
    (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
      ? window.sessionStorage
      : typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
        ? window.localStorage
        : undefined);

  if (targetStorage) {
    try {
      const existing = targetStorage.getItem(PLAYER_TOKEN_STORAGE_KEY);
      if (existing && existing.trim().length > 0) {
        return existing.trim();
      }
      const created = generatePlayerToken();
      targetStorage.setItem(PLAYER_TOKEN_STORAGE_KEY, created);
      return created;
    } catch {
      return generatePlayerToken();
    }
  }

  return generatePlayerToken();
}

export function resolveRoleForToken(
  room: RoomState,
  playerToken: string
): RoomRole {
  if (playerToken && room.white_token === playerToken) {
    return 'w';
  }
  if (playerToken && room.black_token === playerToken) {
    return 'b';
  }
  return 'spectator';
}

export function getDefaultTransportMode(): MultiplayerTransportMode {
  return isSupabaseConfigured() ? 'supabase' : 'local';
}

function sortAndDedupeMoves(moves: RoomMove[]): RoomMove[] {
  const bySeq = new Map<number, RoomMove>();
  for (const move of moves) {
    if (!bySeq.has(move.seq)) {
      bySeq.set(move.seq, move);
    }
  }
  return Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
}

function getMaxSeq(moves: RoomMove[]): number {
  return moves.reduce((max, m) => (m.seq > max ? m.seq : max), 0);
}

function normalizeError(err: unknown): MultiplayerError {
  if (err instanceof MultiplayerError) {
    return err;
  }
  const message =
    err instanceof Error ? err.message : 'Unexpected multiplayer error.';
  return new MultiplayerError('UNKNOWN', message, err);
}

export interface RoomManagerOptions {
  mode?: MultiplayerTransportMode;
  transport?: MultiplayerTransport;
  playerToken?: string;
  storage?: StorageLike;
  callbacks?: RoomManagerCallbacks;
  syncUrl?: boolean;
}

export class RoomManager {
  private readonly transport: MultiplayerTransport;
  private readonly playerToken: string;
  private readonly syncUrl: boolean;
  private callbacks: RoomManagerCallbacks;

  private room: RoomState | null = null;
  private role: RoomRole | null = null;
  private connectionStatus: ConnectionStatus = 'idle';
  private errorMessage: string | null = null;
  private lastAppliedSeq = 0;
  private lastAppliedResetCount = 0;
  private sessionEpoch = 0;
  private unsubscribeFn: (() => void) | null = null;

  constructor(options?: RoomManagerOptions) {
    const mode =
      options?.transport?.mode ?? options?.mode ?? getDefaultTransportMode();
    this.transport =
      options?.transport ??
      (mode === 'supabase'
        ? new SupabaseTransport()
        : new LocalTransport({ storage: options?.storage }));
    this.playerToken =
      options?.playerToken ?? getOrCreatePlayerToken(options?.storage);
    this.callbacks = options?.callbacks ?? {};
    this.syncUrl = options?.syncUrl ?? typeof window !== 'undefined';
  }

  setCallbacks(callbacks: RoomManagerCallbacks): void {
    this.callbacks = callbacks;
  }

  getPlayerToken(): string {
    return this.playerToken;
  }

  getRoomState(): RoomState | null {
    return this.room;
  }

  getSessionInfo(): MultiplayerSessionInfo {
    const opponentConnected = Boolean(
      this.room &&
        this.role &&
        ((this.role === 'w' && Boolean(this.room.black_token)) ||
          (this.role === 'b' && Boolean(this.room.white_token)) ||
          (this.role === 'spectator' &&
            Boolean(this.room.white_token) &&
            Boolean(this.room.black_token)))
    );

    return {
      active: Boolean(this.room),
      mode: this.transport.mode,
      roomCode: this.room?.code ?? null,
      role: this.role,
      opponentConnected,
      connectionStatus: this.connectionStatus,
      errorMessage: this.errorMessage,
    };
  }

  private emitSessionChange(): void {
    this.callbacks.onSessionChange?.(this.getSessionInfo(), this.room);
  }

  private emitError(err: unknown): MultiplayerError {
    const mpError = normalizeError(err);
    this.errorMessage = mpError.message;
    this.connectionStatus = 'error';
    this.emitSessionChange();
    this.callbacks.onError?.(mpError);
    return mpError;
  }

  private attachSubscription(code: string): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }

    this.unsubscribeFn = this.transport.subscribe(
      code,
      (incoming) => {
        this.handleIncomingRoomState(incoming);
      },
      (status, errorMessage) => {
        this.connectionStatus = status;
        this.errorMessage = errorMessage ?? null;
        this.emitSessionChange();
      }
    );
  }

  async createRoom(options?: {
    hostColor?: PlayerColor;
    code?: string;
  }): Promise<{ room: RoomState; role: RoomRole }> {
    this.leaveRoom({ syncUrl: false });
    const epoch = this.sessionEpoch;
    this.connectionStatus = 'connecting';
    this.errorMessage = null;
    this.emitSessionChange();

    try {
      const hostColor = options?.hostColor === 'b' ? 'b' : 'w';
      const created = await this.transport.createRoom({
        code: options?.code ?? generateRoomCode(),
        playerToken: this.playerToken,
        hostColor,
        retryOnCollision: !options?.code,
      });

      if (this.sessionEpoch !== epoch) {
        throw new MultiplayerError(
          'CONFLICT',
          'Room session changed while connecting.'
        );
      }

      const sortedMoves = sortAndDedupeMoves(created.moves);
      this.room = { ...created, moves: sortedMoves };
      this.role = resolveRoleForToken(this.room, this.playerToken);
      this.lastAppliedResetCount = this.room.reset_count;
      this.lastAppliedSeq = getMaxSeq(sortedMoves);
      this.connectionStatus = 'connected';
      this.errorMessage = null;

      if (this.syncUrl) {
        syncRoomCodeToUrl(this.room.code);
      }

      this.attachSubscription(this.room.code);
      this.emitSessionChange();

      return { room: this.room, role: this.role };
    } catch (err) {
      if (this.sessionEpoch !== epoch) {
        throw normalizeError(err);
      }
      throw this.emitError(err);
    }
  }

  async joinRoom(rawCode: string): Promise<{ room: RoomState; role: RoomRole }> {
    const code = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(code)) {
      throw this.emitError(
        new MultiplayerError(
          'INVALID_ROOM_CODE',
          `Invalid room code "${rawCode}". Expected 4 alphanumeric characters.`
        )
      );
    }

    this.leaveRoom({ syncUrl: false });
    const epoch = this.sessionEpoch;
    this.connectionStatus = 'connecting';
    this.errorMessage = null;
    this.emitSessionChange();

    try {
      const joined = await this.transport.joinRoom(code, this.playerToken);
      if (this.sessionEpoch !== epoch) {
        throw new MultiplayerError(
          'CONFLICT',
          'Room session changed while connecting.'
        );
      }

      const sortedMoves = sortAndDedupeMoves(joined.room.moves);

      this.room = { ...joined.room, moves: sortedMoves };
      this.role = joined.role;
      this.lastAppliedResetCount = this.room.reset_count;
      this.lastAppliedSeq = getMaxSeq(sortedMoves);
      this.connectionStatus = 'connected';
      this.errorMessage = null;

      if (this.syncUrl) {
        syncRoomCodeToUrl(this.room.code);
      }

      if (sortedMoves.length > 0 || this.room.reset_count > 0) {
        this.callbacks.onStateSync?.(
          {
            moves: sortedMoves,
            resetCount: this.room.reset_count,
            playerColor: this.role,
          },
          this.room
        );
      }

      this.attachSubscription(this.room.code);
      this.emitSessionChange();

      return { room: this.room, role: this.role };
    } catch (err) {
      if (this.sessionEpoch !== epoch) {
        throw normalizeError(err);
      }
      throw this.emitError(err);
    }
  }

  private isEqualSeqMetadataRegression(
    current: RoomState,
    incoming: RoomState
  ): boolean {
    return (
      (Boolean(current.white_token) && !incoming.white_token) ||
      (Boolean(current.black_token) && !incoming.black_token) ||
      (current.status !== 'waiting' && incoming.status === 'waiting') ||
      (current.status === 'finished' && incoming.status !== 'finished')
    );
  }

  async submitLocalMove(
    input: LocalMoveInput,
    options?: { nextStatus?: RoomStatus }
  ): Promise<RoomState> {
    if (!this.room || !this.role) {
      throw this.emitError(
        new MultiplayerError('ROOM_NOT_FOUND', 'Not connected to any room.')
      );
    }
    if (this.role !== 'w' && this.role !== 'b') {
      throw this.emitError(
        new MultiplayerError('UNAUTHORIZED', 'Spectators cannot make moves.')
      );
    }
    if (input.color !== this.role || this.room.turn !== this.role) {
      throw this.emitError(
        new MultiplayerError(
          'NOT_YOUR_TURN',
          `Cannot submit move for "${input.color}" when your role is "${this.role}" and turn is "${this.room.turn}".`
        )
      );
    }

    const promotion = normalizePromotion(input.promotion);
    const nextTurn: PlayerColor = input.color === 'w' ? 'b' : 'w';
    const prevSeq = this.lastAppliedSeq;
    const prevResetCount = this.lastAppliedResetCount;
    const epoch = this.sessionEpoch;
    const targetCode = this.room.code;
    this.lastAppliedSeq = prevSeq + 1;

    try {
      const updated = await this.transport.submitMove({
        code: targetCode,
        playerToken: this.playerToken,
        move: {
          color: input.color,
          from: { r: input.fromR, c: input.fromC },
          to: { r: input.toR, c: input.toC },
          ...(promotion !== undefined ? { promotion } : {}),
          ...(input.uci !== undefined ? { uci: input.uci } : {}),
          ...(input.san !== undefined ? { san: input.san } : {}),
          ...(input.tc !== undefined ? { tc: input.tc } : {}),
          ...(input.wMs !== undefined ? { wMs: input.wMs } : {}),
          ...(input.bMs !== undefined ? { bMs: input.bMs } : {}),
          fen: input.fen,
        },
        nextFen: input.fen,
        nextTurn,
        nextStatus: options?.nextStatus,
      });

      const sortedMoves = sortAndDedupeMoves(updated.moves);
      if (
        this.sessionEpoch !== epoch ||
        !this.room ||
        this.room.code !== targetCode
      ) {
        return { ...updated, moves: sortedMoves };
      }

      const updatedMaxSeq = getMaxSeq(sortedMoves);
      if (updated.reset_count > this.lastAppliedResetCount) {
        this.room = { ...updated, moves: sortedMoves };
        this.role = resolveRoleForToken(this.room, this.playerToken);
        this.lastAppliedResetCount = this.room.reset_count;
        this.lastAppliedSeq = updatedMaxSeq;
      } else if (updated.reset_count === this.lastAppliedResetCount) {
        const currentMaxSeq = getMaxSeq(this.room.moves);
        if (
          updatedMaxSeq > currentMaxSeq ||
          (updatedMaxSeq === currentMaxSeq &&
            !this.isEqualSeqMetadataRegression(this.room, updated))
        ) {
          this.room = { ...updated, moves: sortedMoves };
          this.role = resolveRoleForToken(this.room, this.playerToken);
        }
        this.lastAppliedSeq = Math.max(this.lastAppliedSeq, updatedMaxSeq);
      }
      this.errorMessage = null;
      this.emitSessionChange();
      return this.room ?? { ...updated, moves: sortedMoves };
    } catch (err) {
      if (
        this.sessionEpoch !== epoch ||
        !this.room ||
        this.room.code !== targetCode
      ) {
        throw normalizeError(err);
      }
      if (
        this.lastAppliedResetCount === prevResetCount &&
        this.lastAppliedSeq === prevSeq + 1
      ) {
        this.lastAppliedSeq = Math.max(
          prevSeq,
          getMaxSeq(this.room?.moves ?? [])
        );
      }
      const mpError = this.emitError(err);
      if (mpError.code === 'CONFLICT') {
        void this.refreshRoom().catch(() => {});
      }
      throw mpError;
    }
  }

  async requestReset(): Promise<RoomState> {
    if (!this.room || !this.role) {
      throw this.emitError(
        new MultiplayerError('ROOM_NOT_FOUND', 'Not connected to any room.')
      );
    }
    if (this.role !== 'w' && this.role !== 'b') {
      throw this.emitError(
        new MultiplayerError(
          'UNAUTHORIZED',
          'Only seated players can reset the room.'
        )
      );
    }

    const epoch = this.sessionEpoch;
    const targetCode = this.room.code;

    try {
      const updated = await this.transport.resetRoom(
        targetCode,
        this.playerToken
      );
      const sortedMoves = sortAndDedupeMoves(updated.moves);
      if (
        this.sessionEpoch !== epoch ||
        !this.room ||
        this.room.code !== targetCode
      ) {
        return { ...updated, moves: sortedMoves };
      }

      const currentMaxSeq = getMaxSeq(this.room.moves);
      const updatedMaxSeq = getMaxSeq(sortedMoves);
      if (
        updated.reset_count > this.lastAppliedResetCount ||
        (updated.reset_count === this.lastAppliedResetCount &&
          (updatedMaxSeq > currentMaxSeq ||
            (updatedMaxSeq === currentMaxSeq &&
              !this.isEqualSeqMetadataRegression(this.room, updated))))
      ) {
        this.room = { ...updated, moves: sortedMoves };
        this.role = resolveRoleForToken(this.room, this.playerToken);
        this.lastAppliedResetCount = this.room.reset_count;
        this.lastAppliedSeq = updatedMaxSeq;
      }
      this.errorMessage = null;
      this.emitSessionChange();
      return this.room ?? { ...updated, moves: sortedMoves };
    } catch (err) {
      if (
        this.sessionEpoch !== epoch ||
        !this.room ||
        this.room.code !== targetCode
      ) {
        throw normalizeError(err);
      }
      throw this.emitError(err);
    }
  }

  async refreshRoom(): Promise<RoomState | null> {
    if (!this.room) {
      return null;
    }
    const epoch = this.sessionEpoch;
    const targetCode = this.room.code;
    const fetched = await this.transport.getRoom(targetCode);
    if (
      this.sessionEpoch !== epoch ||
      !this.room ||
      this.room.code !== targetCode
    ) {
      return this.room;
    }
    if (fetched) {
      this.handleIncomingRoomState(fetched);
    }
    return this.room;
  }

  private handleIncomingRoomState(incoming: RoomState): void {
    if (!this.room || incoming.code !== this.room.code) {
      return;
    }

    if (incoming.reset_count < this.lastAppliedResetCount) {
      return;
    }

    const sortedMoves = sortAndDedupeMoves(incoming.moves);
    const nextRole = resolveRoleForToken(incoming, this.playerToken);

    if (incoming.reset_count > this.lastAppliedResetCount) {
      this.role = nextRole;
      this.lastAppliedResetCount = incoming.reset_count;
      this.lastAppliedSeq = getMaxSeq(sortedMoves);
      this.room = { ...incoming, moves: sortedMoves };
      this.callbacks.onStateSync?.(
        {
          moves: sortedMoves,
          resetCount: incoming.reset_count,
          playerColor: nextRole,
        },
        this.room
      );
      this.emitSessionChange();
      return;
    }

    const currentMaxSeq = getMaxSeq(this.room.moves);
    const incomingMaxSeq = getMaxSeq(sortedMoves);
    if (incomingMaxSeq < currentMaxSeq) {
      return;
    }
    if (
      incomingMaxSeq === currentMaxSeq &&
      this.isEqualSeqMetadataRegression(this.room, incoming)
    ) {
      return;
    }

    this.role = nextRole;
    const newMoves = sortedMoves.filter((m) => m.seq > this.lastAppliedSeq);
    this.room = { ...incoming, moves: sortedMoves };

    if (newMoves.length === 0) {
      this.emitSessionChange();
      return;
    }

    if (newMoves.length === 1 && newMoves[0].seq === this.lastAppliedSeq + 1) {
      const move = newMoves[0];
      const promotion = normalizePromotion(move.promotion);
      this.lastAppliedSeq = move.seq;
      this.callbacks.onRemoteMove?.(
        {
          fromR: move.from.r,
          fromC: move.from.c,
          toR: move.to.r,
          toC: move.to.c,
          ...(promotion !== undefined ? { promotion } : {}),
        },
        this.room
      );
      this.emitSessionChange();
      return;
    }

    this.lastAppliedSeq = getMaxSeq(sortedMoves);
    this.callbacks.onStateSync?.(
      {
        moves: sortedMoves,
        resetCount: incoming.reset_count,
        playerColor: nextRole,
      },
      this.room
    );
    this.emitSessionChange();
  }

  leaveRoom(options?: { syncUrl?: boolean }): void {
    this.sessionEpoch += 1;
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }

    const shouldSyncUrl = options?.syncUrl ?? this.syncUrl;
    if (shouldSyncUrl) {
      syncRoomCodeToUrl(null);
    }

    const hadSession = Boolean(this.room) || this.connectionStatus !== 'idle';
    this.room = null;
    this.role = null;
    this.lastAppliedSeq = 0;
    this.lastAppliedResetCount = 0;
    this.connectionStatus = 'idle';
    this.errorMessage = null;

    if (hadSession) {
      this.emitSessionChange();
    }
  }

  dispose(): void {
    this.leaveRoom({ syncUrl: false });
    this.transport.dispose?.();
  }
}
