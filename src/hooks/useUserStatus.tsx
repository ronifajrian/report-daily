// useUserStatus.tsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { addRealtimeListener, removeRealtimeListener } from '@/integrations/supabase/realtime';

export const useUserStatus = (userId: string | undefined) => {
  const [status, setStatus] = useState<'pending' | 'active' | 'inactive' | 'awaiting_reset' | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const listenerRef = useRef<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setStatus(data.status as 'pending' | 'active' | 'inactive' | 'awaiting_reset');
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    await fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let mounted = true;
    fetchStatus();

    // Set up realtime subscription with throttling
    let lastUpdate = 0;
    const THROTTLE_MS = 2000; // Only process updates every 2 seconds

    const listenerId = addRealtimeListener({
      channelName: `profile-status-${userId}`,
      table: 'profiles',
      schema: 'public',
      event: 'UPDATE',
      filter: { id: userId },
      handler: (payload: any) => {
        const now = Date.now();
        if (now - lastUpdate < THROTTLE_MS) {
          // throttled
          return;
        }
        lastUpdate = now;

        if (payload.new && 'status' in payload.new) {
          setStatus(payload.new.status as 'pending' | 'active' | 'inactive' | 'awaiting_reset');
        }
      }
    });

    listenerRef.current = listenerId;

    return () => {
      if (listenerRef.current) {
        removeRealtimeListener(`profile-status-${userId}`, listenerRef.current, { id: userId });
        listenerRef.current = null;
      }
      mounted = false;
    };
  }, [userId, fetchStatus]);

  return { status, loading, refreshing, refreshStatus };
};
