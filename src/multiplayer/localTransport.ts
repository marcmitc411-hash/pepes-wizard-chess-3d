import {
  MultiplayerError,
  type BroadcastChannelLike,
  type ConnectionStatus,
  type CreateRoomInput,
  type JoinRoomResult,
  type MultiplayerTransport,
  type RoomMove,
  type RoomPromotion,
  type RoomRole,
  type RoomState,
  type StorageLike,
  type SubmitMoveInput,
} from './types.ts';

export const LOCAL_CHANNEL_NAME = 'wizard_chess_mp_channel';
export const LOCAL_ROOM_STORAGE_PREFIX = 'wizard_chess_room_';

const INITIAL_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const processFallbackMap = new Map<string, string>();
const processFallbackStorage: StorageLike = {
  getItem(key: string): string | null {
    return processFallbackMap.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    processFallbackMap.set(key, value);
  },
  removeItem(key: string): void {
    processFallbackMap.delete(key);
  },
};

export function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}

export function getLocalRoomStorageKey(code: string): string {
  return `${LOCAL_ROOM_STORAGE_PREFIX}${normalizeCode(code)}`;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function assertValidCode(raw: string): string {
  const code = normalizeCode(raw);
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    throw new MultiplayerError(
      'INVALID_ROOM_CODE',
      `Invalid room code "${raw}". Expected 4 alphanumeric characters.`
    );
  }
  return code;
}

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code +=
      ROOM_CODE_ALPHABET[
        Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
      ];
  }
  return code;
}

function createInstanceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveDefaultStorage(): StorageLike {
  if (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  ) {
    return window.localStorage;
  }
  return processFallbackStorage;
}

function createNoopChannel(): BroadcastChannelLike {
  return {
    onmessage: null,
    postMessage(): void {},
    close(): void {},
  };
}

function resolveDefaultChannelFactory(): (name: string) => BroadcastChannelLike {
  if (typeof BroadcastChannel === 'function') {
    return (name: string) =>
      new BroadcastChannel(name) as unknown as BroadcastChannelLike;
  }
  return createNoopChannel;
}

function cloneMove(move: RoomMove): RoomMove {
  const copy: RoomMove = {
    seq: move.seq,
    color: move.color,
    from: { r: move.from.r, c: move.from.c },
    to: { r: move.to.r, c: move.to.c },
    ts: move.ts,
  };
  if (move.promotion !== undefined) {
    copy.promotion = move.promotion;
  }
  if (move.uci !== undefined) {
    copy.uci = move.uci;
  }
  if (move.san !== undefined) {
    copy.san = move.san;
  }
  if (move.fen !== undefined) {
    copy.fen = move.fen;
  }
  return copy;
}

function cloneRoom(room: RoomState): RoomState {
  return {
    code: room.code,
    status: room.status,
    white_token: room.white_token,
    black_token: room.black_token,
    turn: room.turn,
    fen: room.fen,
    moves: room.moves.map(cloneMove),
    reset_count: room.reset_count,
    ...(room.created_at !== undefined ? { created_at: room.created_at } : {}),
    ...(room.updated_at !== undefined ? { updated_at: room.updated_at } : {}),
  };
}

function normalizeStoredRoom(raw: unknown): RoomState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.code !== 'string' || !/^[A-Z0-9]{4}$/.test(obj.code)) {
    return null;
  }
  const rawMoves = Array.isArray(obj.moves) ? obj.moves : [];
  const moves: RoomMove[] = rawMoves
    .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
    .map((m, idx) => {
      const fromObj = (m.from ?? {}) as Record<string, unknown>;
      const toObj = (m.to ?? {}) as Record<string, unknown>;
      const move: RoomMove = {
        seq: typeof m.seq === 'number' ? m.seq : idx + 1,
        color: m.color === 'b' ? 'b' : 'w',
        from: {
          r: typeof fromObj.r === 'number' ? fromObj.r : 0,
          c: typeof fromObj.c === 'number' ? fromObj.c : 0,
        },
        to: {
          r: typeof toObj.r === 'number' ? toObj.r : 0,
          c: typeof toObj.c === 'number' ? toObj.c : 0,
        },
        ts: typeof m.ts === 'number' ? m.ts : Date.now(),
      };
      if (typeof m.promotion === 'string') {
        move.promotion = m.promotion as RoomPromotion;
      }
      if (typeof m.uci === 'string') {
        move.uci = m.uci;
      }
      if (typeof m.san === 'string') {
        move.san = m.san;
      }
      if (typeof m.fen === 'string') {
        move.fen = m.fen;
      }
      return move;
    });

  return {
    code: obj.code,
    status:
      obj.status === 'playing' || obj.status === 'finished'
        ? obj.status
        : 'waiting',
    white_token: typeof obj.white_token === 'string' ? obj.white_token : null,
    black_token: typeof obj.black_token === 'string' ? obj.black_token : null,
    turn: obj.turn === 'b' ? 'b' : 'w',
    fen: typeof obj.fen === 'string' && obj.fen ? obj.fen : INITIAL_FEN,
    moves,
    reset_count:
      typeof obj.reset_count === 'number' && obj.reset_count >= 0
        ? obj.reset_count
        : 0,
    ...(typeof obj.created_at === 'string'
      ? { created_at: obj.created_at }
      : {}),
    ...(typeof obj.updated_at === 'string'
      ? { updated_at: obj.updated_at }
      : {}),
  };
}

function isSameMoveContent(
  a: RoomMove,
  b: Omit<RoomMove, 'seq' | 'ts'>
): boolean {
  return (
    a.color === b.color &&
    a.from.r === b.from.r &&
    a.from.c === b.from.c &&
    a.to.r === b.to.r &&
    a.to.c === b.to.c &&
    (a.promotion ?? undefined) === (b.promotion ?? undefined)
  );
}

export interface LocalTransportOptions {
  storage?: StorageLike;
  createChannel?: (name: string) => BroadcastChannelLike;
  instanceId?: string;
  initialFen?: string;
}

export class LocalTransport implements MultiplayerTransport {
  readonly mode = 'local' as const;

  private readonly storage: StorageLike;
  private readonly createChannel: (name: string) => BroadcastChannelLike;
  private readonly instanceId: string;
  private readonly initialFen: string;
  private readonly activeCleanups = new Set<() => void>();

  constructor(options?: LocalTransportOptions) {
    this.storage = options?.storage ?? resolveDefaultStorage();
    this.createChannel =
      options?.createChannel ?? resolveDefaultChannelFactory();
    this.instanceId = options?.instanceId ?? createInstanceId();
    this.initialFen = options?.initialFen ?? INITIAL_FEN;
  }

  private readRoom(code: string): RoomState | null {
    const raw = this.storage.getItem(getLocalRoomStorageKey(code));
    if (!raw) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return normalizeStoredRoom(parsed);
    } catch {
      return null;
    }
  }

  private writeAndBroadcast(room: RoomState): RoomState {
    const persisted = cloneRoom(room);
    this.storage.setItem(
      getLocalRoomStorageKey(persisted.code),
      JSON.stringify(persisted)
    );
    const channel = this.createChannel(LOCAL_CHANNEL_NAME);
    try {
      channel.postMessage({
        type: 'room_state',
        room: persisted,
        senderId: this.instanceId,
      });
    } finally {
      channel.close();
    }
    return cloneRoom(persisted);
  }

  async createRoom(input: CreateRoomInput): Promise<RoomState> {
    if (!input.playerToken) {
      throw new MultiplayerError(
        'UNAUTHORIZED',
        'A valid playerToken is required to create a room.'
      );
    }

    const hostColor = input.hostColor === 'b' ? 'b' : 'w';
    const allowRetry = !input.code || input.retryOnCollision === true;
    const maxAttempts = allowRetry ? 5 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate =
        input.code && attempt === 0
          ? assertValidCode(input.code)
          : generateCode();

      const existing = this.readRoom(candidate);
      if (existing) {
        if (!allowRetry || attempt === maxAttempts - 1) {
          throw new MultiplayerError(
            'ROOM_ALREADY_EXISTS',
            `Room "${candidate}" already exists.`
          );
        }
        continue;
      }

      const now = new Date().toISOString();
      const room: RoomState = {
        code: candidate,
        status: 'waiting',
        white_token: hostColor === 'w' ? input.playerToken : null,
        black_token: hostColor === 'b' ? input.playerToken : null,
        turn: 'w',
        fen: this.initialFen,
        moves: [],
        reset_count: 0,
        created_at: now,
        updated_at: now,
      };
      return this.writeAndBroadcast(room);
    }

    throw new MultiplayerError(
      'ROOM_ALREADY_EXISTS',
      'Unable to allocate a unique local room code.'
    );
  }

  async getRoom(code: string): Promise<RoomState | null> {
    const normalized = assertValidCode(code);
    const room = this.readRoom(normalized);
    return room ? cloneRoom(room) : null;
  }

  async joinRoom(code: string, playerToken: string): Promise<JoinRoomResult> {
    if (!playerToken) {
      throw new MultiplayerError(
        'UNAUTHORIZED',
        'A valid playerToken is required to join a room.'
      );
    }
    const normalized = assertValidCode(code);
    const room = this.readRoom(normalized);
    if (!room) {
      throw new MultiplayerError(
        'ROOM_NOT_FOUND',
        `Room "${normalized}" was not found.`
      );
    }

    if (room.white_token === playerToken) {
      return { room: cloneRoom(room), role: 'w' };
    }
    if (room.black_token === playerToken) {
      return { room: cloneRoom(room), role: 'b' };
    }

    let role: RoomRole = 'spectator';
    const updated = cloneRoom(room);

    if (!updated.white_token) {
      updated.white_token = playerToken;
      role = 'w';
    } else if (!updated.black_token) {
      updated.black_token = playerToken;
      role = 'b';
    }

    if (role !== 'spectator') {
      updated.status =
        updated.white_token && updated.black_token ? 'playing' : 'waiting';
      updated.updated_at = new Date().toISOString();
      return {
        room: this.writeAndBroadcast(updated),
        role,
      };
    }

    return { room: updated, role: 'spectator' };
  }

  async submitMove(input: SubmitMoveInput): Promise<RoomState> {
    const normalized = assertValidCode(input.code);
    const room = this.readRoom(normalized);
    if (!room) {
      throw new MultiplayerError(
        'ROOM_NOT_FOUND',
        `Room "${normalized}" was not found.`
      );
    }

    const expectedToken =
      input.move.color === 'w' ? room.white_token : room.black_token;
    if (!input.playerToken || expectedToken !== input.playerToken) {
      throw new MultiplayerError(
        'UNAUTHORIZED',
        'Player token does not match the seat for this move color.'
      );
    }

    const lastMove =
      room.moves.length > 0 ? room.moves[room.moves.length - 1] : null;
    if (
      lastMove &&
      isSameMoveContent(lastMove, input.move) &&
      room.fen === input.nextFen
    ) {
      return cloneRoom(room);
    }

    if (room.turn !== input.move.color) {
      throw new MultiplayerError(
        'NOT_YOUR_TURN',
        `Cannot submit move for "${input.move.color}" when turn is "${room.turn}".`
      );
    }

    const maxSeq = room.moves.reduce(
      (highest, m) => (m.seq > highest ? m.seq : highest),
      0
    );
    const nextSeq = maxSeq + 1;

    const committedMove: RoomMove = {
      seq: nextSeq,
      color: input.move.color,
      from: { r: input.move.from.r, c: input.move.from.c },
      to: { r: input.move.to.r, c: input.move.to.c },
      ...(input.move.promotion !== undefined
        ? { promotion: input.move.promotion }
        : {}),
      ...(input.move.uci !== undefined ? { uci: input.move.uci } : {}),
      ...(input.move.san !== undefined ? { san: input.move.san } : {}),
      fen: input.move.fen ?? input.nextFen,
      ts: input.move.ts ?? Date.now(),
    };

    const updated: RoomState = {
      ...cloneRoom(room),
      moves: [...room.moves.map(cloneMove), committedMove],
      turn: input.nextTurn,
      fen: input.nextFen,
      status:
        input.nextStatus ??
        (room.white_token && room.black_token ? 'playing' : room.status),
      updated_at: new Date().toISOString(),
    };

    return this.writeAndBroadcast(updated);
  }

  async resetRoom(code: string, playerToken: string): Promise<RoomState> {
    const normalized = assertValidCode(code);
    const room = this.readRoom(normalized);
    if (!room) {
      throw new MultiplayerError(
        'ROOM_NOT_FOUND',
        `Room "${normalized}" was not found.`
      );
    }

    const isPlayer =
      Boolean(playerToken) &&
      (room.white_token === playerToken || room.black_token === playerToken);
    if (!isPlayer) {
      throw new MultiplayerError(
        'UNAUTHORIZED',
        'Only seated players can reset the room.'
      );
    }

    const updated: RoomState = {
      ...cloneRoom(room),
      moves: [],
      turn: 'w',
      fen: this.initialFen,
      reset_count: room.reset_count + 1,
      status: room.white_token && room.black_token ? 'playing' : 'waiting',
      updated_at: new Date().toISOString(),
    };

    return this.writeAndBroadcast(updated);
  }

  subscribe(
    code: string,
    onRoomUpdate: (room: RoomState) => void,
    onStatusChange?: (
      status: ConnectionStatus,
      errorMessage?: string | null
    ) => void
  ): () => void {
    const normalized = assertValidCode(code);
    const storageKey = getLocalRoomStorageKey(normalized);
    const channel = this.createChannel(LOCAL_CHANNEL_NAME);
    let closed = false;

    channel.onmessage = (event: { data: unknown }) => {
      if (closed || !event || typeof event.data !== 'object' || !event.data) {
        return;
      }
      const payload = event.data as {
        type?: unknown;
        senderId?: unknown;
        room?: unknown;
      };
      if (
        payload.type !== 'room_state' ||
        payload.senderId === this.instanceId
      ) {
        return;
      }
      const parsed = normalizeStoredRoom(payload.room);
      if (parsed && parsed.code === normalized) {
        onRoomUpdate(parsed);
      }
    };

    let storageListener: ((event: StorageEvent) => void) | null = null;
    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      storageListener = (event: StorageEvent) => {
        if (closed || event.key !== storageKey || !event.newValue) {
          return;
        }
        try {
          const parsed = normalizeStoredRoom(JSON.parse(event.newValue));
          if (parsed && parsed.code === normalized) {
            onRoomUpdate(parsed);
          }
        } catch {
          // Ignore malformed storage payload
        }
      };
      window.addEventListener('storage', storageListener);
    }

    onStatusChange?.('connected', null);

    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      this.activeCleanups.delete(cleanup);
      channel.onmessage = null;
      channel.close();
      if (
        storageListener &&
        typeof window !== 'undefined' &&
        typeof window.removeEventListener === 'function'
      ) {
        window.removeEventListener('storage', storageListener);
      }
    };

    this.activeCleanups.add(cleanup);
    return cleanup;
  }

  dispose(): void {
    for (const cleanup of Array.from(this.activeCleanups)) {
      cleanup();
    }
    this.activeCleanups.clear();
  }
}
