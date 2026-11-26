import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRANSLATIONS, translate } from '../src/i18n/translations.ts';
import {
  buildInviteUrl,
  createMemoryStorage,
  generateRoomCode,
  getOrCreatePlayerToken,
  getSupabaseClient,
  INITIAL_CHESS_FEN,
  isSupabaseConfigured,
  LocalTransport,
  MultiplayerError,
  normalizePromotion,
  parseRoomCodeFromUrl,
  PLAYER_TOKEN_STORAGE_KEY,
  resetSupabaseClientCache,
  ROOM_CODE_ALPHABET,
  RoomManager,
  SupabaseTransport,
} from '../src/multiplayer/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function createMockChannelBus() {
  const listeners = new Set();
  return (name) => {
    const channel = {
      name,
      onmessage: null,
      closed: false,
      postMessage(message) {
        if (this.closed) {
          return;
        }
        queueMicrotask(() => {
          for (const target of listeners) {
            if (target !== channel && !target.closed && target.name === name) {
              target.onmessage?.({ data: message });
            }
          }
        });
      },
      close() {
        this.closed = true;
        listeners.delete(this);
      },
    };
    listeners.add(channel);
    return channel;
  };
}

function createMockSupabaseClient(options = {}) {
  const rooms = new Map();
  const channels = [];
  let collisionCount = options.createCollisions ?? 0;

  function matchesFilters(row, filters) {
    for (const f of filters) {
      if (f.type === 'eq' && row[f.col] !== f.val) {
        return false;
      }
      if (f.type === 'is' && row[f.col] !== f.val) {
        return false;
      }
    }
    return true;
  }

  function makeBuilder(action) {
    const filters = [];
    const builder = {
      eq(col, val) {
        filters.push({ type: 'eq', col, val });
        return builder;
      },
      is(col, val) {
        filters.push({ type: 'is', col, val });
        return builder;
      },
      select() {
        return builder;
      },
      async single() {
        const res = await execute(true);
        return res;
      },
      async maybeSingle() {
        const res = await execute(false);
        return res;
      },
      then(resolve, reject) {
        return execute(false).then(resolve, reject);
      },
    };

    async function execute(requireRow) {
      if (options.forcedError) {
        return { data: null, error: options.forcedError, status: options.forcedStatus };
      }

      if (action.kind === 'insert') {
        const row = { ...action.values };
        if (collisionCount > 0) {
          collisionCount -= 1;
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          };
        }
        if (rooms.has(row.code)) {
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          };
        }
        const stored = {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        };
        rooms.set(row.code, structuredClone(stored));
        return { data: structuredClone(stored), error: null };
      }

      if (action.kind === 'select') {
        const matched = Array.from(rooms.values()).filter((r) =>
          matchesFilters(r, filters)
        );
        if (matched.length === 0) {
          if (requireRow) {
            return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
          }
          return { data: null, error: null };
        }
        return { data: structuredClone(matched[0]), error: null };
      }

      if (action.kind === 'update') {
        if (options.onBeforeUpdate) {
          options.onBeforeUpdate(rooms, action.values, filters);
        }
        const matched = Array.from(rooms.values()).filter((r) =>
          matchesFilters(r, filters)
        );
        if (matched.length === 0) {
          if (requireRow) {
            return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
          }
          return { data: null, error: null };
        }
        const current = matched[0];
        const next = {
          ...current,
          ...structuredClone(action.values),
          updated_at: new Date().toISOString(),
        };
        rooms.set(current.code, structuredClone(next));
        return { data: structuredClone(next), error: null };
      }

      return { data: null, error: { message: 'Unknown action' } };
    }

    return builder;
  }

  const client = {
    _rooms: rooms,
    _channels: channels,
    _removedChannels: [],
    from(table) {
      assert.equal(table, 'rooms');
      return {
        select() {
          return makeBuilder({ kind: 'select' });
        },
        insert(values) {
          return makeBuilder({ kind: 'insert', values });
        },
        update(values) {
          return makeBuilder({ kind: 'update', values });
        },
      };
    },
    channel(name) {
      const handlers = {
        postgres_changes: [],
        broadcast: [],
      };
      const ch = {
        name,
        sentMessages: [],
        on(type, filter, cb) {
          if (type === 'postgres_changes') {
            handlers.postgres_changes.push({ filter, cb });
          } else if (type === 'broadcast') {
            handlers.broadcast.push({ filter, cb });
          }
          return ch;
        },
        subscribe(cb) {
          queueMicrotask(() => cb?.('SUBSCRIBED'));
          return ch;
        },
        async send(msg) {
          ch.sentMessages.push(msg);
          return 'ok';
        },
        emitPostgresChange(newRow) {
          for (const h of handlers.postgres_changes) {
            h.cb({ new: structuredClone(newRow) });
          }
        },
        emitBroadcast(event, payload) {
          for (const h of handlers.broadcast) {
            if (!h.filter?.event || h.filter.event === event) {
              h.cb({ event, payload: structuredClone(payload) });
            }
          }
        },
      };
      channels.push(ch);
      return ch;
    },
    async removeChannel(ch) {
      client._removedChannels.push(ch);
      return 'ok';
    },
  };

  return client;
}

test('.env.example, supabase/schema.sql, and 001_create_rooms.sql define complete Phase 4 schema', async () => {
  const envExample = await fs.readFile(path.join(ROOT_DIR, '.env.example'), 'utf8');
  assert.match(envExample, /VITE_SUPABASE_URL=/);
  assert.match(envExample, /VITE_SUPABASE_ANON_KEY=/);

  const schemaSql = await fs.readFile(
    path.join(ROOT_DIR, 'supabase', 'schema.sql'),
    'utf8'
  );
  const migrationSql = await fs.readFile(
    path.join(ROOT_DIR, 'supabase', 'migrations', '001_create_rooms.sql'),
    'utf8'
  );

  assert.equal(schemaSql.trim(), migrationSql.trim());

  const requiredColumns = [
    'code',
    'status',
    'white_token',
    'black_token',
    'turn',
    'fen',
    'moves',
    'reset_count',
    'created_at',
    'updated_at',
  ];
  for (const col of requiredColumns) {
    assert.match(schemaSql, new RegExp(`\\b${col}\\b`, 'i'));
  }

  assert.match(schemaSql, /create table if not exists public\.rooms/i);
  assert.match(schemaSql, /rooms_updated_at_idx/i);
  assert.match(schemaSql, /trg_rooms_updated_at/i);
  assert.match(schemaSql, /enable row level security/i);
  assert.match(schemaSql, /to anon, authenticated/i);
  assert.match(schemaSql, /replica identity full/i);
  assert.match(schemaSql, /pg_publication_tables/i);
  assert.match(schemaSql, /alter publication supabase_realtime add table public\.rooms/i);
});

test('supabaseClient handles missing/placeholder/invalid env vars and accepts sb_publishable_* keys', () => {
  resetSupabaseClientCache();

  assert.equal(isSupabaseConfigured({ url: '', anonKey: '' }), false);
  assert.equal(getSupabaseClient({ url: '', anonKey: '' }), null);

  assert.equal(
    isSupabaseConfigured({
      url: 'https://your-project-ref.supabase.co',
      anonKey: 'your-supabase-anon-or-publishable-key',
    }),
    false
  );
  assert.equal(
    isSupabaseConfigured({
      url: 'ftp://invalid.supabase.co',
      anonKey: 'sb_publishable_1234567890abcdef',
    }),
    false
  );

  assert.equal(
    isSupabaseConfigured({
      url: 'https://example-project.supabase.co',
      anonKey: 'sb_publishable_D_OaWei4ZxkQA0Y1ybNIvg_jtGAa-c_',
    }),
    true
  );

  const client = getSupabaseClient({
    url: 'https://example-project.supabase.co',
    anonKey: 'sb_publishable_D_OaWei4ZxkQA0Y1ybNIvg_jtGAa-c_',
  });
  assert.ok(client);
  assert.equal(typeof client.from, 'function');
  assert.equal(typeof client.channel, 'function');
});

test('Room code helpers, URL invite parsing, token persistence, and promotion normalization work cleanly', () => {
  for (let i = 0; i < 25; i++) {
    const code = generateRoomCode();
    assert.equal(code.length, 4);
    for (const ch of code) {
      assert.ok(ROOM_CODE_ALPHABET.includes(ch));
    }
  }

  assert.equal(parseRoomCodeFromUrl('?room=ab23'), 'AB23');
  assert.equal(
    parseRoomCodeFromUrl('https://wizard.local/play?lang=de&room=k9m2'),
    'K9M2'
  );
  assert.equal(parseRoomCodeFromUrl('?room=TOO_LONG'), null);
  assert.equal(parseRoomCodeFromUrl('?lang=en'), null);

  assert.equal(
    buildInviteUrl('ab23', 'https://wizard.local/app'),
    'https://wizard.local/app?room=AB23'
  );

  const storage = createMemoryStorage();
  const tok1 = getOrCreatePlayerToken(storage);
  const tok2 = getOrCreatePlayerToken(storage);
  assert.ok(tok1.length >= 10);
  assert.equal(tok1, tok2);
  assert.equal(storage.getItem(PLAYER_TOKEN_STORAGE_KEY), tok1);

  assert.equal(normalizePromotion('q'), 'queen');
  assert.equal(normalizePromotion('QUEEN'), 'queen');
  assert.equal(normalizePromotion('n'), 'knight');
  assert.equal(normalizePromotion('knight'), 'knight');
  assert.equal(normalizePromotion('r'), 'rook');
  assert.equal(normalizePromotion('b'), 'bishop');
  assert.equal(normalizePromotion('invalid'), undefined);
  assert.equal(normalizePromotion(undefined), undefined);
});

test('LocalTransport + RoomManager synchronize 2 clients, preserve underpromotion, guard turns/spectators, reset, and reconnect', async () => {
  const storage = createMemoryStorage();
  const createChannel = createMockChannelBus();

  const whiteEvents = { remoteMoves: [], syncs: [], sessions: [] };
  const blackEvents = { remoteMoves: [], syncs: [], sessions: [] };

  const whiteManager = new RoomManager({
    transport: new LocalTransport({ storage, createChannel, instanceId: 'tab-w' }),
    playerToken: 'token-white-1',
    syncUrl: false,
    callbacks: {
      onRemoteMove: (m) => whiteEvents.remoteMoves.push(m),
      onStateSync: (s) => whiteEvents.syncs.push(s),
      onSessionChange: (info) => whiteEvents.sessions.push(info),
    },
  });

  const blackManager = new RoomManager({
    transport: new LocalTransport({ storage, createChannel, instanceId: 'tab-b' }),
    playerToken: 'token-black-1',
    syncUrl: false,
    callbacks: {
      onRemoteMove: (m) => blackEvents.remoteMoves.push(m),
      onStateSync: (s) => blackEvents.syncs.push(s),
      onSessionChange: (info) => blackEvents.sessions.push(info),
    },
  });

  const spectatorManager = new RoomManager({
    transport: new LocalTransport({ storage, createChannel, instanceId: 'tab-s' }),
    playerToken: 'token-spec-1',
    syncUrl: false,
  });

  try {
    // Reject nonexistent room (no ghost room creation)
    await assert.rejects(
      () => blackManager.joinRoom('ZZZZ'),
      (err) => err instanceof MultiplayerError && err.code === 'ROOM_NOT_FOUND'
    );

    // Create White-hosted room and join as Black
    const created = await whiteManager.createRoom({ hostColor: 'w', code: 'AB23' });
    assert.equal(created.role, 'w');
    assert.equal(created.room.status, 'waiting');

    const joined = await blackManager.joinRoom('ab23');
    assert.equal(joined.role, 'b');
    assert.equal(joined.room.status, 'playing');

    // Allow microtask channel delivery
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(whiteManager.getSessionInfo().opponentConnected, true);

    // 3rd client becomes spectator and cannot move or reset
    const specJoined = await spectatorManager.joinRoom('AB23');
    assert.equal(specJoined.role, 'spectator');
    await assert.rejects(
      () =>
        spectatorManager.submitLocalMove({
          fromR: 6,
          fromC: 4,
          toR: 4,
          toC: 4,
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          color: 'w',
        }),
      (err) => err instanceof MultiplayerError && err.code === 'UNAUTHORIZED'
    );
    await assert.rejects(
      () => spectatorManager.requestReset(),
      (err) => err instanceof MultiplayerError && err.code === 'UNAUTHORIZED'
    );

    // Out-of-turn move rejected
    await assert.rejects(
      () =>
        blackManager.submitLocalMove({
          fromR: 1,
          fromC: 4,
          toR: 3,
          toC: 4,
          fen: INITIAL_CHESS_FEN,
          color: 'b',
        }),
      (err) => err instanceof MultiplayerError && err.code === 'NOT_YOUR_TURN'
    );

    // White plays e2-e4
    const fenAfterE4 =
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    await whiteManager.submitLocalMove({
      fromR: 6,
      fromC: 4,
      toR: 4,
      toC: 4,
      uci: 'e2e4',
      san: 'e4',
      fen: fenAfterE4,
      color: 'w',
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.equal(whiteEvents.remoteMoves.length, 0); // self-echo suppressed
    assert.equal(blackEvents.remoteMoves.length, 1);
    assert.deepEqual(blackEvents.remoteMoves[0], {
      fromR: 6,
      fromC: 4,
      toR: 4,
      toC: 4,
    });

    // Black plays a promotion move with underpromotion to knight
    const fenAfterPromo = '1n6/8/8/8/8/8/8/4K2k w - - 0 2';
    await blackManager.submitLocalMove({
      fromR: 6,
      fromC: 0,
      toR: 7,
      toC: 1,
      promotion: 'knight',
      uci: 'a2b1n',
      san: 'axb1=N',
      fen: fenAfterPromo,
      color: 'b',
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.equal(whiteEvents.remoteMoves.length, 1);
    assert.deepEqual(whiteEvents.remoteMoves[0], {
      fromR: 6,
      fromC: 0,
      toR: 7,
      toC: 1,
      promotion: 'knight',
    });

    // Reconnect: fresh White RoomManager with same playerToken reclaims 'w' and syncs history
    const reconnectedSyncs = [];
    const reconnectedWhite = new RoomManager({
      transport: new LocalTransport({ storage, createChannel, instanceId: 'tab-w-reloaded' }),
      playerToken: 'token-white-1',
      syncUrl: false,
      callbacks: {
        onStateSync: (s) => reconnectedSyncs.push(s),
      },
    });
    const rejoin = await reconnectedWhite.joinRoom('AB23');
    assert.equal(rejoin.role, 'w');
    assert.equal(reconnectedSyncs.length, 1);
    assert.equal(reconnectedSyncs[0].moves.length, 2);
    assert.equal(reconnectedSyncs[0].moves[1].promotion, 'knight');
    reconnectedWhite.dispose();

    // Reset room from White -> Black receives reset state sync
    await whiteManager.requestReset();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(blackEvents.syncs.length, 1);
    assert.equal(blackEvents.syncs[0].resetCount, 1);
    assert.deepEqual(blackEvents.syncs[0].moves, []);
    assert.equal(blackManager.getRoomState()?.fen, INITIAL_CHESS_FEN);
  } finally {
    whiteManager.dispose();
    blackManager.dispose();
    spectatorManager.dispose();
  }
});

test('LocalTransport fixes Black-hosted seat assignment and works with native BroadcastChannel cleanup', async () => {
  const storage = createMemoryStorage();
  const hostBlack = new RoomManager({
    transport: new LocalTransport({ storage }),
    playerToken: 'host-black-tok',
    syncUrl: false,
  });
  const joinerWhite = new RoomManager({
    transport: new LocalTransport({ storage }),
    playerToken: 'joiner-white-tok',
    syncUrl: false,
  });

  const remoteSeenByHost = [];
  hostBlack.setCallbacks({
    onRemoteMove: (m) => remoteSeenByHost.push(m),
  });

  try {
    const created = await hostBlack.createRoom({ hostColor: 'b', code: 'BK77' });
    assert.equal(created.role, 'b');
    assert.equal(created.room.black_token, 'host-black-tok');
    assert.equal(created.room.white_token, null);

    const joined = await joinerWhite.joinRoom('BK77');
    assert.equal(joined.role, 'w');
    assert.equal(joined.room.white_token, 'joiner-white-tok');
    assert.equal(joined.room.black_token, 'host-black-tok');
    assert.equal(joined.room.status, 'playing');

    await joinerWhite.submitLocalMove({
      fromR: 6,
      fromC: 3,
      toR: 4,
      toC: 3,
      uci: 'd2d4',
      san: 'd4',
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      color: 'w',
    });

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(remoteSeenByHost.length, 1);
    assert.deepEqual(remoteSeenByHost[0], {
      fromR: 6,
      fromC: 3,
      toR: 4,
      toC: 3,
    });
  } finally {
    hostBlack.dispose();
    joinerWhite.dispose();
  }
});

test('RoomManager triggers gap catch-up onStateSync when multiple moves arrive or seq skips', async () => {
  const storage = createMemoryStorage();
  const createChannel = createMockChannelBus();
  const transport = new LocalTransport({ storage, createChannel, instanceId: 'client-2' });
  const seedTransport = new LocalTransport({ storage, createChannel, instanceId: 'client-1' });

  await seedTransport.createRoom({ code: 'GAP2', playerToken: 'w-tok', hostColor: 'w' });
  await seedTransport.joinRoom('GAP2', 'b-tok');

  const syncs = [];
  const remoteMoves = [];
  const manager = new RoomManager({
    transport,
    playerToken: 'b-tok',
    syncUrl: false,
    callbacks: {
      onStateSync: (s) => syncs.push(s),
      onRemoteMove: (m) => remoteMoves.push(m),
    },
  });

  try {
    await manager.joinRoom('GAP2');

    // Seed two moves externally without client-2 seeing move 1 individually
    const fen1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const fen2 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const silentTransport = new LocalTransport({
      storage,
      createChannel: () => ({ onmessage: null, postMessage() {}, close() {} }),
      instanceId: 'silent',
    });
    await silentTransport.submitMove({
      code: 'GAP2',
      playerToken: 'w-tok',
      move: { color: 'w', from: { r: 6, c: 4 }, to: { r: 4, c: 4 } },
      nextFen: fen1,
      nextTurn: 'b',
    });
    // Now broadcast move 2 -> client-2 has lastAppliedSeq=0 and sees seq=1 & seq=2
    await seedTransport.submitMove({
      code: 'GAP2',
      playerToken: 'b-tok',
      move: { color: 'b', from: { r: 1, c: 4 }, to: { r: 3, c: 4 } },
      nextFen: fen2,
      nextTurn: 'w',
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.equal(remoteMoves.length, 0);
    assert.equal(syncs.length, 1);
    assert.equal(syncs[0].moves.length, 2);

    silentTransport.dispose();
  } finally {
    manager.dispose();
    seedTransport.dispose();
  }
});

test('SupabaseTransport maps PGRST205 to TABLE_NOT_DEPLOYED, retries 23505, performs atomic join, CAS move/reset, and Realtime sync', async () => {
  // 1. PGRST205 -> TABLE_NOT_DEPLOYED
  const brokenClient = createMockSupabaseClient({
    forcedError: {
      code: 'PGRST205',
      message: "Could not find the table 'public.rooms' in the schema cache",
    },
    forcedStatus: 404,
  });
  const brokenTransport = new SupabaseTransport(brokenClient);
  await assert.rejects(
    () => brokenTransport.getRoom('ABCD'),
    (err) =>
      err instanceof MultiplayerError &&
      err.code === 'TABLE_NOT_DEPLOYED' &&
      /supabase\/schema\.sql/.test(err.message)
  );

  // 1b. 42501 -> UNAUTHORIZED with actionable grant/RLS message
  const deniedClient = createMockSupabaseClient({
    forcedError: {
      code: '42501',
      message: 'permission denied for table rooms',
    },
    forcedStatus: 401,
  });
  const deniedTransport = new SupabaseTransport(deniedClient);
  await assert.rejects(
    () => deniedTransport.getRoom('ABCD'),
    (err) =>
      err instanceof MultiplayerError &&
      err.code === 'UNAUTHORIZED' &&
      /GRANT SELECT, INSERT, UPDATE/i.test(err.message)
  );

  // 2. Collision retry + atomic join + CAS move + reset + Realtime
  const mockClient = createMockSupabaseClient({ createCollisions: 1 });
  const transport = new SupabaseTransport(mockClient);

  try {
    const created = await transport.createRoom({
      code: 'SB42',
      playerToken: 'sb-w',
      hostColor: 'w',
      retryOnCollision: true,
    });
    assert.notEqual(created.code, 'SB42');
    assert.equal(created.white_token, 'sb-w');
    assert.equal(created.status, 'waiting');

    const updates = [];
    const statuses = [];
    const unsubscribe = transport.subscribe(
      created.code,
      (room) => updates.push(room),
      (st) => statuses.push(st)
    );

    await new Promise((r) => setTimeout(r, 10));
    assert.ok(statuses.includes('connected'));
    assert.equal(updates.length >= 1, true); // getRoom catch-up on SUBSCRIBED

    // Atomic join by Black
    const joinedB = await transport.joinRoom(created.code, 'sb-b');
    assert.equal(joinedB.role, 'b');
    assert.equal(joinedB.room.status, 'playing');

    // Idempotent reconnect by White
    const rejoinedW = await transport.joinRoom(created.code, 'sb-w');
    assert.equal(rejoinedW.role, 'w');

    // 3rd client becomes spectator
    const joinedSpec = await transport.joinRoom(created.code, 'sb-spec');
    assert.equal(joinedSpec.role, 'spectator');

    // CAS move with promotion
    const fenAfterMove = '4k3/8/8/8/8/8/8/1N2K3 b - - 0 1';
    const moved = await transport.submitMove({
      code: created.code,
      playerToken: 'sb-w',
      move: {
        color: 'w',
        from: { r: 1, c: 0 },
        to: { r: 0, c: 1 },
        promotion: 'knight',
        uci: 'a7b8n',
        san: 'axb8=N',
      },
      nextFen: fenAfterMove,
      nextTurn: 'b',
    });
    assert.equal(moved.moves.length, 1);
    assert.equal(moved.moves[0].seq, 1);
    assert.equal(moved.moves[0].promotion, 'knight');
    assert.equal(mockClient._channels[0].sentMessages.length >= 1, true);

    // Emit postgres_changes and broadcast events
    mockClient._channels[0].emitPostgresChange(moved);
    mockClient._channels[0].emitBroadcast('room_state', { room: moved });
    assert.equal(updates.some((u) => u.moves.length === 1), true);

    // Reset room
    const resetted = await transport.resetRoom(created.code, 'sb-b');
    assert.equal(resetted.reset_count, 1);
    assert.equal(resetted.moves.length, 0);
    assert.equal(resetted.turn, 'w');
    assert.equal(resetted.fen, INITIAL_CHESS_FEN);

    unsubscribe();
    assert.equal(mockClient._removedChannels.length, 1);
  } finally {
    transport.dispose();
  }
});

test('SupabaseTransport detects CAS move conflict when room state mutates concurrently', async () => {
  let mutated = false;
  const mockClient = createMockSupabaseClient({
    onBeforeUpdate(rooms) {
      if (!mutated) {
        const room = rooms.get('RACE');
        if (room && room.white_token && room.black_token) {
          mutated = true;
          room.turn = 'b';
          room.fen = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
          room.moves = [
            {
              seq: 1,
              color: 'w',
              from: { r: 6, c: 3 },
              to: { r: 4, c: 3 },
              ts: Date.now(),
            },
          ];
        }
      }
    },
  });

  const transport = new SupabaseTransport(mockClient);
  try {
    await transport.createRoom({ code: 'RACE', playerToken: 'w-tok' });
    await transport.joinRoom('RACE', 'b-tok');

    await assert.rejects(
      () =>
        transport.submitMove({
          code: 'RACE',
          playerToken: 'w-tok',
          move: { color: 'w', from: { r: 6, c: 4 }, to: { r: 4, c: 4 } },
          nextFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          nextTurn: 'b',
        }),
      (err) => err instanceof MultiplayerError && err.code === 'CONFLICT'
    );
  } finally {
    transport.dispose();
  }
});

test('parseRoomCodeFromUrl strips #fragments from relative query strings and handles URL edge inputs', () => {
  assert.equal(parseRoomCodeFromUrl('?room=ab3k#frag'), 'AB3K');
  assert.equal(
    parseRoomCodeFromUrl('https://example.com/?foo=1&room=ab3k#section'),
    'AB3K'
  );
  assert.equal(parseRoomCodeFromUrl('room=ab3k#frag'), 'AB3K');
  assert.equal(parseRoomCodeFromUrl('/play?room=ab3k#frag'), 'AB3K');
  assert.equal(parseRoomCodeFromUrl('  ?room=ab3k#frag  '), 'AB3K');
  assert.equal(parseRoomCodeFromUrl('?foo=1#room=ab3k'), null);
  assert.equal(parseRoomCodeFromUrl('#room=ab3k'), null);
  assert.equal(parseRoomCodeFromUrl('?room=TOO_LONG#frag'), null);
  assert.equal(parseRoomCodeFromUrl('   '), null);
});

test('RoomManager ignores out-of-order stale snapshots while preserving valid seat-join updates', async () => {
  const fenAfterSeq1 =
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const fenAfterSeq2 =
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const fenAfterSeq3 =
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

  const move1 = {
    seq: 1,
    color: 'w',
    from: { r: 6, c: 4 },
    to: { r: 4, c: 4 },
    uci: 'e2e4',
    san: 'e4',
    fen: fenAfterSeq1,
    ts: 1001,
  };
  const move2 = {
    seq: 2,
    color: 'b',
    from: { r: 1, c: 4 },
    to: { r: 3, c: 4 },
    uci: 'e7e5',
    san: 'e5',
    fen: fenAfterSeq2,
    ts: 1002,
  };

  let pushUpdate = null;
  let staleRefreshState = null;
  let resolveInFlightMove = null;
  let currentRoom = {
    code: 'ORD1',
    status: 'waiting',
    white_token: 'w-tok',
    black_token: null,
    turn: 'w',
    fen: INITIAL_CHESS_FEN,
    moves: [],
    reset_count: 0,
  };

  const mockTransport = {
    mode: 'supabase',
    async createRoom() {
      return structuredClone(currentRoom);
    },
    async getRoom() {
      return structuredClone(staleRefreshState ?? currentRoom);
    },
    async joinRoom() {
      return { room: structuredClone(currentRoom), role: 'w' };
    },
    submitMove(input) {
      return new Promise((resolve) => {
        resolveInFlightMove = () => {
          const nextMove = {
            seq: currentRoom.moves.length + 1,
            color: input.move.color,
            from: input.move.from,
            to: input.move.to,
            fen: input.nextFen,
            ts: 1003,
          };
          currentRoom = {
            ...currentRoom,
            status: 'playing',
            moves: [...currentRoom.moves, nextMove],
            turn: input.nextTurn,
            fen: input.nextFen,
          };
          resolve(structuredClone(currentRoom));
        };
      });
    },
    async resetRoom() {
      return structuredClone(currentRoom);
    },
    subscribe(_code, onRoomUpdate, onStatusChange) {
      pushUpdate = onRoomUpdate;
      onStatusChange?.('connected', null);
      return () => {
        pushUpdate = null;
      };
    },
    dispose() {},
  };

  const remoteMoves = [];
  const syncs = [];
  const manager = new RoomManager({
    transport: mockTransport,
    playerToken: 'w-tok',
    syncUrl: false,
    callbacks: {
      onRemoteMove: (m) => remoteMoves.push(m),
      onStateSync: (s) => syncs.push(s),
    },
  });

  try {
    await manager.createRoom({ hostColor: 'w', code: 'ORD1' });
    assert.equal(manager.getSessionInfo().opponentConnected, false);

    // Seat-join arrives while a local move is in flight at seq=0 (same maxSeq)
    const inFlightPromise = manager.submitLocalMove({
      fromR: 6,
      fromC: 4,
      toR: 4,
      toC: 4,
      fen: fenAfterSeq1,
      color: 'w',
    });
    pushUpdate({
      ...currentRoom,
      status: 'playing',
      black_token: 'b-tok',
      moves: [],
    });
    assert.equal(manager.getSessionInfo().opponentConnected, true);
    assert.equal(manager.getRoomState()?.black_token, 'b-tok');
    assert.equal(manager.getRoomState()?.status, 'playing');

    // Stale pre-seat-join snapshot at same maxSeq=0 must NOT clear black_token or status
    pushUpdate({
      ...currentRoom,
      status: 'waiting',
      black_token: null,
      moves: [],
    });
    assert.equal(manager.getSessionInfo().opponentConnected, true);
    assert.equal(manager.getRoomState()?.black_token, 'b-tok');
    assert.equal(manager.getRoomState()?.status, 'playing');

    // Finish local move seq=1
    resolveInFlightMove();
    await inFlightPromise;

    // Receive seq=2 from Black
    currentRoom = {
      ...currentRoom,
      status: 'playing',
      black_token: 'b-tok',
      turn: 'w',
      fen: fenAfterSeq2,
      moves: [move1, move2],
    };
    pushUpdate(structuredClone(currentRoom));
    assert.equal(remoteMoves.length, 1);
    assert.equal(manager.getRoomState()?.turn, 'w');
    assert.equal(manager.getRoomState()?.fen, fenAfterSeq2);
    assert.equal(manager.getRoomState()?.moves.length, 2);

    // Delayed/out-of-order snapshot with only [seq 1] at same reset_count=0 arrives
    const staleSnapshot = {
      code: 'ORD1',
      status: 'playing',
      white_token: 'w-tok',
      black_token: 'b-tok',
      turn: 'b',
      fen: fenAfterSeq1,
      moves: [move1],
      reset_count: 0,
    };
    pushUpdate(structuredClone(staleSnapshot));

    // Must NOT regress turn, fen, or moves
    assert.equal(manager.getRoomState()?.turn, 'w');
    assert.equal(manager.getRoomState()?.fen, fenAfterSeq2);
    assert.equal(manager.getRoomState()?.moves.length, 2);

    // Stale getRoom() snapshot via refreshRoom() must also NOT regress state
    staleRefreshState = staleSnapshot;
    await manager.refreshRoom();
    staleRefreshState = null;
    assert.equal(manager.getRoomState()?.turn, 'w');
    assert.equal(manager.getRoomState()?.fen, fenAfterSeq2);
    assert.equal(manager.getRoomState()?.moves.length, 2);

    // Seat-join update at same maxSeq=2 (e.g. metadata update) IS still applied
    pushUpdate({
      ...currentRoom,
      updated_at: '2026-11-25T23:55:00.000Z',
    });
    assert.equal(
      manager.getRoomState()?.updated_at,
      '2026-11-25T23:55:00.000Z'
    );

    // White can still submit move seq=3 cleanly
    const nextMovePromise = manager.submitLocalMove({
      fromR: 7,
      fromC: 6,
      toR: 5,
      toC: 5,
      fen: fenAfterSeq3,
      color: 'w',
    });
    resolveInFlightMove();
    const afterSeq3 = await nextMovePromise;
    assert.equal(afterSeq3.moves.length, 3);
    assert.equal(afterSeq3.turn, 'b');
    assert.equal(afterSeq3.fen, fenAfterSeq3);
    assert.equal(syncs.length, 0);
  } finally {
    manager.dispose();
  }
});

test('In-flight submitLocalMove failing after concurrent reset does not clobber lastAppliedSeq', async () => {
  const fenAfterSeq1 =
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const fenAfterPostResetSeq1 =
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';

  let pushUpdate = null;
  let rejectInFlightMove = null;
  let serverRoom = {
    code: 'RST3',
    status: 'playing',
    white_token: 'w-tok',
    black_token: 'b-tok',
    turn: 'b',
    fen: fenAfterSeq1,
    moves: [
      {
        seq: 1,
        color: 'w',
        from: { r: 6, c: 4 },
        to: { r: 4, c: 4 },
        fen: fenAfterSeq1,
        ts: 1001,
      },
    ],
    reset_count: 0,
  };

  const mockTransport = {
    mode: 'supabase',
    async createRoom() {
      return structuredClone(serverRoom);
    },
    async getRoom() {
      return structuredClone(serverRoom);
    },
    async joinRoom() {
      return { room: structuredClone(serverRoom), role: 'b' };
    },
    submitMove() {
      return new Promise((_resolve, reject) => {
        rejectInFlightMove = reject;
      });
    },
    async resetRoom() {
      return structuredClone(serverRoom);
    },
    subscribe(_code, onRoomUpdate, onStatusChange) {
      pushUpdate = onRoomUpdate;
      onStatusChange?.('connected', null);
      return () => {
        pushUpdate = null;
      };
    },
    dispose() {},
  };

  const remoteMoves = [];
  const syncs = [];
  const errors = [];
  const blackManager = new RoomManager({
    transport: mockTransport,
    playerToken: 'b-tok',
    syncUrl: false,
    callbacks: {
      onRemoteMove: (m) => remoteMoves.push(m),
      onStateSync: (s) => syncs.push(s),
      onError: (e) => errors.push(e),
    },
  });

  try {
    await blackManager.joinRoom('RST3');
    assert.equal(syncs.length, 1);

    // Black starts submitLocalMove (in-flight at reset_count=0, prevSeq=1)
    const pendingMove = blackManager.submitLocalMove({
      fromR: 1,
      fromC: 4,
      toR: 3,
      toC: 4,
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      color: 'b',
    });

    // Concurrent reset_count=1 arrives while submitMove is in-flight
    serverRoom = {
      code: 'RST3',
      status: 'playing',
      white_token: 'w-tok',
      black_token: 'b-tok',
      turn: 'w',
      fen: INITIAL_CHESS_FEN,
      moves: [],
      reset_count: 1,
    };
    pushUpdate(structuredClone(serverRoom));
    assert.equal(syncs.length, 2);
    assert.equal(syncs[1].resetCount, 1);
    assert.deepEqual(syncs[1].moves, []);

    // In-flight submitMove now fails with CONFLICT
    rejectInFlightMove(
      new MultiplayerError(
        'CONFLICT',
        'Room state changed concurrently before move could be persisted.'
      )
    );
    await assert.rejects(
      () => pendingMove,
      (err) => err instanceof MultiplayerError && err.code === 'CONFLICT'
    );
    assert.equal(errors.some((e) => e.code === 'CONFLICT'), true);

    // Allow any background refreshRoom() microtasks to settle
    await new Promise((r) => setTimeout(r, 10));

    // Post-reset move seq=1 from White MUST fire onRemoteMove (not be dropped)
    serverRoom = {
      ...serverRoom,
      turn: 'b',
      fen: fenAfterPostResetSeq1,
      moves: [
        {
          seq: 1,
          color: 'w',
          from: { r: 6, c: 3 },
          to: { r: 4, c: 3 },
          fen: fenAfterPostResetSeq1,
          ts: 2001,
        },
      ],
    };
    pushUpdate(structuredClone(serverRoom));

    assert.equal(remoteMoves.length, 1);
    assert.deepEqual(remoteMoves[0], {
      fromR: 6,
      fromC: 3,
      toR: 4,
      toC: 3,
    });
  } finally {
    blackManager.dispose();
  }
});

test('DE and EN translations maintain exact key parity and Phase 4 multiplayer interpolation', () => {
  const deKeys = Object.keys(TRANSLATIONS.de).sort();
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  assert.deepEqual(deKeys, enKeys);

  for (const key of deKeys) {
    assert.ok(TRANSLATIONS.de[key].trim().length > 0, `Empty DE translation for ${key}`);
    assert.ok(TRANSLATIONS.en[key].trim().length > 0, `Empty EN translation for ${key}`);
  }

  assert.equal(translate('de', 'mpButtonActive', { code: 'AB23' }), 'Online: AB23');
  assert.equal(translate('en', 'mpButtonActive', { code: 'AB23' }), 'Online: AB23');
  assert.equal(translate('de', 'mpMovesCount', { count: 7 }), 'Züge: 7');
  assert.equal(translate('en', 'mpMovesCount', { count: 7 }), 'Moves: 7');
  assert.match(translate('de', 'mpErrRoomNotFound', { code: 'XY99' }), /XY99/);
  assert.match(translate('en', 'mpErrRoomNotFound', { code: 'XY99' }), /XY99/);
});

test('F4/F5 integration contracts: wizardChessEngine.js, App.tsx, and MultiplayerModal.tsx are cleanly wired without legacy sync', async () => {
  const engineJs = await fs.readFile(
    path.join(ROOT_DIR, 'src', 'wizardChessEngine.js'),
    'utf8'
  );
  const appTsx = await fs.readFile(
    path.join(ROOT_DIR, 'src', 'App.tsx'),
    'utf8'
  );
  const modalTsx = await fs.readFile(
    path.join(ROOT_DIR, 'src', 'components', 'MultiplayerModal.tsx'),
    'utf8'
  );

  // Legacy engine multiplayer/DOM bindings must be gone
  for (const forbidden of [
    '/api/rooms/',
    'EventSource',
    'roomPollTimer',
    'lobby-modal',
    'lobbyModal',
    'mp-status-msg',
    'hud-room-status',
    'roomPill',
    'BroadcastChannel',
  ]) {
    assert.ok(
      !engineJs.includes(forbidden),
      `Legacy symbol "${forbidden}" still present in src/wizardChessEngine.js`
    );
  }

  // Clean F4 bridge hooks must be present
  for (const required of [
    'enterMultiplayerGame',
    'leaveMultiplayerGame',
    'applyRemoteMove',
    'syncMultiplayerState',
    'onLocalMoveMade',
    'onMultiplayerResetRequested',
    'normalizePromotionType',
    'assetsLoaded',
  ]) {
    assert.ok(
      engineJs.includes(required),
      `Missing F4 contract symbol "${required}" in src/wizardChessEngine.js`
    );
  }

  // Clean F5 App.tsx wiring
  for (const required of [
    'RoomManager',
    'parseRoomCodeFromUrl',
    'MultiplayerModal',
    'coachOnlySinglePlayer',
    'mpDemoBlocked',
    "gameMode === 'multi'",
    'enterMultiplayerGame',
    'leaveMultiplayerGame',
    'applyRemoteMove',
    'syncMultiplayerState',
    'onLocalMoveMade',
    'onMultiplayerResetRequested',
  ]) {
    assert.ok(
      appTsx.includes(required),
      `Missing F5 wiring symbol "${required}" in src/App.tsx`
    );
  }

  // MultiplayerModal controls
  for (const required of [
    'id="multiplayer-modal"',
    'id="mp-transport-supabase"',
    'id="mp-transport-local"',
    'id="mp-join-code-input"',
    'id="btn-mp-create"',
    'id="btn-mp-join"',
    'id="btn-mp-copy-code"',
    'id="btn-mp-copy-link"',
    'id="btn-mp-reset"',
    'id="btn-mp-leave"',
  ]) {
    assert.ok(
      modalTsx.includes(required),
      `Missing MultiplayerModal control ${required}`
    );
  }
});

test('RoomManager sessionEpoch guard prevents stale in-flight move/reset from resurrecting room after leaveRoom or room switch', async () => {
  let resolveMove = null;
  let rejectReset = null;
  let refreshCount = 0;

  const roomA = {
    code: 'AAAA',
    status: 'playing',
    white_token: 'w-tok',
    black_token: 'b-tok',
    turn: 'w',
    fen: INITIAL_CHESS_FEN,
    moves: [],
    reset_count: 0,
  };
  const roomB = {
    code: 'BBBB',
    status: 'waiting',
    white_token: 'w-tok',
    black_token: null,
    turn: 'w',
    fen: INITIAL_CHESS_FEN,
    moves: [],
    reset_count: 0,
  };

  const mockTransport = {
    mode: 'supabase',
    async createRoom(input) {
      return structuredClone(input.code === 'BBBB' ? roomB : roomA);
    },
    async getRoom() {
      refreshCount += 1;
      return structuredClone(roomA);
    },
    async joinRoom() {
      return { room: structuredClone(roomA), role: 'w' };
    },
    submitMove(input) {
      return new Promise((resolve) => {
        resolveMove = () => {
          resolve({
            ...structuredClone(roomA),
            turn: input.nextTurn,
            fen: input.nextFen,
            moves: [
              {
                seq: 1,
                color: input.move.color,
                from: input.move.from,
                to: input.move.to,
                fen: input.nextFen,
                ts: 1001,
              },
            ],
          });
        };
      });
    },
    resetRoom() {
      return new Promise((_resolve, reject) => {
        rejectReset = reject;
      });
    },
    subscribe(_code, _onUpdate, onStatusChange) {
      onStatusChange?.('connected', null);
      return () => {};
    },
    dispose() {},
  };

  const errors = [];
  const manager = new RoomManager({
    transport: mockTransport,
    playerToken: 'w-tok',
    syncUrl: false,
    callbacks: {
      onError: (err) => errors.push(err),
    },
  });

  try {
    // 1. In-flight submitLocalMove resolves AFTER leaveRoom() -> must NOT resurrect roomA
    await manager.createRoom({ hostColor: 'w', code: 'AAAA' });
    const inFlightMove = manager.submitLocalMove({
      fromR: 6,
      fromC: 4,
      toR: 4,
      toC: 4,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      color: 'w',
    });
    manager.leaveRoom({ syncUrl: false });
    assert.equal(manager.getRoomState(), null);
    assert.equal(manager.getSessionInfo().connectionStatus, 'idle');

    resolveMove();
    await inFlightMove;
    assert.equal(manager.getRoomState(), null);
    assert.equal(manager.getSessionInfo().active, false);
    assert.equal(manager.getSessionInfo().connectionStatus, 'idle');

    // 2. In-flight requestReset rejects AFTER switching to roomB -> must NOT clobber roomB or emitError
    await manager.createRoom({ hostColor: 'w', code: 'AAAA' });
    const inFlightReset = manager.requestReset();
    await manager.createRoom({ hostColor: 'w', code: 'BBBB' });
    assert.equal(manager.getRoomState()?.code, 'BBBB');
    assert.equal(manager.getSessionInfo().connectionStatus, 'connected');

    rejectReset(new MultiplayerError('NETWORK_ERROR', 'Timed out'));
    await assert.rejects(
      () => inFlightReset,
      (err) => err instanceof MultiplayerError && err.code === 'NETWORK_ERROR'
    );

    assert.equal(manager.getRoomState()?.code, 'BBBB');
    assert.equal(manager.getSessionInfo().connectionStatus, 'connected');
    assert.equal(errors.length, 0);
    assert.equal(refreshCount, 0);
  } finally {
    manager.dispose();
  }
});

test('RoomManager submitLocalMove and requestReset preserve concurrent seat-join metadata at equal maxSeq', async () => {
  let pushUpdate = null;
  let resolveMove = null;
  let resolveReset = null;

  const baseRoom = {
    code: 'EQ12',
    status: 'waiting',
    white_token: 'w-tok',
    black_token: null,
    turn: 'w',
    fen: INITIAL_CHESS_FEN,
    moves: [],
    reset_count: 0,
  };

  const mockTransport = {
    mode: 'supabase',
    async createRoom() {
      return structuredClone(baseRoom);
    },
    async getRoom() {
      return structuredClone(baseRoom);
    },
    async joinRoom() {
      return { room: structuredClone(baseRoom), role: 'w' };
    },
    submitMove() {
      return new Promise((resolve) => {
        resolveMove = resolve;
      });
    },
    resetRoom() {
      return new Promise((resolve) => {
        resolveReset = resolve;
      });
    },
    subscribe(_code, onUpdate, onStatusChange) {
      pushUpdate = onUpdate;
      onStatusChange?.('connected', null);
      return () => {
        pushUpdate = null;
      };
    },
    dispose() {},
  };

  const manager = new RoomManager({
    transport: mockTransport,
    playerToken: 'w-tok',
    syncUrl: false,
  });

  try {
    await manager.createRoom({ hostColor: 'w', code: 'EQ12' });

    // Start submitLocalMove, then concurrent seat-join arrives at maxSeq=0
    const pendingMove = manager.submitLocalMove({
      fromR: 6,
      fromC: 4,
      toR: 4,
      toC: 4,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      color: 'w',
    });
    pushUpdate({
      ...baseRoom,
      status: 'playing',
      black_token: 'b-tok',
      moves: [],
    });
    assert.equal(manager.getRoomState()?.black_token, 'b-tok');

    // Suppose transport returns an equal-maxSeq response missing black_token/status:
    // isEqualSeqMetadataRegression must prevent regressing black_token/status
    resolveMove({
      ...baseRoom,
      status: 'waiting',
      black_token: null,
      moves: [],
    });
    await pendingMove;
    assert.equal(manager.getRoomState()?.black_token, 'b-tok');
    assert.equal(manager.getRoomState()?.status, 'playing');

    // Similarly for requestReset when equal reset_count & equal maxSeq regresses seat metadata
    const pendingReset = manager.requestReset();
    resolveReset({
      ...baseRoom,
      status: 'waiting',
      black_token: null,
      moves: [],
      reset_count: 0,
    });
    await pendingReset;
    assert.equal(manager.getRoomState()?.black_token, 'b-tok');
    assert.equal(manager.getRoomState()?.status, 'playing');
  } finally {
    manager.dispose();
  }
});
