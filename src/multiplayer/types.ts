export type PlayerColor = 'w' | 'b';

export type RoomRole = PlayerColor | 'spectator';

export type MultiplayerTransportMode = 'supabase' | 'local';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type CanonicalPromotion = 'queen' | 'rook' | 'bishop' | 'knight';

export type RoomPromotion =
  | 'q'
  | 'r'
  | 'b'
  | 'n'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight';

export interface RoomMoveCoord {
  r: number;
  c: number;
}

export interface RoomMove {
  seq: number;
  color: PlayerColor;
  from: RoomMoveCoord;
  to: RoomMoveCoord;
  promotion?: RoomPromotion;
  uci?: string;
  san?: string;
  fen?: string;
  tc?: string;
  wMs?: number;
  bMs?: number;
  ts: number;
}

export interface RoomState {
  code: string;
  status: RoomStatus;
  white_token: string | null;
  black_token: string | null;
  turn: PlayerColor;
  fen: string;
  moves: RoomMove[];
  reset_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface MultiplayerSessionInfo {
  active: boolean;
  mode: MultiplayerTransportMode;
  roomCode: string | null;
  role: RoomRole | null;
  opponentConnected: boolean;
  connectionStatus: ConnectionStatus;
  errorMessage?: string | null;
}

export interface LocalMoveInput {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  promotion?: string;
  uci?: string;
  san?: string;
  fen: string;
  tc?: string;
  wMs?: number;
  bMs?: number;
  color: PlayerColor;
}

export interface RemoteMovePayload {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  promotion?: CanonicalPromotion;
}

export interface SyncStatePayload {
  moves: RoomMove[];
  resetCount: number;
  playerColor?: RoomRole;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
  addEventListener?(
    type: string,
    listener: (event: { data: unknown }) => void
  ): void;
  removeEventListener?(
    type: string,
    listener: (event: { data: unknown }) => void
  ): void;
}

export type MultiplayerErrorCode =
  | 'NOT_CONFIGURED'
  | 'TABLE_NOT_DEPLOYED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_ALREADY_EXISTS'
  | 'INVALID_ROOM_CODE'
  | 'NOT_YOUR_TURN'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class MultiplayerError extends Error {
  readonly code: MultiplayerErrorCode;
  readonly cause?: unknown;

  constructor(code: MultiplayerErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'MultiplayerError';
    this.code = code;
    this.cause = cause;
  }
}

export interface CreateRoomInput {
  code?: string;
  playerToken: string;
  hostColor?: PlayerColor;
  retryOnCollision?: boolean;
}

export interface JoinRoomResult {
  room: RoomState;
  role: RoomRole;
}

export interface SubmitMoveInput {
  code: string;
  playerToken: string;
  move: Omit<RoomMove, 'seq' | 'ts'> & { ts?: number };
  nextFen: string;
  nextTurn: PlayerColor;
  nextStatus?: RoomStatus;
}

export interface MultiplayerTransport {
  readonly mode: MultiplayerTransportMode;
  createRoom(input: CreateRoomInput): Promise<RoomState>;
  getRoom(code: string): Promise<RoomState | null>;
  joinRoom(code: string, playerToken: string): Promise<JoinRoomResult>;
  submitMove(input: SubmitMoveInput): Promise<RoomState>;
  resetRoom(code: string, playerToken: string): Promise<RoomState>;
  subscribe(
    code: string,
    onRoomUpdate: (room: RoomState) => void,
    onStatusChange?: (status: ConnectionStatus, errorMessage?: string | null) => void
  ): () => void;
  dispose?(): void;
}

export interface RoomManagerCallbacks {
  onSessionChange?: (
    session: MultiplayerSessionInfo,
    room: RoomState | null
  ) => void;
  onRemoteMove?: (move: RemoteMovePayload, room: RoomState) => void;
  onStateSync?: (payload: SyncStatePayload, room: RoomState) => void;
  onError?: (error: MultiplayerError) => void;
}
