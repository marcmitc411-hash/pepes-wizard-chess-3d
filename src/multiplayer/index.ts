export {
  MultiplayerError,
  type BroadcastChannelLike,
  type CanonicalPromotion,
  type ConnectionStatus,
  type CreateRoomInput,
  type JoinRoomResult,
  type LocalMoveInput,
  type MultiplayerErrorCode,
  type MultiplayerSessionInfo,
  type MultiplayerTransport,
  type MultiplayerTransportMode,
  type PlayerColor,
  type RemoteMovePayload,
  type RoomManagerCallbacks,
  type RoomMove,
  type RoomMoveCoord,
  type RoomPromotion,
  type RoomRole,
  type RoomState,
  type RoomStatus,
  type StorageLike,
  type SubmitMoveInput,
  type SyncStatePayload,
} from './types.ts';

export {
  getSupabaseClient,
  isSupabaseConfigured,
  readSupabaseEnv,
  resetSupabaseClientCache,
  type SupabaseEnvConfig,
} from './supabaseClient.ts';

export {
  createMemoryStorage,
  getLocalRoomStorageKey,
  LOCAL_CHANNEL_NAME,
  LOCAL_ROOM_STORAGE_PREFIX,
  LocalTransport,
  type LocalTransportOptions,
} from './localTransport.ts';

export {
  mapSupabaseError,
  SupabaseTransport,
  type PostgrestErrorLike,
  type QueryFilterBuilderLike,
  type QueryResultLike,
  type RealtimeChannelLike,
  type SupabaseClientLike,
  type SupabaseTransportOptions,
  type TableQueryBuilderLike,
} from './supabaseTransport.ts';

export {
  buildInviteUrl,
  generateRoomCode,
  getDefaultTransportMode,
  getOrCreatePlayerToken,
  getRoomCodeFromUrl,
  INITIAL_CHESS_FEN,
  isValidRoomCode,
  normalizePromotion,
  normalizeRoomCode,
  parseRoomCodeFromUrl,
  PLAYER_TOKEN_STORAGE_KEY,
  resolveRoleForToken,
  ROOM_CODE_ALPHABET,
  RoomManager,
  syncRoomCodeToUrl,
  type RoomManagerOptions,
} from './roomManager.ts';
