// Error Service for Music Library
// Handles error logging, reporting, and history tracking

import { v4 as uuidv4 } from 'uuid';

export interface ErrorLog {
  id: string;
  timestamp: number;
  message: string;
  // Only store minimal, redacted fields by default to avoid leaking PII or
  // internal file paths. Full details are kept in-memory only and persisted
  // to localStorage only when explicitly enabled by the user via
  // `errorHistoryEnabled=true` in localStorage (opt-in).
  stack?: string; // redacted / single-line
  url?: string; // pathname-only (no query/hash)
  userAgent?: string; // short fingerprint only
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isErrorLog = (value: unknown): value is ErrorLog => {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp)
    && typeof value.message === 'string'
    && (value.stack === undefined || typeof value.stack === 'string')
    && (value.url === undefined || typeof value.url === 'string')
    && (value.userAgent === undefined || typeof value.userAgent === 'string')
    && (value.severity === 'low' || value.severity === 'medium' || value.severity === 'high' || value.severity === 'critical')
    && (value.metadata === undefined || isRecord(value.metadata));
};

const isErrorLogArray = (value: unknown): value is ErrorLog[] => {
  return Array.isArray(value) && value.every(isErrorLog);
};

export class ErrorService {
  private static instance: ErrorService;
  private errorHistory: ErrorLog[] = [];
  private readonly MAX_HISTORY = 50;
  private readonly DEFAULT_IN_MEMORY_HISTORY = 10;
  private readonly ERROR_HISTORY_KEY = 'errorHistory';
  private readonly ERROR_HISTORY_ENABLED_KEY = 'errorHistoryEnabled';

  private constructor() {
    if (typeof window === 'undefined') {
      return;
    }
    // Only load persistent history if the user explicitly enabled it
    try {
      const enabled = localStorage.getItem(this.ERROR_HISTORY_ENABLED_KEY) === 'true';
      if (!enabled) return;

      const savedHistory = localStorage.getItem(this.ERROR_HISTORY_KEY);
      if (!savedHistory) return;

      const parsed = JSON.parse(savedHistory) as unknown;
      if (isErrorLogArray(parsed)) {
        this.errorHistory = parsed.slice(-this.MAX_HISTORY);
      } else {
        console.warn('Invalid error history shape in localStorage; resetting history');
        this.backupCorruptHistory(savedHistory);
        this.errorHistory = [];
      }
    } catch (e) {
      console.warn('Failed to load persistent error history', e);
      // best-effort only
      this.errorHistory = [];
    }
  }

  public static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  public logError(
    error: Error,
    options: {
      severity?: 'low' | 'medium' | 'high' | 'critical';
      metadata?: Record<string, unknown>;
      url?: string;
      userAgent?: string;
    } = {}
  ): string {
    const errorId = uuidv4();
    const now = Date.now();

    // Prepare a redacted, safe-to-persist error log
    const redacted: ErrorLog = {
      id: errorId,
      timestamp: now,
      message: String(error.message || 'Unknown error').slice(0, 512),
      stack: this.redactStack(error.stack),
      url: this.redactUrl(options.url || (typeof window !== 'undefined' ? window.location.href : undefined)),
      userAgent: this.redactUserAgent(options.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined)),
      severity: options.severity ?? 'medium',
      metadata: this.sanitizeMetadata(options.metadata)
    };

    // Always keep a small in-memory history for runtime debugging
    this.errorHistory.push(redacted);
    if (this.errorHistory.length > Math.max(this.DEFAULT_IN_MEMORY_HISTORY, this.MAX_HISTORY)) {
      this.errorHistory = this.errorHistory.slice(-Math.max(this.DEFAULT_IN_MEMORY_HISTORY, this.MAX_HISTORY));
    }

    // Persist only if explicitly enabled
    try {
      const enabled = localStorage.getItem(this.ERROR_HISTORY_ENABLED_KEY) === 'true';
      if (enabled) {
        const existing = localStorage.getItem(this.ERROR_HISTORY_KEY);
        let persisted: ErrorLog[] = [];
        if (existing) {
          try {
            const parsed = JSON.parse(existing) as unknown;
            if (isErrorLogArray(parsed)) persisted = parsed as ErrorLog[];
          } catch {
            // ignore malformed persisted value
          }
        }

        persisted.push(redacted);
        if (persisted.length > this.MAX_HISTORY) persisted = persisted.slice(-this.MAX_HISTORY);
        localStorage.setItem(this.ERROR_HISTORY_KEY, JSON.stringify(persisted));
      }
    } catch (e) {
      // Best-effort persistence only
      console.warn('Failed to persist error history', e);
    }

    // Log a compact message to console based on severity (avoid dumping full stack/payload)
    const logMethod = this.getLogMethodForSeverity(redacted.severity);
    // @ts-ignore
    console[logMethod](`[ErrorService] ${redacted.severity.toUpperCase()} ${redacted.id}: ${redacted.message}`);

    return errorId;
  }

  private redactStack(stack?: string | null): string | undefined {
    if (!stack) return undefined;
    // Keep only the first stack line to avoid leaking file paths. Also remove absolute
    // Windows or Posix paths from the line.
    const firstLine = stack.split('\n')[0] || stack;
    // Remove sequences that look like file paths (very conservative)
    const redacted = firstLine.replace(/([A-Za-z]:\\|\/)\S+/g, '[REDACTED_PATH]');
    return redacted.slice(0, 400);
  }

  private redactUrl(url?: string): string | undefined {
    if (!url) return undefined;
    try {
      const u = new URL(url, window.location.href);
      // Only keep origin + pathname to avoid query strings and fragments
      return `${u.origin}${u.pathname}`;
    } catch {
      return undefined;
    }
  }

  private redactUserAgent(ua?: string): string | undefined {
    if (!ua) return undefined;
    // Very small fingerprint: browser name + platform if present
    try {
      const parts = ua.split(' ');
      return parts.slice(0, 2).join(' ').slice(0, 128);
    } catch {
      return undefined;
    }
  }

  private sanitizeMetadata(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!isRecord(meta)) return undefined;
    const keys = Object.keys(meta).slice(0, 5);
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      try {
        const v = meta[k];
        const str = typeof v === 'string' ? v : JSON.stringify(v);
        if (str.length > 200) {
          out[k] = str.slice(0, 200) + '...';
        } else {
          out[k] = v;
        }
      } catch {
        out[k] = '[UNSERIALIZABLE]';
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  public getErrorHistory(): ErrorLog[] {
    return [...this.errorHistory];
  }

  public getErrorById(id: string): ErrorLog | undefined {
    return this.errorHistory.find(error => error.id === id);
  }

  public clearErrorHistory(): void {
    this.errorHistory = [];
    try {
      localStorage.removeItem('errorHistory');
    } catch (e) {
      console.warn('Failed to clear error history from localStorage', e);
    }
  }

  private getLogMethodForSeverity(severity: 'low' | 'medium' | 'high' | 'critical'): keyof Console {
    switch (severity) {
      case 'low':
        return 'debug';
      case 'medium':
        return 'log';
      case 'high':
        return 'warn';
      case 'critical':
        return 'error';
      default:
        return 'log';
    }
  }

  private backupCorruptHistory(rawHistory: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(`errorHistory:corrupt:${Date.now()}`, rawHistory);
    } catch {
      // Best effort only.
    }
  }


}

export default ErrorService.getInstance();

