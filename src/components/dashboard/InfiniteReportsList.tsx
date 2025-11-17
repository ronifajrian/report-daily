// src/components/dashboard/InfiniteReportsList.tsx
// Key improvements:
// 1. Clear filter button in main bar (no need to open sheet)
// 2. Mobile filter from bottom (Drawer), Desktop from side (Sheet)
// 3. Optimized animations with proper cleanup
// 4. Better state management to prevent animation lag

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Report } from './StaffDashboard';
import { ReportCard } from './ReportCard';
import { Loader2, Filter, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedNewBanner from '@/components/AnimatedNewBanner';
import SkeletonReportCard from '@/components/SkeletonReportCard';
import { ReportDetailModal } from './ReportDetailModal';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ExportReportsDialog } from './ExportReportsDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

import { useAuth } from '@/hooks/useAuth';
import { AuthenticationError } from '@/lib/authErrors';

interface InfiniteReportsListProps {
  userId?: string;
  showAuthor?: boolean;
  allUsers?: Array<{ id: string; full_name: string }>;
  userRole?: 'staff' | 'approver' | 'admin';
}

export const InfiniteReportsList = ({ 
  userId, 
  showAuthor = false, 
  allUsers = [],
  userRole 
}: InfiniteReportsListProps) => {
  const { toast } = useToast();
  const { signOut } = useAuth();
  const isMobile = useIsMobile();

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
  const [filterOpen, setFilterOpen] = useState(false);

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
  const [loadingNewReports, setLoadingNewReports] = useState(false);

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

  // Memoized values
  const hasActiveFilters = useMemo(
    () => statusFilter !== 'all' || userFilter !== 'all' || dateRange,
    [statusFilter, userFilter, dateRange]
  );

  const showFilters = useMemo(
    () => userRole === 'approver' || userRole === 'admin',
    [userRole]
  );

  const activeFilterCount = useMemo(() => {
    return [statusFilter !== 'all', userFilter !== 'all', dateRange].filter(Boolean).length;
  }, [statusFilter, userFilter, dateRange]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setStatusFilter('all');
    setUserFilter('all');
    setDateRange(undefined);
  }, []);

  // ---------------- safe fetchReports ----------------
  const fetchReports = useCallback(async (pageNum: number, reset = false) => {
    if (loadingRef.current) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { throw new AuthenticationError("No session token"); }

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

      // if (res.status === 401 || res.status === 403) {
      //   window.location.href = '/';
      //   return;
      // }
      // if (!res.ok) throw new Error('Failed to fetch reports');

      if (res.status === 401 || res.status === 403) {
        throw new AuthenticationError("Authentication failed");
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch reports: ${res.statusText}`);
      }

      const result = await res.json();
      const incoming: Report[] = result.data ?? [];

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
      if (err instanceof AuthenticationError) {
        // Ini adalah error auth. Panggil signOut() yang aman
        console.warn('[InfiniteReportsList] Auth error, triggering sign out.');
        signOut(); // signOut dari useAuth sudah punya pelindung loop
      } else {
        // Ini error lain (jaringan, 500, dll)
        console.error('Failed to fetch reports:', err);
        toast?.({ title: 'Error', description: err?.message ?? 'Failed to fetch', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [userId, statusFilter, userFilter, dateRange, searchQuery, toast, signOut]);

  // -------------- fetchReportsSince (for banner) --------------
  const fetchReportsSince = useCallback(async (sinceIso: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { throw new AuthenticationError("No session token"); };

      const params = new URLSearchParams({ page: '1', limit: '50', startDate: sinceIso });
      if (userId) params.append('userId', userId);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (userFilter && userFilter !== 'all') params.append('staffId', userFilter);

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.status === 401 || res.status === 403) {
        throw new AuthenticationError("Authentication failed");
      }
      if (!res.ok) throw new Error('Failed to fetch new reports');
      
      const result = await res.json();
      return result.data ?? [];
    } catch (e) {
      console.warn('fetchReportsSince failed', e);
      throw e;
    }
  }, [userId, statusFilter, userFilter ,signOut]);

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

  // ---------------- IntersectionObserver ----------------
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

  // --------------- Realtime ---------------
  useEffect(() => {
    const isStaff = userRole === 'staff';
    const channelName = `reports-sub-${userRole ?? 'anon'}-${userId ?? 'all'}`;
    const filterStr = (isStaff && userId) ? `user_id=eq.${userId}` : undefined;

    realtimeChannelRef.current = channelName;
    realtimeFilterRef.current = filterStr;
    const chan = supabase.channel(channelName);

    // --- FUNGSI UNTUK LAPORAN BARU ---
    const onInsert = (payload: any) => {
      try {
        const record = payload?.record ?? payload?.new ?? payload?.payload ?? null;
        if (!record) return;

        if (reportsRef.current.some(r => r.id === record.id)) return;
        if (newReportsBufferRef.current.some(r => r.id === record.id)) return;

        newReportsBufferRef.current = [record, ...newReportsBufferRef.current];
        setNewCount(newReportsBufferRef.current.length);
        setShowNewBanner(true);
      } catch (e) {}
    };

    // --- INI SOLUSINYA: FUNGSI UNTUK LAPORAN YANG DI-UPDATE ---
    const onUpdate = (payload: any) => {
      try {
        const updatedRecord = payload?.new ?? payload?.record ?? null;
        if (!updatedRecord) return;

        setReports(prevReports => {
          const index = prevReports.findIndex(r => r.id === updatedRecord.id);

          if (index === -1) {
            return prevReports; // Laporan tidak ada di daftar, abaikan
          }

          // --- PERBAIKAN ---
          // 1. Ambil data laporan LAMA (yang punya 'profiles')
          const oldReport = prevReports[index];
          
          // 2. Gabungkan data lama dengan data baru
          const mergedReport = { 
            ...oldReport, // Menyimpan 'profiles' dan data lama lainnya
            ...updatedRecord // Menimpa 'status', 'rejection_reason', dll.
          };
          // --- AKHIR PERBAIKAN ---

          // 3. Buat array baru dengan data yang sudah digabung
          const newReports = [...prevReports];
          newReports[index] = mergedReport as Report;
          return newReports;
        });
      } catch (e) {
        console.warn("[REALTIME] Gagal memproses UPDATE:", e);
      }
    };

    // --- SUBSCRIBE KE KEDUA EVENT: INSERT DAN UPDATE ---
    if (filterStr) {
      chan.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_reports', filter: filterStr }, onInsert);
      chan.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'daily_reports', filter: filterStr }, onUpdate); // <-- TAMBAHKAN INI
    } else {
      chan.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_reports' }, onInsert);
      chan.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'daily_reports' }, onUpdate); // <-- TAMBAHKAN INI
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
      } catch (_) {}
    };
  }, [userId, userRole]); // Dependency tetap sama

  // ------------- PREPEND -------------
  const onClickShowNew = useCallback(async () => {
    if (loadingNewReports) return; // Prevent double click
    
    setLoadingNewReports(true);
    // const children = Array.from(reportsContainerRef.current?.children ?? []) as HTMLElement[];
    // let firstVisibleEl: HTMLElement | null = null;
    // for (const el of children) {
    //   if (!el.dataset || !el.dataset.reportId) continue;
    //   const rect = el.getBoundingClientRect();
    //   if (rect.bottom > 0) { firstVisibleEl = el; break; }
    // }
    // const firstVisibleId = firstVisibleEl?.dataset?.reportId ?? null;
    // const firstVisibleTop = firstVisibleEl ? firstVisibleEl.getBoundingClientRect().top : null;

    // const prevScroll = window.scrollY;
    // const prevHeight = reportsContainerRef.current?.scrollHeight ?? document.body.scrollHeight;

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
        setLoadingNewReports(false);
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
              window.scrollTo({
                top: 0,
                behavior: 'smooth'
              });
              setLoadingNewReports(false);
            });
      } catch (e: any) {

      if (e instanceof AuthenticationError) {
        console.warn('[InfiniteReportsList] Auth error on show new, signing out.');
        signOut();
        setLoadingNewReports(false);
        return; // Hentikan proses fallback
      }

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
      setLoadingNewReports(false);
	  }
  }, [fetchReportsSince, loadingNewReports, signOut]);

  // handle report click
  const handleReportClick = useCallback((reportId: string) => {
    setSelectedReportId(reportId);
    setDetailModalOpen(true);
  }, []);

  // handle close modal
  const handleCloseDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setTimeout(() => setSelectedReportId(null), 300);
  }, []);

  // handle report updated - IMPROVED
  const handleReportUpdated = useCallback(() => {
    // Simple approach: reset everything and fetch from page 1
    setReports([]);
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    hasMoreRef.current = true;
    newReportsBufferRef.current = [];
    setNewCount(0);
    setShowNewBanner(false);
    fetchReports(1, true);
  }, [fetchReports]);

  // Filter Content Component (reusable for both Sheet and Drawer)
  const FilterContent = () => (
    <div className="space-y-4 py-4">
      {/* Status Filter */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Status</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Staff Filter */}
      {allUsers.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Staff</Label>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {allUsers.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => {
            clearFilters();
            setFilterOpen(false);
          }}
          className="w-full"
        >
          <X className="h-4 w-4 mr-2" />
          Clear All Filters
        </Button>
      )}
    </div>
  );

  // ---------------- render ----------------
  return (
    <>
      <div className="w-full">
        {/* Filter Bar for Approver/Admin */}
        {showFilters && (
          <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b mb-4">
            <div className="flex items-center gap-2 p-3 flex-wrap">
              {/* Mobile: Drawer from bottom, Desktop: Sheet from left */}
              {isMobile ? (
                <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
                  <DrawerTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="px-4">
                    <DrawerHeader>
                      <DrawerTitle>Filter Reports</DrawerTitle>
                      <DrawerDescription>
                        Filter reports by status, staff, or date range
                      </DrawerDescription>
                    </DrawerHeader>
                    <FilterContent />
                  </DrawerContent>
                </Drawer>
              ) : (
                <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80">
                    <SheetHeader>
                      <SheetTitle>Filter Reports</SheetTitle>
                      <SheetDescription>
                        Filter reports by status, staff, or date range
                      </SheetDescription>
                    </SheetHeader>
                    <FilterContent />
                  </SheetContent>
                </Sheet>
              )}

              {/* Export Button */}
              <ExportReportsDialog userRole={userRole!} />

              {/* Clear Filters Button - Direct access */}
              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearFilters}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear Filters
                </Button>
              )}

              {/* Active Filters Display */}
              {hasActiveFilters && (
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {statusFilter !== 'all' && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      Status: {statusFilter}
                    </span>
                  )}
                  {userFilter !== 'all' && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      {allUsers.find(u => u.id === userFilter)?.full_name}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showNewBanner && newCount > 0 && (
            <motion.div
              key="new-banner"
              initial={{ y: -18, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -18, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="fixed top-4 z-40 w-full md:w-auto md:left-1/2 md:-translate-x-1/2 pointer-events-none"
            >
              {/* ✅ NEW: Show loading state on banner */}
              <motion.button
                onClick={onClickShowNew}
                disabled={loadingNewReports}
                className="mx-auto w-fit md:mx-0 rounded-full bg-white/95 px-4 py-2 shadow-md border border-gray-100 flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed pointer-events-auto"
                role="status"
                aria-live="polite"
              >
                {loadingNewReports ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <div className="text-sm font-medium text-foreground">Loading...</div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                        {newCount}
                      </span>
                      <div className="text-sm font-medium text-foreground">
                        new report{newCount > 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-muted-foreground ml-2">Tap to view</div>
                    </div>
                  </>
                )}
              </motion.button>            
		  </motion.div>
          )}
        </AnimatePresence>

        <div ref={reportsContainerRef}>
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