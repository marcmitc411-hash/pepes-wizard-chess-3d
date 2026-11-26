import { STOCKFISH_WORKER_PATH } from './stockfishConfig.ts';
import {
  DEFAULT_STRENGTH_CONFIG,
  buildUciStrengthCommands,
  loadSavedStrength,
  parseBestMoveLine,
  parseUciInfoLine,
  saveStrength,
  selectMoveForStrength,
  type EngineStrengthConfig,
  type UciInfoLine,
} from './uciStrength.ts';

export type EngineStatus = 'uninitialized' | 'loading' | 'ready' | 'thinking' | 'fallback';

export interface AnalysisResult {
  bestMove: string | null;
  lines: UciInfoLine[];
}

export interface AnalyzeOptions {
  multiPv?: number;
  depth?: number;
  movetimeMs?: number;
}

interface PendingSearch {
  id: number;
  pvLines: UciInfoLine[];
  resolve: (result: { bestMove: string | null; pvLines: UciInfoLine[] }) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class StockfishService {
  private worker: Worker | null = null;
  private status: EngineStatus = 'uninitialized';
  private strength: EngineStrengthConfig;
  private statusListeners = new Set<(status: EngineStatus) => void>();
  private initPromise: Promise<boolean> | null = null;
  private readyResolver: ((ok: boolean) => void) | null = null;
  private uciOkReceived = false;
  private activeSearch: PendingSearch | null = null;
  private searchCounter = 0;
  private disposed = false;

  constructor(initialStrength?: EngineStrengthConfig) {
    this.strength = initialStrength ?? loadSavedStrength();
  }

  private setStatus(next: EngineStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) {
      try {
        listener(next);
      } catch {
        // ignore listener errors
      }
    }
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  onStatusChange(listener: (status: EngineStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getStrength(): EngineStrengthConfig {
    return { ...this.strength };
  }

  setStrength(config: EngineStrengthConfig): void {
    this.strength = { ...config };
    saveStrength(this.strength);
  }

  async init(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.status === 'ready' || this.status === 'thinking') return true;
    if (this.status === 'fallback') return false;
    if (this.initPromise) return this.initPromise;

    if (typeof Worker === 'undefined') {
      this.setStatus('fallback');
      return false;
    }

    this.setStatus('loading');
    this.initPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        this.readyResolver = null;
        if (ok) {
          this.setStatus('ready');
        } else {
          this.cleanupWorker();
          this.setStatus('fallback');
        }
        resolve(ok);
      };

      const timeoutId = setTimeout(() => finish(false), 15000);
      this.readyResolver = finish;

      try {
        const worker = new Worker(STOCKFISH_WORKER_PATH);
        this.worker = worker;

        worker.onmessage = (ev: MessageEvent) => {
          const raw = typeof ev.data === 'string' ? ev.data : String(ev.data ?? '');
          const lines = raw.split(/\r?\n/);
          for (const line of lines) {
            if (line.trim()) this.handleEngineLine(line.trim());
          }
        };

        worker.onerror = () => {
          finish(false);
        };

        worker.postMessage('uci');
      } catch {
        finish(false);
      }
    });

    return this.initPromise;
  }

  private handleEngineLine(line: string): void {
    if (line === 'uciok') {
      this.uciOkReceived = true;
      this.post('isready');
      return;
    }

    if (line === 'readyok') {
      if (this.readyResolver) {
        this.readyResolver(true);
      }
      return;
    }

    if (this.activeSearch) {
      const info = parseUciInfoLine(line);
      if (info) {
        this.activeSearch.pvLines.push(info);
        return;
      }

      const best = parseBestMoveLine(line);
      if (best) {
        const current = this.activeSearch;
        this.activeSearch = null;
        clearTimeout(current.timeoutId);
        if (this.status === 'thinking') {
          this.setStatus('ready');
        }
        current.resolve({
          bestMove: best.bestMove,
          pvLines: current.pvLines,
        });
      }
    }
  }

  private post(cmd: string): void {
    if (!this.worker) return;
    try {
      this.worker.postMessage(cmd);
    } catch {
      // ignore post errors
    }
  }

  private cancelActiveSearch(): void {
    if (!this.activeSearch) return;
    const prev = this.activeSearch;
    this.activeSearch = null;
    clearTimeout(prev.timeoutId);
    this.post('stop');
    prev.resolve({ bestMove: null, pvLines: [] });
    if (this.status === 'thinking') {
      this.setStatus('ready');
    }
  }

  stop(): void {
    this.cancelActiveSearch();
  }

  newGame(): void {
    this.cancelActiveSearch();
    if (this.worker && this.uciOkReceived) {
      this.post('ucinewgame');
      this.post('isready');
    }
  }

  private runSearch(
    fen: string,
    options: string[],
    goCommand: string,
    timeoutMs: number
  ): Promise<{ bestMove: string | null; pvLines: UciInfoLine[] }> {
    return new Promise((resolve) => {
      if (!this.worker || this.disposed) {
        resolve({ bestMove: null, pvLines: [] });
        return;
      }

      this.cancelActiveSearch();
      const searchId = ++this.searchCounter;
      this.setStatus('thinking');

      const timeoutId = setTimeout(() => {
        if (this.activeSearch && this.activeSearch.id === searchId) {
          this.post('stop');
          const timedOut = this.activeSearch;
          this.activeSearch = null;
          if (this.status === 'thinking') {
            this.setStatus('ready');
          }
          // Return best PV move collected so far if Stockfish hasn't emitted bestmove yet
          const fallbackMove =
            timedOut.pvLines[timedOut.pvLines.length - 1]?.pv[0] ?? null;
          timedOut.resolve({ bestMove: fallbackMove, pvLines: timedOut.pvLines });
        }
      }, timeoutMs);

      this.activeSearch = {
        id: searchId,
        pvLines: [],
        resolve,
        timeoutId,
      };

      for (const opt of options) {
        this.post(opt);
      }
      this.post(`position fen ${fen}`);
      this.post(goCommand);
    });
  }

  async getBestMove(
    fen: string,
    overrideConfig?: EngineStrengthConfig,
    movetimeOverrideMs?: number
  ): Promise<string | null> {
    const ok = await this.init();
    if (!ok || !this.worker) return null;

    const baseCfg = overrideConfig ?? this.strength ?? DEFAULT_STRENGTH_CONFIG;
    const cfg =
      typeof movetimeOverrideMs === 'number' && Number.isFinite(movetimeOverrideMs)
        ? { ...baseCfg, movetimeMs: Math.max(80, Math.min(baseCfg.movetimeMs || 500, movetimeOverrideMs)) }
        : baseCfg;
    const plan = buildUciStrengthCommands(cfg);
    const timeoutMs = Math.max(2500, (cfg.movetimeMs || 500) + 2500);

    const { bestMove, pvLines } = await this.runSearch(
      fen,
      plan.options,
      plan.goCommand,
      timeoutMs
    );

    if (!bestMove) return null;
    return selectMoveForStrength(bestMove, pvLines, cfg);
  }

  async analyzePosition(
    fen: string,
    analyzeOpts: AnalyzeOptions = {}
  ): Promise<AnalysisResult> {
    const ok = await this.init();
    if (!ok || !this.worker) {
      return { bestMove: null, lines: [] };
    }

    const multiPv = Math.max(1, Math.min(5, analyzeOpts.multiPv ?? 3));
    const movetimeMs = Math.max(150, Math.min(4000, analyzeOpts.movetimeMs ?? 550));
    const depthPart = analyzeOpts.depth ? `depth ${analyzeOpts.depth} ` : '';
    const goCommand = `go ${depthPart}movetime ${movetimeMs}`;

    const options = [
      'setoption name UCI_LimitStrength value false',
      'setoption name Skill Level value 20',
      `setoption name MultiPV value ${multiPv}`,
    ];

    const { bestMove, pvLines } = await this.runSearch(
      fen,
      options,
      goCommand,
      movetimeMs + 2500
    );

    // Deduplicate to highest depth per multipv
    const maxDepth = pvLines.reduce((acc, l) => Math.max(acc, l.depth), 0);
    const byPv = new Map<number, UciInfoLine>();
    for (const line of pvLines) {
      const existing = byPv.get(line.multipv);
      if (!existing || line.depth >= existing.depth) {
        byPv.set(line.multipv, line);
      }
    }

    const lines = Array.from(byPv.values())
      .filter((l) => l.depth >= Math.max(1, maxDepth - 1))
      .sort((a, b) => a.multipv - b.multipv);

    return { bestMove, lines };
  }

  private cleanupWorker(): void {
    this.cancelActiveSearch();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore termination errors
      }
      this.worker = null;
    }
    this.uciOkReceived = false;
    this.initPromise = null;
  }

  dispose(): void {
    this.disposed = true;
    this.cleanupWorker();
  }
}
