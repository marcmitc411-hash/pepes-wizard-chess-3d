import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseClient } from './supabaseClient.ts';
import {
  MultiplayerError,
  type ConnectionStatus,
  type CreateRoomInput,
  type JoinRoomResult,
  type MultiplayerErrorCode,
  type MultiplayerTransport,
  type RoomMove,
  type RoomPromotion,
  type RoomRole,
  type RoomState,
  type SubmitMoveInput,
} from './types.ts';

const INITIAL_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface PostgrestErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

export interface QueryResultLike<T = unknown> {
  data: T | null;
  error: PostgrestErrorLike | null;
  status?: number;
}

export interface QueryFilterBuilderLike<T = unknown>
  extends PromiseLike<QueryResultLike<T>> {
  eq(column: string, value: unknown): QueryFilterBuilderLike<T>;
  is(column: string, value: null): QueryFilterBuilderLike<T>;
  select(columns?: string): QueryFilterBuilderLike<T>;
  single(): PromiseLike<QueryResultLike<T>>;
  maybeSingle(): PromiseLike<QueryResultLike<T>>;
}

export interface TableQueryBuilderLike {
  select(columns?: string): QueryFilterBuilderLike;
  insert(values: Record<string, unknown>): QueryFilterBuilderLike;
  update(values: Record<string, unknown>): QueryFilterBuilderLike;
}

export interface RealtimeChannelLike {
  on(
    type: string,
    filter: Record<string, unknown>,
    callback: (payload: Record<string, unknown>) => void
  ): RealtimeChannelLike;
  subscribe(
    callback?: (status: string, err?: Error) => void
  ): RealtimeChannelLike;
  send(args: {
    type: string;
    event: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface SupabaseClientLike {
  from(relation: string): TableQueryBuilderLike;
  channel(
    name: string,
    opts?: Record<string, unknown>
  ): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): Promise<unknown>;
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

function normalizeRoomRow(raw: unknown): RoomState | null {
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

export function mapSupabaseError(
  error: unknown,
  status?: number,
  fallbackCode: MultiplayerErrorCode = 'UNKNOWN'
): MultiplayerError {
  if (error instanceof MultiplayerError) {
    return error;
  }

  const errObj =
    error && typeof error === 'object'
      ? (error as PostgrestErrorLike & { name?: string })
      : {};
  const code = typeof errObj.code === 'string' ? errObj.code : '';
  const message =
    typeof errObj.message === 'string'
      ? errObj.message
      : typeof error === 'string'
        ? error
        : 'Unexpected Supabase error.';
  const httpStatus = status ?? errObj.status;

  if (
    code === 'PGRST205' ||
    code === '42P01' ||
    (httpStatus === 404 &&
      /rooms|schema cache|relation.*does not exist/i.test(message))
  ) {
    return new MultiplayerError(
      'TABLE_NOT_DEPLOYED',
      'Supabase table "public.rooms" is not deployed yet. Execute supabase/schema.sql in the Supabase SQL Editor.',
      error
    );
  }

  if (code === '42501') {
    return new MultiplayerError(
      'UNAUTHORIZED',
      'Permission denied for table "public.rooms". Ensure GRANT SELECT, INSERT, UPDATE ON TABLE public.rooms TO anon, authenticated and RLS policies from supabase/schema.sql have been executed.',
      error
    );
  }

  if (code === '23505') {
    return new MultiplayerError(
      'ROOM_ALREADY_EXISTS',
      'Room code already exists.',
      error
    );
  }

  if (code === 'PGRST116') {
    return new MultiplayerError('ROOM_NOT_FOUND', 'Room was not found.', error);
  }

  if (
    error instanceof TypeError ||
    /fetch failed|network|timeout|enotfound|econnrefused/i.test(message)
  ) {
    return new MultiplayerError('NETWORK_ERROR', message, error);
  }

  return new MultiplayerError(fallbackCode, message, error);
}

export interface SupabaseTransportOptions {
  initialFen?: string;
}

export class SupabaseTransport implements MultiplayerTransport {
  readonly mode = 'supabase' as const;

  private readonly providedClient: SupabaseClientLike | null | undefined;
  private readonly initialFen: string;
  private readonly activeChannels = new Map<
    string,
    { channel: RealtimeChannelLike; cleanup: () => void }
  >();

  constructor(
    client?: SupabaseClientLike | SupabaseClient | null,
    options?: SupabaseTransportOptions
  ) {
    this.providedClient = client as SupabaseClientLike | null | undefined;
    this.initialFen = options?.initialFen ?? INITIAL_FEN;
  }

  private requireClient(): SupabaseClientLike {
    const client =
      this.providedClient !== undefined
        ? this.providedClient
        : (getSupabaseClient() as unknown as SupabaseClientLike | null);

    if (!client) {
      throw new MultiplayerError(
        'NOT_CONFIGURED',
        'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
    }
    return client;
  }

  private async broadcastRoomState(room: RoomState): Promise<void> {
    const entry = this.activeChannels.get(room.code);
    if (!entry) {
      return;
    }
    try {
      await entry.channel.send({
        type: 'broadcast',
        event: 'room_state',
        payload: { room },
      });
    } catch {
      // Non-fatal: postgres_changes still delivers persisted updates.
    }
  }

  async createRoom(input: CreateRoomInput): Promise<RoomState> {
    if (!input.playerToken) {
      throw new MultiplayerError(
        'UNAUTHORIZED',
        'A valid playerToken is required to create a room.'
      );
    }

    const client = this.requireClient();
    const hostColor = input.hostColor === 'b' ? 'b' : 'w';
    const allowRetry = !input.code || input.retryOnCollision === true;
    const maxAttempts = allowRetry ? 5 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate =
        input.code && attempt === 0
          ? assertValidCode(input.code)
          : generateCode();

      let result: QueryResultLike;
      try {
        result = await client
          .from('rooms')
          .insert({
            code: candidate,
            status: 'waiting',
            white_token: hostColor === 'w' ? input.playerToken : null,
            black_token: hostColor === 'b' ? input.playerToken : null,
            turn: 'w',
            fen: this.initialFen,
            moves: [],
            reset_count: 0,
          })
          .select('*')
          .single();
      } catch (err) {
        throw mapSupabaseError(err, undefined, 'NETWORK_ERROR');
      }

      if (result.error) {
        const mapped = mapSupabaseError(result.error, result.status);
        if (
          mapped.code === 'ROOM_ALREADY_EXISTS' &&
          allowRetry &&
          attempt < maxAttempts - 1
        ) {
          continue;
        }
        throw mapped;
      }

      const normalized = normalizeRoomRow(result.data);
      if (!normalized) {
        throw new MultiplayerError(
          'UNKNOWN',
          'Supabase returned an invalid room row on createRoom.'
        );
      }
      return normalized;
    }

    throw new MultiplayerError(
      'ROOM_ALREADY_EXISTS',
      'Unable to allocate a unique room code after retries.'
    );
  }

  async getRoom(code: string): Promise<RoomState | null> {
    const normalizedCode = assertValidCode(code);
    const client = this.requireClient();

    let result: QueryResultLike;
    try {
      result = await client
        .from('rooms')
        .select('*')
        .eq('code', normalizedCode)
        .maybeSingle();
    } catch (err) {
      throw mapSupabaseError(err, undefined, 'NETWORK_ERROR');
    }

    if (result.error) {
      throw mapSupabaseError(result.error, result.status);
    }

    if (!result.data) {
      return null;
    }

    return normalizeRoomRow(result.data);
  }

  async joinRoom(code: string, playerToken: string): Promise<JoinRoomResult> {
    if (!playerToken) {
      throw new MultiplayerError(
        'UNAUTHORIZED',
        'A valid playerToken is required to join a room.'
      );
    }

    const normalizedCode = assertValidCode(code);
    const client = this.requireClient();

    let current = await this.getRoom(normalizedCode);
    if (!current) {
      throw new MultiplayerError(
        'ROOM_NOT_FOUND',
        `Room "${normalizedCode}" was not found.`
      );
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      if (current.white_token === playerToken) {
        return { room: current, role: 'w' };
      }
      if (current.black_token === playerToken) {
        return { room: current, role: 'b' };
      }

      if (!current.white_token) {
        let claimResult: QueryResultLike;
        try {
          claimResult = await client
            .from('rooms')
            .update({
              white_token: playerToken,
              status: current.black_token ? 'playing' : 'waiting',
            })
            .eq('code', normalizedCode)
            .is('white_token', null)
            .select('*')
            .maybeSingle();
        } catch (err) {
          throw mapSupabaseError(err, undefined, 'NETWORK_ERROR');
        }

        if (claimResult.error) {
          throw mapSupabaseError(claimResult.error, claimResult.status);
        }

        const claimed = normalizeRoomRow(claimResult.data);
        if (claimed) {
          await this.broadcastRoomState(claimed);
          return { room: claimed, role: 'w' };
        }
      } else if (!current.black_token) {
        let claimResult: QueryResultLike;
        try {
          claimResult = await client
            .from('rooms')
            .update({
              black_token: playerToken,
              status: current.white_token ? 'playing' : 'waiting',
            })
            .eq('code', normalizedCode)
            .is('black_token', null)
            .select('*')
            .maybeSingle();
        } catch (err) {
          throw mapSupabaseError(err, undefined, 'NETWORK_ERROR');
        }

        if (claimResult.error) {
          throw mapSupabaseError(claimResult.error, claimResult.status);
        }

        const claimed = normalizeRoomRow(claimResult.data);
        if (claimed) {
          await this.broadcastRoomState(claimed);
          return { room: claimed, role: 'b' };
        }
      } else {
        const role: RoomRole = 'spectator';
        return { room: current, role };
      }

      const refetched = await this.getRoom(normalizedCode);
      if (!refetched) {
        throw new MultiplayerError(
          'ROOM_NOT_FOUND',
          `Room "${normalizedCode}" was not found.`
        );
      }
      current = refetched;
    }

    if (current.white_token === playerToken) {
      return { room: current, role: 'w' };
    }
    if (current.black_token === playerToken) {
      return { room: current, role: 'b' };
    }
    return { room: current, role: 'spectator' };
  }

  async submitMove(input: SubmitMoveInput): Promise<RoomState> {
    const normalizedCode = assertValidCode(input.code);
    const client = this.requireClient();

    const room = await this.getRoom(normalizedCode);
    if (!room) {
      throw new MultiplayerError(
        'ROOM_NOT_FOUND',
        `Room "${normalizedCode}" was not found.`
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
      return room;
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

    const nextMoves = [...room.moves, committedMove];
    const nextStatus =
      input.nextStatus ??
      (room.white_token && room.black_token ? 'playing' : room.status);

    let result: QueryResultLike;
    try {
      result = await client
        .from('rooms')
        .update({
          moves: nextMoves,
          turn: input.nextTurn,
          fen: input.nextFen,
          status: nextStatus,
        })
        .eq('code', normalizedCode)
        .eq('reset_count', room.reset_count)
        .eq('turn', room.turn)
        .eq('fen', room.fen)
        .select('*')
        .maybeSingle();
    } catch (err) {
      throw mapSupabaseError(err, undefined, 'NETWORK_ERROR');
    }

    if (result.error) {
      throw mapSupabaseError(result.error, result.status);
    }

    const committed = normalizeRoomRow(result.data);
    if (!committed) {
      const latest = await this.getRoom(normalizedCode);
      const latestLast =
        latest && latest.moves.length > 0
          ? latest.moves[latest.moves.length - 1]
          : null;
      if (
        latest &&
        latestLast &&
        isSameMoveContent(latestLast, input.move) &&
        latest.fen === input.nextFen
      ) {
        return latest;
      }
      throw new MultiplayerError(
        'CONFLICT',
        'Room state changed concurrently before move could be persisted.'
      );
    }

    await this.broadcastRoomState(committed);
    return committed;
  }

  async resetRoom(code: string, playerToken: string): Promise<RoomState> {
    const normalizedCode = assertValidCode(code);
    const client = this.requireClient();

    const room = await this.getRoom(normalizedCode);
    if (!room) {
      throw new MultiplayerError(
        'ROOM_NOT_FOUND',
        `Room "${normalizedCode}" was not found.`
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

    let result: QueryResultLike;
    try {
      result = await client
        .from('rooms')
        .update({
          moves: [],
          turn: 'w',
          fen: this.initialFen,
          reset_count: room.reset_count + 1,
          status:
            room.white_token && room.black_token ? 'playing' : 'waiting',
        })
        .eq('code', normalizedCode)
        .eq('reset_count', room.reset_count)
        .select('*')
        .maybeSingle();
    } catch (err) {
      throw mapSupabaseError(err, undefined, 'NETWORK_ERROR');
    }

    if (result.error) {
      throw mapSupabaseError(result.error, result.status);
    }

    const committed = normalizeRoomRow(result.data);
    if (!committed) {
      throw new MultiplayerError(
        'CONFLICT',
        'Room reset conflicted with a concurrent update.'
      );
    }

    await this.broadcastRoomState(committed);
    return committed;
  }

  subscribe(
    code: string,
    onRoomUpdate: (room: RoomState) => void,
    onStatusChange?: (
      status: ConnectionStatus,
      errorMessage?: string | null
    ) => void
  ): () => void {
    const normalizedCode = assertValidCode(code);
    const client = this.requireClient();

    const existing = this.activeChannels.get(normalizedCode);
    if (existing) {
      existing.cleanup();
    }

    let closed = false;
    onStatusChange?.('connecting', null);

    const channel = client.channel(`room:${normalizedCode}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `code=eq.${normalizedCode}`,
        },
        (payload: Record<string, unknown>) => {
          if (closed) {
            return;
          }
          const rawRow = payload.new ?? payload.record;
          const normalized = normalizeRoomRow(rawRow);
          if (normalized && normalized.code === normalizedCode) {
            onRoomUpdate(normalized);
          }
        }
      )
      .on(
        'broadcast',
        { event: 'room_state' },
        (payload: Record<string, unknown>) => {
          if (closed) {
            return;
          }
          const inner =
            payload.payload && typeof payload.payload === 'object'
              ? (payload.payload as Record<string, unknown>)
              : payload;
          const normalized = normalizeRoomRow(inner.room ?? inner);
          if (normalized && normalized.code === normalizedCode) {
            onRoomUpdate(normalized);
          }
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (closed) {
          return;
        }
        if (status === 'SUBSCRIBED') {
          onStatusChange?.('connected', null);
          void this.getRoom(normalizedCode)
            .then((fresh) => {
              if (!closed && fresh) {
                onRoomUpdate(fresh);
              }
            })
            .catch(() => {
              // Ignore transient catch-up error
            });
        } else if (status === 'CHANNEL_ERROR') {
          onStatusChange?.(
            'error',
            err?.message ?? 'Supabase Realtime channel error.'
          );
        } else if (status === 'TIMED_OUT') {
          onStatusChange?.(
            'reconnecting',
            'Supabase Realtime connection timed out.'
          );
        } else if (status === 'CLOSED') {
          onStatusChange?.('idle', null);
        }
      });

    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      const currentEntry = this.activeChannels.get(normalizedCode);
      if (currentEntry && currentEntry.channel === channel) {
        this.activeChannels.delete(normalizedCode);
      }
      void client.removeChannel(channel);
    };

    this.activeChannels.set(normalizedCode, { channel, cleanup });
    return cleanup;
  }

  dispose(): void {
    for (const entry of Array.from(this.activeChannels.values())) {
      entry.cleanup();
    }
    this.activeChannels.clear();
  }
}
