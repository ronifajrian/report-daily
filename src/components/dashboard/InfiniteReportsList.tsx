// src/components/dashboard/InfiniteReportsList.tsx - OPTIMIZED
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Report } from './StaffDashboard';
import { ReportCard } from './ReportCard';
import { Loader2, Filter, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AnimatePresence, motion } from 'framer-motion';
import SkeletonReportCard from '@/components/SkeletonReportCard';
import { ReportDetailModal } from './ReportDetailModal';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ExportReportsDialog } from './ExportReportsDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useAuth } from '@/hooks/useAuth';
import { AuthenticationError } from '@/lib/authErrors';

interface InfiniteReportsListProps {
  userId?: string;
  showAuthor?: boolean;
  allUsers?: Array<{ id: string; full_name: string }>;
  userRole?: 'staff' | 'approver' | 'admin';
}

// ✅ OPTIMIZATION 1: Shared fetch cache to prevent duplicate requests
const fetchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

// ✅ OPTIMIZATION 2: Request deduplication
const inflightRequests = new Map<string, Promise<any>>();

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

  const newReportsBufferRef = useRef<Report[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [showNewBanner, setShowNewBanner] = useState(false);

  const latestTimestampRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const [isScrolling, setIsScrolling] = useState(false);

  // ✅ OPTIMIZATION 3: Debounced scroll detection
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

  // ✅ OPTIMIZATION 4: Cached fetch with deduplication
  const fetchReports = useCallback(async (pageNum: number, reset = false) => {
    if (loadingRef.current) return;
    
    const cacheKey = `${userId}-${statusFilter}-${userFilter}-${pageNum}`;
    
    // Check cache first
    const cached = fetchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const incoming: Report[] = cached.data ?? [];
      if (reset) {
        setReports(incoming);
        setPage(1);
        pageRef.current = 1;
      } else {
        const existingIds = new Set(reportsRef.current.map(r => r.id));
        const uniqueIncoming = incoming.filter(i => !existingIds.has(i.id));
        if (uniqueIncoming.length > 0) {
          setReports(prev => [...prev, ...uniqueIncoming]);
          setPage(pageNum);
          pageRef.current = pageNum;
        }
      }
      setHasMore(incoming.length === 15); // Assume more if full page
      hasMoreRef.current = incoming.length === 15;
      return;
    }

    // Deduplicate inflight requests
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey);
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setLoading(true);
    
    const fetchPromise = (async () => {
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
            signal: abortControllerRef.current!.signal
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

        // Cache the result
        fetchCache.set(cacheKey, { data: incoming, timestamp: Date.now() });

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
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
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
    
    // Clear cache when filters change
    fetchCache.clear();

    fetchReports(1, true);
  }, [statusFilter, userFilter, userId, fetchReports]);

  // ✅ OPTIMIZATION 5: Improved IntersectionObserver with larger threshold
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
          rootMargin: '500px' // ✅ Larger margin for smoother loading
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

  // ✅ OPTIMIZATION 6: Single channel for all realtime updates
  useEffect(() => {
    // Cleanup old channel
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch {}
      channelRef.current = null;
    }

    const isStaff = userRole === 'staff';
    const channelName = `reports-optimized-${userRole ?? 'anon'}-${userId ?? 'all'}`;
    
    const chan = supabase.channel(channelName);

    // ✅ Throttle realtime updates to reduce processing
    let updateTimeout: NodeJS.Timeout | null = null;
    const pendingUpdates = new Set<string>();

    const processUpdates = () => {
      if (pendingUpdates.size === 0) return;
      
      setReports(prevReports => {
        const updated = [...prevReports];
        let changed = false;
        
        for (const id of pendingUpdates) {
          const index = updated.findIndex(r => r.id === id);
          if (index !== -1) {
            // Mark for refetch instead of inline update
            changed = true;
          }
        }
        
        pendingUpdates.clear();
        return changed ? updated : prevReports;
      });
    };

    const onInsert = async (payload: any) => { // Tambahkan async
      try {
        const rawRecord = payload?.record ?? payload?.new ?? null;
        if (!rawRecord) return;

        // Cek duplikasi dulu sebelum fetch network
        if (reportsRef.current.some(r => r.id === rawRecord.id)) return;
        if (newReportsBufferRef.current.some(r => r.id === rawRecord.id)) return;

        // ✅ FIX: Fetch data lengkap beserta relasi profiles
        const { data: fullRecord, error } = await supabase
          .from('daily_reports')
          .select(`
            *,
            profiles (
              full_name
            )
          `)
          .eq('id', rawRecord.id)
          .single();

        if (error || !fullRecord) return;

        // Gunakan data lengkap (fullRecord), bukan data mentah (rawRecord)
        newReportsBufferRef.current = [fullRecord as Report, ...newReportsBufferRef.current];
        setNewCount(newReportsBufferRef.current.length);
        setShowNewBanner(true);
      } catch (err) {
        console.error("Error handling realtime insert:", err);
      }
    };

    const onUpdate = async (payload: any) => {
      try {
        const updatedId = payload.new?.id;
        if (!updatedId) return;

        // 1. Fetch data terbaru dari server (supaya dapat status baru & profil)
        const { data: freshReport, error } = await supabase
          .from('daily_reports')
          .select(`
            *,
            profiles (
              full_name
            )
          `)
          .eq('id', updatedId)
          .single();

        if (error || !freshReport) return;

        // 2. Langsung update state 'reports' di layar
        setReports(prevReports => {
          // Cek apakah report ini ada di list yang sedang tampil
          const index = prevReports.findIndex(r => r.id === updatedId);
          
          if (index === -1) return prevReports; // Tidak ada di layar, abaikan

          // Salin array lama
          const newReports = [...prevReports];
          
          // Ganti report lama dengan yang baru (status sudah approved/rejected)
          newReports[index] = freshReport as Report;
          
          return newReports;
        });

        // Optional: Jika report sedang dibuka di modal detail, update juga
        if (selectedReportId === updatedId) {
          // Logic untuk update modal jika perlu (biasanya modal punya fetch sendiri)
        }

      } catch (err) {
        console.error("Error handling realtime update:", err);
      }
    };

    if (isStaff && userId) {
      chan.on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'daily_reports', 
        filter: `user_id=eq.${userId}` 
      }, onInsert);
      chan.on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'daily_reports', 
        filter: `user_id=eq.${userId}` 
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

    chan.subscribe();
    channelRef.current = chan;

    return () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      try {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      } catch {}
    };
  }, [userId, userRole]);

  const onClickShowNew = useCallback(async () => {
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
    });
  }, []);

  const handleReportClick = useCallback((reportId: string) => {
    setSelectedReportId(reportId);
    setDetailModalOpen(true);
  }, []);

  const handleCloseDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setTimeout(() => setSelectedReportId(null), 300);
  }, []);

  const handleReportUpdated = useCallback(() => {
    fetchCache.clear(); // Clear cache on update
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
                <>
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                    <X className="h-4 w-4" />
                    Clear Filters
                  </Button>
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
                </>
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
                className="mx-auto w-fit md:mx-0 rounded-full bg-white/95 px-4 py-2 shadow-md border border-gray-100 flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-primary pointer-events-auto"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                    {newCount}
                  </span>
                  <div className="text-sm font-medium text-foreground">
                    new report{newCount > 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-muted-foreground ml-2">Tap to view</div>
                </div>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
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