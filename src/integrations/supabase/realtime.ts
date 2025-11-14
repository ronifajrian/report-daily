// src/integrations/supabase/realtime.ts
/**
 * Realtime manager for Supabase (client-side).
 *
 * - Single channel per (entity + serverFilter) key
 * - Cross-tab leader election using localStorage + BroadcastChannel
 * - Only the leader tab opens a Supabase channel (reduces server list_changes calls)
 * - Server-side filter builder (e.g. { report_id: 'abc' } => 'report_id=eq.abc')
 * - Prevent accidental server-wide subscriptions unless allowGlobal: true
 *
 * Usage:
 *   const id = addRealtimeListener({
 *     channelName: 'daily_reports',
 *     table: 'daily_reports',
 *     event: '*',
 *     filter: { report_id: 'abc' },
 *     handler: (payload) => { ... }
 *   });
 *
 *   removeRealtimeListener('daily_reports', id, { report_id: 'abc' });
 */

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
  key: string; // channelName + serverFilter key
  listeners: Listener[];
  subscribed: boolean;
  channel?: ReturnType<typeof supabase['channel']>;
  bcEvents: BroadcastChannel;
  leaderHeartbeat?: number | null;
  isLeader: boolean;
  __controlListener?: (ev: MessageEvent) => void;
};

const channels = new Map<string, ChannelRecord>();

const TAB_ID = `tab_${Math.random().toString(36).slice(2, 9)}`;
const LOCK_EXPIRY_MS = 5000;
const LEADER_REFRESH_MS = 3000;

function makeKey(channelName: string, serverFilter?: string) {
  return serverFilter ? `${channelName}::${serverFilter}` : channelName;
}
function genId(prefix = '') {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

/** build server filter string for Supabase `filter` option */
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

/** localStorage key for lock */
function lockKeyFor(key: string) {
  return `realtime-leader:${key}`;
}

/** Try to acquire leadership for key */
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
      // steal stale lock
      localStorage.setItem(lk, JSON.stringify({ tabId: TAB_ID, ts: now }));
      return true;
    }
    return parsed.tabId === TAB_ID;
  } catch (e) {
    // localStorage might be blocked; fallback to assume leadership to avoid blocking functionality
    return true;
  }
}

/** Refresh leadership lock timestamp */
function refreshLeadership(key: string) {
  const lk = lockKeyFor(key);
  try {
    const now = Date.now();
    localStorage.setItem(lk, JSON.stringify({ tabId: TAB_ID, ts: now }));
  } catch (e) {}
}

/** Release leadership lock if owned */
function releaseLeadership(key: string) {
  const lk = lockKeyFor(key);
  try {
    const raw = localStorage.getItem(lk);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.tabId === TAB_ID) {
      localStorage.removeItem(lk);
    }
  } catch (e) {}
}

/** Type guards */
function isControlMessage(obj: unknown): obj is { __control: string } {
  return !!obj && typeof obj === 'object' && '__control' in (obj as object);
}
function isRealtimePayload(obj: unknown): obj is Payload {
  return !!obj && typeof obj === 'object' && 'eventType' in (obj as object);
}

/** Ensure channel record exists and attach BroadcastChannel listener */
function ensureChannelRecord(channelName: string, serverFilter?: string) {
  const key = makeKey(channelName, serverFilter);
  if (channels.has(key)) return channels.get(key)!;

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
  };

  // forward broadcasted payloads to local listeners
  const bcListener = (ev: MessageEvent) => {
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
          if ((target as any)[k] !== l.filter[k]) { ok = false; break; }
        }
        if (!ok) continue;
      }

      try { l.handler(payload); } catch (e) { /* swallow */ }
    }
  };

  bcEvents.addEventListener('message', bcListener);
  rec.__controlListener = bcListener;

  channels.set(key, rec);
  return rec;
}

/** Subscribe to Supabase server channel (leader only) */
async function subscribeServer(rec: ChannelRecord, channelName: string, table?: string, schema?: string, serverFilter?: string) {
  if (rec.subscribed) return;
  const ch = supabase.channel(`realtime:${rec.key}`);
  rec.channel = ch;

  const onParams: any = { event: '*', schema: schema ?? 'public' };
  if (table) onParams.table = table;
  if (serverFilter) onParams.filter = serverFilter;

  ch.on('postgres_changes', onParams, (payload: Payload) => {
    // forward to other tabs via BroadcastChannel
    try { rec.bcEvents.postMessage(payload); } catch (e) {}

    // dispatch to local listeners (leader)
    const ls = Array.from(rec.listeners);
    for (const l of ls) {
      if (l.event !== '*' && payload.eventType !== l.event) continue;
      if (l.filter && Object.keys(l.filter).length > 0) {
        const target = payload.eventType === 'DELETE' ? (payload.old ?? {}) : (payload.new ?? {});
        let ok = true;
        for (const k of Object.keys(l.filter)) {
          if ((target as any)[k] !== l.filter[k]) { ok = false; break; }
        }
        if (!ok) continue;
      }
      try { l.handler(payload); } catch (e) { /* swallow */ }
    }
  });

  await ch.subscribe(() => { /* can handle status if needed */ });

  rec.subscribed = true;
  rec.isLeader = true;

  // start leadership heartbeat
  rec.leaderHeartbeat = window.setInterval(() => refreshLeadership(rec.key), LEADER_REFRESH_MS);
}

/** Unsubscribe server channel and cleanup (leader) */
async function unsubscribeServer(rec: ChannelRecord) {
  if (!rec.subscribed || !rec.channel) return;
  try { supabase.removeChannel(rec.channel); } catch (e) {}
  rec.subscribed = false;
  rec.channel = undefined;
  rec.isLeader = false;
  if (rec.leaderHeartbeat) {
    clearInterval(rec.leaderHeartbeat);
    rec.leaderHeartbeat = null;
  }
  releaseLeadership(rec.key);

  // notify other tabs
  try { rec.bcEvents.postMessage({ __control: 'leader_left' }); } catch (e) {}
}

/**
 * Public: addRealtimeListener
 *
 * IMPORTANT:
 *  - By default this WILL NOT create a server-wide subscription if no `filter` is provided.
 *  - To intentionally subscribe to the full entity/table, pass `allowGlobal: true`.
 */
export function addRealtimeListener(opts: {
  channelName: string;
  table?: string;
  schema?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: Record<string, any>;
  allowGlobal?: boolean; // explicit opt-in for global subscription
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

  // Only attempt to subscribe to Supabase server if we have a serverFilter OR allowGlobal === true
  if (serverFilter || opts.allowGlobal) {
    const acquired = tryAcquireLeadership(key);
    if (acquired) {
      if (!rec.subscribed) {
        subscribeServer(rec, opts.channelName, opts.table, opts.schema, serverFilter).catch(() => {
          // failed subscribe -> release lock so others can try
          releaseLeadership(key);
        });
      }
    } else {
      // not leader: listen for leader-left control messages to attempt takeover
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
  } else {
    // No server subscription will be created — listeners will receive events only from BroadcastChannel.
    // This prevents accidental global subscriptions that cause heavy list_changes usage.
  }

  return id;
}

/**
 * Public: removeRealtimeListener
 * - channelName: same channelName used during addRealtimeListener
 * - listenerId: id returned by addRealtimeListener
 * - filter: pass the same filter used during registration so key matches
 */
export function removeRealtimeListener(channelName: string, listenerId: string, filter?: Record<string, any>) {
  const serverFilter = buildServerFilterString(filter);
  const key = makeKey(channelName, serverFilter);
  const rec = channels.get(key);

  // fallback: if exact key not found, try to remove by prefix (helpful if filters differ)
  if (!rec) {
    for (const [k, candidate] of channels.entries()) {
      if (k === channelName || k.startsWith(channelName + '::')) {
        candidate.listeners = candidate.listeners.filter(l => l.id !== listenerId);
        if (candidate.listeners.length === 0) {
          if (candidate.isLeader) unsubscribeServer(candidate).catch(() => {});
          try { candidate.bcEvents.close(); } catch (e) {}
          if (candidate.__controlListener) candidate.bcEvents.removeEventListener('message', candidate.__controlListener);
          channels.delete(k);
        }
        return;
      }
    }
    return;
  }

  rec.listeners = rec.listeners.filter((l) => l.id !== listenerId);

  if (rec.listeners.length === 0) {
    if (rec.isLeader) {
      unsubscribeServer(rec).catch(() => {});
    }
    try { if (rec.__controlListener) rec.bcEvents.removeEventListener('message', rec.__controlListener); } catch (e) {}
    try { rec.bcEvents.close(); } catch (e) {}
    channels.delete(key);
  }
}

/** Remove all channels and cleanup (admin/teardown) */
export function removeAllRealtimeChannels() {
  for (const [k, rec] of channels.entries()) {
    try {
      if (rec.isLeader) unsubscribeServer(rec).catch(() => {});
      if (rec.__controlListener) rec.bcEvents.removeEventListener('message', rec.__controlListener);
      rec.bcEvents.close();
    } catch (e) {}
    channels.delete(k);
  }
}
