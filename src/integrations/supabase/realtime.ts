// src/integrations/supabase/realtime.ts - OPTIMIZED VERSION

import { supabase } from '@/integrations/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type Payload = RealtimePostgresChangesPayload<any>;

type Listener = {
  id: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: Record<string, any>;
  handler: (payload: Payload) => void;
};

type ChannelRecord = {
  key: string;
  listeners: Listener[];
  subscribed: boolean;
  channel?: ReturnType<typeof supabase['channel']>;
  bcEvents: BroadcastChannel;
  leaderHeartbeat?: number | null;
  isLeader: boolean;
  __controlListener?: (ev: MessageEvent) => void;
  lastActivity: number; // ✅ Track activity for cleanup
};

const channels = new Map<string, ChannelRecord>();

const TAB_ID = `tab_${Math.random().toString(36).slice(2, 9)}`;
const LOCK_EXPIRY_MS = 5000;
const LEADER_REFRESH_MS = 3000;
const CHANNEL_IDLE_TIMEOUT = 10 * 60 * 1000; // ✅ 10 minutes idle = auto-cleanup

function makeKey(channelName: string, serverFilter?: string) {
  return serverFilter ? `${channelName}::${serverFilter}` : channelName;
}

function genId(prefix = '') {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

function buildServerFilterString(filter?: Record<string, any>) {
  if (!filter || Object.keys(filter).length === 0) return undefined;
  const parts: string[] = [];
  for (const k of Object.keys(filter)) {
    const v = filter[k];
    if (v === null) {
      parts.push(`${k}=is.null`);
    } else {
      const val = String(v).replace(/&/g, '%26');
      parts.push(`${k}=eq.${val}`);
    }
  }
  return parts.join('&');
}

function lockKeyFor(key: string) {
  return `realtime-leader:${key}`;
}

function tryAcquireLeadership(key: string): boolean {
  const lk = lockKeyFor(key);
  try {
    const raw = localStorage.getItem(lk);
    const now = Date.now();
    if (!raw) {
      localStorage.setItem(lk, JSON.stringify({ tabId: TAB_ID, ts: now }));
      return true;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.tabId || !parsed.ts) {
      localStorage.setItem(lk, JSON.stringify({ tabId: TAB_ID, ts: now }));
      return true;
    }
    const age = now - parsed.ts;
    if (age > LOCK_EXPIRY_MS) {
      localStorage.setItem(lk, JSON.stringify({ tabId: TAB_ID, ts: now }));
      return true;
    }
    return parsed.tabId === TAB_ID;
  } catch {
    return true;
  }
}

function refreshLeadership(key: string) {
  const lk = lockKeyFor(key);
  try {
    const now = Date.now();
    localStorage.setItem(lk, JSON.stringify({ tabId: TAB_ID, ts: now }));
  } catch {}
}

function releaseLeadership(key: string) {
  const lk = lockKeyFor(key);
  try {
    const raw = localStorage.getItem(lk);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.tabId === TAB_ID) {
      localStorage.removeItem(lk);
    }
  } catch {}
}

function isControlMessage(obj: unknown): obj is { __control: string } {
  return !!obj && typeof obj === 'object' && '__control' in (obj as object);
}

function isRealtimePayload(obj: unknown): obj is Payload {
  return !!obj && typeof obj === 'object' && 'eventType' in (obj as object);
}

// ✅ Periodic cleanup of idle channels
function cleanupIdleChannels() {
  const now = Date.now();
  const toRemove: string[] = [];

  for (const [key, rec] of channels.entries()) {
    const idle = now - rec.lastActivity;
    if (idle > CHANNEL_IDLE_TIMEOUT && rec.listeners.length === 0) {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    const rec = channels.get(key);
    if (rec) {
      console.log(`[REALTIME] Cleaning up idle channel: ${key}`);
      if (rec.isLeader) {
        unsubscribeServer(rec).catch(() => {});
      }
      try {
        if (rec.__controlListener) {
          rec.bcEvents.removeEventListener('message', rec.__controlListener);
        }
        rec.bcEvents.close();
      } catch {}
      channels.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(cleanupIdleChannels, 5 * 60 * 1000);
}

function ensureChannelRecord(channelName: string, serverFilter?: string) {
  const key = makeKey(channelName, serverFilter);
  if (channels.has(key)) {
    const rec = channels.get(key)!;
    rec.lastActivity = Date.now(); // ✅ Update activity
    return rec;
  }

  const bcEvents = new BroadcastChannel(`realtime-events:${key}`);

  const rec: ChannelRecord = {
    key,
    listeners: [],
    subscribed: false,
    channel: undefined,
    bcEvents,
    leaderHeartbeat: null,
    isLeader: false,
    __controlListener: undefined,
    lastActivity: Date.now(),
  };

  const bcListener = (ev: MessageEvent) => {
    rec.lastActivity = Date.now(); // ✅ Update on activity
    const raw = ev.data as unknown;
    if (!raw || typeof raw !== 'object') return;
    if (isControlMessage(raw)) return;
    if (!isRealtimePayload(raw)) return;
    const payload = raw;

    const ls = Array.from(rec.listeners);
    for (const l of ls) {
      if (l.event !== '*' && payload.eventType !== l.event) continue;

      if (l.filter && Object.keys(l.filter).length > 0) {
        const target = payload.eventType === 'DELETE' ? (payload.old ?? {}) : (payload.new ?? {});
        let ok = true;
        for (const k of Object.keys(l.filter)) {
          if ((target as any)[k] !== l.filter[k]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }

      try {
        l.handler(payload);
      } catch {}
    }
  };

  bcEvents.addEventListener('message', bcListener);
  rec.__controlListener = bcListener;

  channels.set(key, rec);
  return rec;
}

async function subscribeServer(
  rec: ChannelRecord,
  channelName: string,
  table?: string,
  schema?: string,
  serverFilter?: string
) {
  if (rec.subscribed) return;
  const ch = supabase.channel(`realtime:${rec.key}`);
  rec.channel = ch;

  const onParams: any = { event: '*', schema: schema ?? 'public' };
  if (table) onParams.table = table;
  if (serverFilter) onParams.filter = serverFilter;

  ch.on('postgres_changes', onParams, (payload: Payload) => {
    rec.lastActivity = Date.now(); // ✅ Update activity

    try {
      rec.bcEvents.postMessage(payload);
    } catch {}

    const ls = Array.from(rec.listeners);
    for (const l of ls) {
      if (l.event !== '*' && payload.eventType !== l.event) continue;
      if (l.filter && Object.keys(l.filter).length > 0) {
        const target = payload.eventType === 'DELETE' ? (payload.old ?? {}) : (payload.new ?? {});
        let ok = true;
        for (const k of Object.keys(l.filter)) {
          if ((target as any)[k] !== l.filter[k]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      try {
        l.handler(payload);
      } catch {}
    }
  });

  await ch.subscribe(() => {});

  rec.subscribed = true;
  rec.isLeader = true;

  rec.leaderHeartbeat = window.setInterval(() => refreshLeadership(rec.key), LEADER_REFRESH_MS);
}

async function unsubscribeServer(rec: ChannelRecord) {
  if (!rec.subscribed || !rec.channel) return;
  try {
    supabase.removeChannel(rec.channel);
  } catch {}
  rec.subscribed = false;
  rec.channel = undefined;
  rec.isLeader = false;
  if (rec.leaderHeartbeat) {
    clearInterval(rec.leaderHeartbeat);
    rec.leaderHeartbeat = null;
  }
  releaseLeadership(rec.key);

  try {
    rec.bcEvents.postMessage({ __control: 'leader_left' });
  } catch {}
}

export function addRealtimeListener(opts: {
  channelName: string;
  table?: string;
  schema?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: Record<string, any>;
  allowGlobal?: boolean;
  handler: (payload: Payload) => void;
}) {
  const serverFilter = buildServerFilterString(opts.filter);

  const key = makeKey(opts.channelName, serverFilter);
  const rec = ensureChannelRecord(opts.channelName, serverFilter);

  const id = genId('l-');
  rec.listeners.push({
    id,
    event: opts.event ?? '*',
    filter: opts.filter,
    handler: opts.handler,
  });

  if (serverFilter || opts.allowGlobal) {
    const acquired = tryAcquireLeadership(key);
    if (acquired) {
      if (!rec.subscribed) {
        subscribeServer(rec, opts.channelName, opts.table, opts.schema, serverFilter).catch(() => {
          releaseLeadership(key);
        });
      }
    } else {
      const onControl = (ev: MessageEvent) => {
        const data = ev.data;
        if (isControlMessage(data) && data.__control === 'leader_left') {
          setTimeout(() => {
            const success = tryAcquireLeadership(key);
            if (success) {
              subscribeServer(rec, opts.channelName, opts.table, opts.schema, serverFilter).catch(() => {});
            }
          }, 100 + Math.random() * 400);
        }
      };
      rec.bcEvents.addEventListener('message', onControl);
      rec.__controlListener = onControl;
    }
  }

  return id;
}

export function removeRealtimeListener(channelName: string, listenerId: string, filter?: Record<string, any>) {
  const serverFilter = buildServerFilterString(filter);
  const key = makeKey(channelName, serverFilter);
  const rec = channels.get(key);

  if (!rec) {
    for (const [k, candidate] of channels.entries()) {
      if (k === channelName || k.startsWith(channelName + '::')) {
        candidate.listeners = candidate.listeners.filter((l) => l.id !== listenerId);
        candidate.lastActivity = Date.now(); // ✅ Update activity
        if (candidate.listeners.length === 0) {
          if (candidate.isLeader) unsubscribeServer(candidate).catch(() => {});
          try {
            candidate.bcEvents.close();
          } catch {}
          if (candidate.__controlListener)
            candidate.bcEvents.removeEventListener('message', candidate.__controlListener);
          channels.delete(k);
        }
        return;
      }
    }
    return;
  }

  rec.listeners = rec.listeners.filter((l) => l.id !== listenerId);
  rec.lastActivity = Date.now(); // ✅ Update activity

  if (rec.listeners.length === 0) {
    if (rec.isLeader) {
      unsubscribeServer(rec).catch(() => {});
    }
    try {
      if (rec.__controlListener) rec.bcEvents.removeEventListener('message', rec.__controlListener);
    } catch {}
    try {
      rec.bcEvents.close();
    } catch {}
    channels.delete(key);
  }
}

export function removeAllRealtimeChannels() {
  for (const [k, rec] of channels.entries()) {
    try {
      if (rec.isLeader) unsubscribeServer(rec).catch(() => {});
      if (rec.__controlListener) rec.bcEvents.removeEventListener('message', rec.__controlListener);
      rec.bcEvents.close();
    } catch {}
    channels.delete(k);
  }
}