// src/components/dashboard/InfiniteReportsList.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Report } from './StaffDashboard';
import { ReportCard } from './ReportCard';
import { Loader2, Filter, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { AnimatePresence, motion } from 'framer-motion';
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

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [filterOpen, setFilterOpen] = useState(false);

  const reportsRef = useRef<Report[]>([]);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);

  const observerTarget = useRef<HTMLDivElement | null>(null);
  const reportsContainerRef = useRef<HTMLDivElement | null>(null);

  const newReportsBufferRef = useRef<Report[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [showNewBanner, setShowNewBanner] = useState(false);
  const [loadingNewReports, setLoadingNewReports] = useState(false);

  const latestTimestampRef = useRef<string | null>(null);
  const reportsUpdatesListenerRef = useRef<RealtimeChannel | null>(null);

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => { reportsRef.current = reports; }, [reports]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const hasActiveFilters = useMemo(
    () => statusFilter !== 'all' || userFilter !== 'all',
    [statusFilter, userFilter]
  );

  const showFilters = useMemo(
    () => userRole === 'approver' || userRole === 'admin',
    [userRole]
  );

  const activeFilterCount = useMemo(() => {
    return [statusFilter !== 'all', userFilter !== 'all'].filter(Boolean).length;
  }, [statusFilter, userFilter]);

  const clearFilters = useCallback(() => {
    setStatusFilter('all');
    setUserFilter('all');
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchReports = useCallback(async (pageNum: number, reset = false) => {
    if (loadingRef.current) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new AuthenticationError("No session token");
      }

      const params = new URLSearchParams({ 
        page: pageNum.toString(), 
        limit: '15'
      });
      
      if (userId) params.append('userId', userId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (userFilter !== 'all') params.append('staffId', userFilter);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-reports?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: abortControllerRef.current.signal
        }
      );

      if (res.status === 401 || res.status === 403) {
        throw new AuthenticationError("Authentication failed");
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
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

      setHasMore(!!result.hasMore);
      hasMoreRef.current = !!result.hasMore;

      if ((reset || pageNum === 1) && incoming.length > 0) {
        latestTimestampRef.current = incoming[0].created_at;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      
      if (err instanceof AuthenticationError) {
        signOut();
      } else {
        toast?.({ 
          title: 'Error', 
          description: err?.message ?? 'Failed to fetch', 
          variant: 'destructive' 
        });
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [userId, statusFilter, userFilter, toast, signOut]);

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
  }, [statusFilter, userFilter, userId, fetchReports]);

  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    let cancelled = false;

    const createObserver = () => {
      if (!observerTarget.current) return;
      
      observer = new IntersectionObserver(
        async (entries) => {
          if (!entries[0].isIntersecting) return;
          if (loadingRef.current || !hasMoreRef.current) return;
          
          if (observer) observer.disconnect();

          const nextPage = pageRef.current + 1;
          await fetchReports(nextPage, false);

          setTimeout(() => {
            if (!cancelled && observer && observerTarget.current && hasMoreRef.current) {
              try {
                observer.observe(observerTarget.current!);
              } catch {}
            }
          }, 300);
        },
        { 
          threshold: 0.1, 
          root: null, 
          rootMargin: '300px'
        }
      );

      try {
        observer.observe(observerTarget.current!);
      } catch {}
    };

    createObserver();
    
    return () => {
      cancelled = true;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }, [fetchReports]);

  useEffect(() => {
    const isStaff = userRole === 'staff';
    const channelName = `reports-sub-${userRole ?? 'anon'}-${userId ?? 'all'}`;
    const filterStr = (isStaff && userId) ? `user_id=eq.${userId}` : undefined;

    const chan = supabase.channel(channelName);

    const onInsert = (payload: any) => {
      try {
        const record = payload?.record ?? payload?.new ?? null;
        if (!record) return;

        if (reportsRef.current.some(r => r.id === record.id)) return;
        if (newReportsBufferRef.current.some(r => r.id === record.id)) return;

        newReportsBufferRef.current = [record, ...newReportsBufferRef.current];
        setNewCount(newReportsBufferRef.current.length);
        setShowNewBanner(true);
      } catch {}
    };

    const onUpdate = (payload: any) => {
      try {
        const updatedRecord = payload?.new ?? payload?.record ?? null;
        if (!updatedRecord) return;

        setReports(prevReports => {
          const index = prevReports.findIndex(r => r.id === updatedRecord.id);
          if (index === -1) return prevReports;

          const oldReport = prevReports[index];
          const mergedReport = { ...oldReport, ...updatedRecord };
          
          const newReports = [...prevReports];
          newReports[index] = mergedReport as Report;
          return newReports;
        });
      } catch {}
    };

    if (filterStr) {
      chan.on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'daily_reports', 
        filter: filterStr 
      }, onInsert);
      chan.on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'daily_reports', 
        filter: filterStr 
      }, onUpdate);
    } else {
      chan.on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'daily_reports' 
      }, onInsert);
      chan.on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'daily_reports' 
      }, onUpdate);
    }

    const sub = chan.subscribe();
    reportsUpdatesListenerRef.current = sub;

    return () => {
      try {
        if (reportsUpdatesListenerRef.current) {
          supabase.removeChannel(reportsUpdatesListenerRef.current);
          reportsUpdatesListenerRef.current = null;
        } else {
          supabase.removeChannel(chan);
        }
      } catch {}
    };
  }, [userId, userRole]);

  const onClickShowNew = useCallback(async () => {
    if (loadingNewReports) return;
    setLoadingNewReports(true);

    try {
      const fallback = newReportsBufferRef.current.slice();
      
      setReports(prev => {
        const existing = new Set(prev.map(r => r.id));
        const filtered = fallback.filter(i => !existing.has(i.id));
        const merged = [...filtered, ...prev];
        if (merged.length > 0) {
          latestTimestampRef.current = merged[0].created_at;
        }
        return merged;
      });

      newReportsBufferRef.current = [];
      setShowNewBanner(false);
      setNewCount(0);

      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setLoadingNewReports(false);
      });
    } catch (e) {
      setLoadingNewReports(false);
    }
  }, [loadingNewReports]);

  const handleReportClick = useCallback((reportId: string) => {
    setSelectedReportId(reportId);
    setDetailModalOpen(true);
  }, []);

  const handleCloseDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setTimeout(() => setSelectedReportId(null), 300);
  }, []);

  const handleReportUpdated = useCallback(() => {
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

  // Filter Content
  const renderFilterContent = () => (
    <div className="space-y-4 py-4">
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

  return (
    <>
      <div className="w-full">
        {showFilters && (
          <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b mb-4">
            <div className="flex items-center gap-2 p-3 flex-wrap">
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
                        Filter reports by status and staff
                      </DrawerDescription>
                    </DrawerHeader>
                    {renderFilterContent()}
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
                        Filter reports by status and staff
                      </SheetDescription>
                    </SheetHeader>
                    {renderFilterContent()}
                  </SheetContent>
                </Sheet>
              )}

              <ExportReportsDialog userRole={userRole!} />

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                  <X className="h-4 w-4" />
                  Clear Filters
                </Button>
              )}

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
              <motion.button
                onClick={onClickShowNew}
                disabled={loadingNewReports}
                className="mx-auto w-fit md:mx-0 rounded-full bg-white/95 px-4 py-2 shadow-md border border-gray-100 flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed pointer-events-auto"
              >
                {loadingNewReports ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <div className="text-sm font-medium text-foreground">Loading...</div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                      {newCount}
                    </span>
                    <div className="text-sm font-medium text-foreground">
                      new report{newCount > 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-muted-foreground ml-2">Tap to view</div>
                  </div>
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
                  layout={!isScrolling}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ 
                    duration: isScrolling ? 0.1 : 0.22, 
                    delay: isScrolling ? 0 : idx * 0.01 
                  }}
                >
                  <div data-report-id={r.id} className="rounded-2xl">
                    <ReportCard 
                      report={r} 
                      onClick={() => handleReportClick(r.id)} 
                      showAuthor={showAuthor} 
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div ref={observerTarget} style={{ height: 1, width: '100%' }} />

          <div className="py-4 text-center">
            {loading && <Loader2 className="inline-block animate-spin" />}
            {!hasMore && reports.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="text-sm text-muted-foreground"
              >
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