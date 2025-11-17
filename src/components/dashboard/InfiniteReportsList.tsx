// src/components/dashboard/InfiniteReportsList.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Report } from './StaffDashboard';
import { ReportCard } from './ReportCard';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedNewBanner from '@/components/AnimatedNewBanner';
import SkeletonReportCard from '@/components/SkeletonReportCard';
import { ReportDetailModal } from './ReportDetailModal';

interface InfiniteReportsListProps {
  userId?: string;
  showAuthor?: boolean;
  allUsers?: Array<{ id: string; full_name: string }>;
  userRole?: 'staff' | 'approver' | 'admin';
}

export const InfiniteReportsList = ({ userId, showAuthor = false, userRole }: InfiniteReportsListProps) => {
  const { toast } = useToast();

  // visible state
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  // refs for stable closures
  const reportsRef = useRef<Report[]>([]);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);

  // DOM refs
  const observerTarget = useRef<HTMLDivElement | null>(null);
  const reportsContainerRef = useRef<HTMLDivElement | null>(null);

  // realtime buffer + banner
  const newReportsBufferRef = useRef<Report[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [showNewBanner, setShowNewBanner] = useState(false);
  const latestTimestampRef = useRef<string | null>(null);

  // listener bookkeeping
  const reportsUpdatesListenerRef = useRef<RealtimeChannel | null>(null);
  const realtimeChannelRef = useRef<string | null>(null);
  const realtimeFilterRef = useRef<any | undefined>(undefined);

  // Modal state
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // sync refs with state
  useEffect(() => { reportsRef.current = reports; }, [reports]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  // ---------------- safe fetchReports ----------------
  const fetchReports = useCallback(async (pageNum: number, reset = false) => {
    if (loadingRef.current) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }

      const params = new URLSearchParams({ page: pageNum.toString(), limit: '10' });
      if (userId) params.append('userId', userId);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (userFilter && userFilter !== 'all') params.append('staffId', userFilter);
      if (dateRange?.from) {
        params.append('startDate', dateRange.from.toISOString());
        if (dateRange.to) params.append('endDate', new Date(dateRange.to.setHours(23,59,59,999)).toISOString());
      }
      if (searchQuery) params.append('q', searchQuery);

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.status === 401 || res.status === 403) {
        window.location.href = '/';
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch reports');

      const result = await res.json();
      const incoming: Report[] = result.data ?? [];

      // dedupe
      const existingIds = new Set(reportsRef.current.map(r => r.id));
      const uniqueIncoming = incoming.filter(i => !existingIds.has(i.id));

      if (reset) {
        setReports(uniqueIncoming);
        setPage(1);
        pageRef.current = 1;
      } else {
        if (uniqueIncoming.length > 0) {
          setReports(prev => [...prev, ...uniqueIncoming]);
          setPage(pageNum);
          pageRef.current = pageNum;
        } else {
          if (incoming.length === 0) {
            setHasMore(false);
            hasMoreRef.current = false;
          } else {
            setPage(prev => prev + 1);
            pageRef.current = pageRef.current + 1;
          }
        }
      }

      const serverHasMore = !!result.hasMore;
      setHasMore(serverHasMore);
      hasMoreRef.current = serverHasMore;

      if ((reset || pageNum === 1) && incoming.length > 0) {
        latestTimestampRef.current = incoming[0].created_at;
      }
    } catch (err: any) {
      toast?.({ title: 'Error', description: err?.message ?? 'Failed to fetch', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [userId, statusFilter, userFilter, dateRange, searchQuery, toast]);

  // -------------- fetchReportsSince (for banner) --------------
  const fetchReportsSince = useCallback(async (sinceIso: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return [] as Report[];

      const params = new URLSearchParams({ page: '1', limit: '50', startDate: sinceIso });
      if (userId) params.append('userId', userId);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (userFilter && userFilter !== 'all') params.append('staffId', userFilter);

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) return [];
      const result = await res.json();
      return result.data ?? [];
    } catch (e) {
      console.warn('fetchReportsSince failed', e);
      return [];
    }
  }, [userId, statusFilter, userFilter]);

  // ---------------- initial/reset on filter change ----------------
  useEffect(() => {
    setReports([]);
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    hasMoreRef.current = true;
    newReportsBufferRef.current = [];
    setNewCount(0);
    setShowNewBanner(false);

    fetchReports(1, true);
  }, [statusFilter, userFilter, dateRange, userId, searchQuery, fetchReports]);

  // ---------------- IntersectionObserver (pause/resume) ----------------
  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    let cancelled = false;

    const createObserver = () => {
      if (!observerTarget.current) return;
      observer = new IntersectionObserver(async (entries) => {
        if (!entries[0].isIntersecting) return;
        if (loadingRef.current || !hasMoreRef.current) return;
        if (observer) observer.disconnect();

        const nextPage = pageRef.current + 1;
        await fetchReports(nextPage, false);

        setTimeout(() => {
          if (!cancelled && observer && observerTarget.current && hasMoreRef.current) {
            try { observer.observe(observerTarget.current); } catch (_) {}
          }
        }, 150);
      }, { threshold: 0.1, root: null, rootMargin: '200px' });

      try { observer.observe(observerTarget.current!); } catch (_) {}
    };

    createObserver();
    return () => {
      cancelled = true;
      if (observer) observer.disconnect();
      observer = null;
    };
  }, [fetchReports]);

  // --------------- Realtime (role-aware) ---------------
  useEffect(() => {
    const isStaff = userRole === 'staff';
    const channelName = `reports-sub-${userRole ?? 'anon'}-${userId ?? 'all'}`;
    const filterStr = (isStaff && userId) ? `user_id=eq.${userId}` : undefined;

    realtimeChannelRef.current = channelName;
    realtimeFilterRef.current = filterStr;

    const chan = supabase.channel(channelName);

    const onInsert = (payload: any) => {
      try {
        const record = payload?.record ?? payload?.new ?? payload?.payload ?? null;
        if (!record) return;

        if (reportsRef.current.some(r => r.id === record.id)) return;
        if (newReportsBufferRef.current.some(r => r.id === record.id)) return;

        newReportsBufferRef.current = [record, ...newReportsBufferRef.current];
        setNewCount(newReportsBufferRef.current.length);
        setShowNewBanner(true);
      } catch (e) {
        // ignore
      }
    };

    if (filterStr) {
      chan.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_reports', filter: filterStr }, onInsert);
    } else {
      chan.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_reports' }, onInsert);
    }

    const sub = chan.subscribe();
    reportsUpdatesListenerRef.current = sub;

    return () => {
      try {
        if (reportsUpdatesListenerRef.current) {
          supabase.removeChannel(reportsUpdatesListenerRef.current);
          reportsUpdatesListenerRef.current = null;
        } else {
          try { supabase.removeChannel(chan); } catch (_) {}
        }
      } catch (_) {
        // ignore
      }
    };
  }, [userId, userRole]);

  // ------------- PREPEND with pixel-perfect preserve -------------
  const onClickShowNew = useCallback(async () => {
    const children = Array.from(reportsContainerRef.current?.children ?? []) as HTMLElement[];
    let firstVisibleEl: HTMLElement | null = null;
    for (const el of children) {
      if (!el.dataset || !el.dataset.reportId) continue;
      const rect = el.getBoundingClientRect();
      if (rect.bottom > 0) { firstVisibleEl = el; break; }
    }
    const firstVisibleId = firstVisibleEl?.dataset?.reportId ?? null;
    const firstVisibleTop = firstVisibleEl ? firstVisibleEl.getBoundingClientRect().top : null;

    const prevScroll = window.scrollY;
    const prevHeight = reportsContainerRef.current?.scrollHeight ?? document.body.scrollHeight;

    try {
      let newItems: Report[] = [];
      if (latestTimestampRef.current) {
        newItems = await fetchReportsSince(latestTimestampRef.current);
        const existingIds = new Set(reportsRef.current.map(r => r.id));
        newItems = newItems.filter(i => !existingIds.has(i.id));
      }

      if (newItems.length === 0 && newReportsBufferRef.current.length > 0) {
        newItems = newReportsBufferRef.current.slice();
      }

      if (newItems.length === 0) {
        newReportsBufferRef.current = [];
        setShowNewBanner(false);
        setNewCount(0);
        return;
      }

      setReports(prev => {
        const existing = new Set(prev.map(r => r.id));
        const filtered = newItems.filter(i => !existing.has(i.id));
        const merged = [...filtered, ...prev];
        if (merged.length > 0) latestTimestampRef.current = merged[0].created_at;
        return merged;
      });

      newReportsBufferRef.current = [];
      setShowNewBanner(false);
      setNewCount(0);

      requestAnimationFrame(() => {
        if (firstVisibleId && firstVisibleTop != null) {
          const newChildren = Array.from(reportsContainerRef.current?.children ?? []) as HTMLElement[];
          const sameEl = newChildren.find((el) => el.dataset && el.dataset.reportId === firstVisibleId);
          if (sameEl) {
            const newTop = sameEl.getBoundingClientRect().top;
            const delta = newTop - firstVisibleTop;
            window.scrollBy(0, delta);
            return;
          }
        }
        const newHeight = reportsContainerRef.current?.scrollHeight ?? document.body.scrollHeight;
        const added = newHeight - prevHeight;
        window.scrollTo(0, prevScroll + added);
      });
    } catch (e) {
      const fallback = newReportsBufferRef.current.slice();
      if (fallback.length > 0) {
        setReports(prev => {
          const existing = new Set(prev.map(r => r.id));
          const filtered = fallback.filter(i => !existing.has(i.id));
          const merged = [...filtered, ...prev];
          if (merged.length > 0) latestTimestampRef.current = merged[0].created_at;
          return merged;
        });
        newReportsBufferRef.current = [];
        setShowNewBanner(false);
        setNewCount(0);
      }
    }
  }, [fetchReportsSince]);

  // handle report click - open modal
  const handleReportClick = useCallback((reportId: string) => {
    setSelectedReportId(reportId);
    setDetailModalOpen(true);
  }, []);

  // handle close modal
  const handleCloseDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    // Delay clearing reportId to allow modal close animation
    setTimeout(() => setSelectedReportId(null), 300);
  }, []);

  // handle report updated
  const handleReportUpdated = useCallback(() => {
    // Refresh current page to show updates
    fetchReports(1, true);
  }, [fetchReports]);

  // ---------------- render ----------------
  return (
    <>
      <div className="w-full">
        <AnimatePresence>
          {showNewBanner && newCount > 0 && (
            <motion.div
              key="new-banner"
              initial={{ y: -18, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -18, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="sticky top-3 z-30"
            >
              <AnimatedNewBanner count={newCount} onClick={onClickShowNew} />
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={reportsContainerRef}>
          {/* initial / page load skeletons */}
          {reports.length === 0 && loading && (
            <div className="space-y-3 px-2">
              <SkeletonReportCard />
              <SkeletonReportCard />
              <SkeletonReportCard />
            </div>
          )}

          <div className="space-y-3 px-2">
            <AnimatePresence initial={false}>
              {reports.map((r, idx) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, delay: idx * 0.01 }}
                >
                  <div data-report-id={r.id} className="rounded-2xl">
                    <ReportCard report={r} onClick={() => handleReportClick(r.id)} showAuthor={showAuthor} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* sentinel after list */}
          <div ref={observerTarget} style={{ height: 1, width: '100%' }} />

          <div className="py-4 text-center">
            {loading && <Loader2 className="inline-block animate-spin" />}
            {!hasMore && reports.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted-foreground">
                No more reports
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Report Detail Modal - Twitter-style fullscreen */}
      <ReportDetailModal
        reportId={selectedReportId}
        open={detailModalOpen}
        onClose={handleCloseDetailModal}
        onReportUpdated={handleReportUpdated}
      />
    </>
  );
};

export default InfiniteReportsList;