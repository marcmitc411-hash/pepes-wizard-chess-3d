import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEnvConfig {
  url: string;
  anonKey: string;
}

const URL_PLACEHOLDER_PATTERNS = [
  'your-project-ref',
  'your-supabase',
  'example.supabase.co',
  '<project',
  '[your-',
];

const KEY_PLACEHOLDER_PATTERNS = [
  'your-supabase-anon',
  'your-anon-key',
  'your_anon_key',
  'your-publishable-key',
  '<anon',
  '[your-',
];

let cachedClient: SupabaseClient | null = null;
let cachedEnvSignature: string | null = null;

function readSafeImportMetaEnv(): Record<string, unknown> | undefined {
  try {
    const url = import.meta.env?.VITE_SUPABASE_URL;
    const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
    if (url !== undefined || anonKey !== undefined) {
      return {
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_ANON_KEY: anonKey,
      };
    }
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    return env && typeof env === 'object' ? env : undefined;
  } catch {
    return undefined;
  }
}

function readSafeProcessEnv(): Record<string, unknown> | undefined {
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }
  return process.env as Record<string, unknown>;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readSupabaseEnv(
  overrides?: Partial<SupabaseEnvConfig>
): SupabaseEnvConfig {
  const metaEnv = readSafeImportMetaEnv();
  const procEnv = readSafeProcessEnv();

  const rawUrl =
    overrides?.url ??
    metaEnv?.VITE_SUPABASE_URL ??
    procEnv?.VITE_SUPABASE_URL ??
    '';

  const rawAnonKey =
    overrides?.anonKey ??
    metaEnv?.VITE_SUPABASE_ANON_KEY ??
    procEnv?.VITE_SUPABASE_ANON_KEY ??
    '';

  return {
    url: toTrimmedString(rawUrl),
    anonKey: toTrimmedString(rawAnonKey),
  };
}

function isValidHttpUrl(value: string): boolean {
  if (!value) {
    return false;
  }
  const lower = value.toLowerCase();
  for (const pattern of URL_PLACEHOLDER_PATTERNS) {
    if (lower.includes(pattern)) {
      return false;
    }
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function isValidAnonOrPublishableKey(value: string): boolean {
  if (!value || value.length < 16) {
    return false;
  }
  const lower = value.toLowerCase();
  for (const pattern of KEY_PLACEHOLDER_PATTERNS) {
    if (lower.includes(pattern)) {
      return false;
    }
  }
  // Accept both legacy JWT anon keys and modern sb_publishable_* keys.
  return !/\s/.test(value);
}

export function isSupabaseConfigured(
  overrides?: Partial<SupabaseEnvConfig>
): boolean {
  const env = readSupabaseEnv(overrides);
  return isValidHttpUrl(env.url) && isValidAnonOrPublishableKey(env.anonKey);
}

export function getSupabaseClient(
  overrides?: Partial<SupabaseEnvConfig>
): SupabaseClient | null {
  const env = readSupabaseEnv(overrides);
  if (!isValidHttpUrl(env.url) || !isValidAnonOrPublishableKey(env.anonKey)) {
    return null;
  }

  const hasOverrides = Boolean(
    overrides && (overrides.url !== undefined || overrides.anonKey !== undefined)
  );
  const signature = `${env.url}::${env.anonKey}`;

  if (!hasOverrides && cachedClient && cachedEnvSignature === signature) {
    return cachedClient;
  }

  const client = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  if (!hasOverrides) {
    cachedClient = client;
    cachedEnvSignature = signature;
  }

  return client;
}

export function resetSupabaseClientCache(): void {
  cachedClient = null;
  cachedEnvSignature = null;
}
