import { useState, useEffect, useRef, useCallback } from 'react';
import { Report } from './StaffDashboard';
import { ReportCard } from './ReportCard';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Calendar as CalendarIcon, X, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { addRealtimeListener, removeRealtimeListener } from '@/integrations/supabase/realtime';
import type { DateRange } from 'react-day-picker';
import { useToast } from '@/hooks/use-toast';

interface InfiniteReportsListProps {
  userId?: string;
  showAuthor?: boolean;
  allUsers?: Array<{ id: string; full_name: string }>;
  userRole?: 'staff' | 'approver' | 'admin';
}

export const InfiniteReportsList = ({ userId, showAuthor = false, allUsers = [], userRole }: InfiniteReportsListProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [viewedReports, setViewedReports] = useState<Set<string>>(new Set());
  const observerTarget = useRef<HTMLDivElement>(null);

  const reportViewsListenerRef = useRef<string | null>(null);
  const reportsUpdatesListenerRef = useRef<string | null>(null);

  // Fetch viewed reports
  useEffect(() => {
    let mounted = true;

    const fetchViewedReports = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('report_views')
          .select('report_id')
          .eq('user_id', user.id);

        if (!error && data && mounted) {
          setViewedReports(new Set(data.map((v: any) => v.report_id)));
        }
      } catch (e) {
        // ignore silently
      }
    };

    fetchViewedReports();

    // Subscribe to realtime updates for report views, filtered by current user
    let listenerId: string | null = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user?.id) return;

      listenerId = addRealtimeListener({
        channelName: `report-views:${user.id}`,
        table: 'report_views',
        schema: 'public',
        event: 'INSERT',
        filter: { user_id: user.id }, // important: per-user filter
        handler: (payload: any) => {
          setViewedReports(prev => new Set([...prev, payload.new.report_id]));
        },
      });
      reportViewsListenerRef.current = listenerId;
    })();

    return () => {
      mounted = false;
      if (reportViewsListenerRef.current) {
        // remove with the same filter we registered
        removeRealtimeListener(`report-views:${(Array.from(viewedReports)[0] ?? '')}`, reportViewsListenerRef.current, undefined);
        // Note: we do a conservative cleanup above; explicit filter available only in closure when initialising
        // To be precise we prefer to remove by the exact channelName used earlier: `report-views:${userId}`
        reportViewsListenerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReports = useCallback(async (pageNum: number, reset: boolean = false) => {
    if (loading) return;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '10',
      });

      if (userId) params.append('userId', userId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (userFilter !== 'all') params.append('staffId', userFilter);
      if (dateRange?.from) {
        params.append('startDate', dateRange.from.toISOString());
        if (dateRange.to) {
          params.append('endDate', new Date(dateRange.to.setHours(23, 59, 59, 999)).toISOString());
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-reports?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.status === 401 || response.status === 403) {
        window.location.href = '/';
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch reports');

      const result = await response.json();

      if (reset) {
        setReports(result.data);
      } else {
        setReports(prev => [...prev, ...result.data]);
      }

      setHasMore(result.hasMore);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [loading, userId, statusFilter, userFilter, dateRange, toast]);

  // Reset and fetch when filters change
  useEffect(() => {
    setReports([]);
    setPage(1);
    setHasMore(true);
    fetchReports(1, true);
  }, [statusFilter, userFilter, dateRange, userId]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchReports(nextPage, false);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, page, fetchReports]);

  // Realtime updates with debouncing to reduce DB load
  useEffect(() => {
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const handler = (payload: any) => {
      // Debounce refetch to prevent excessive DB calls (wait 2 seconds)
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        setReports([]);
        setPage(1);
        setHasMore(true);
        fetchReports(1, true);
      }, 2000);
    };

    // register server filtered listener only if userId provided
    const listenerId = addRealtimeListener({
      channelName: userId ? `reports-updates:${userId}` : 'reports-updates',
      table: 'daily_reports',
      schema: 'public',
      event: '*',
      filter: userId ? { user_id: userId } : undefined,
      handler,
    });

    reportsUpdatesListenerRef.current = listenerId;

    return () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      if (reportsUpdatesListenerRef.current) {
        removeRealtimeListener(userId ? `reports-updates:${userId}` : 'reports-updates', reportsUpdatesListenerRef.current, userId ? { user_id: userId } : undefined);
        reportsUpdatesListenerRef.current = null;
      }
    };
  }, [fetchReports, userId]);

  const handleReportClick = async (reportId: string) => {
    if (!viewedReports.has(reportId)) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase
          .from('report_views')
          .insert({ report_id: reportId, user_id: session.user.id });
      }
    }
    navigate(`/report/${reportId}`);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setUserFilter('all');
    setDateRange(undefined);
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || userFilter !== 'all' || dateRange;

  const displayedReports = reports.filter(report => {
    if (!searchQuery) return true;
    return report.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
           report.profiles.full_name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 pt-2 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {showAuthor && allUsers.length > 0 && (
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Staff" />
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
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[220px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')}
                      </>
                    ) : (
                      format(dateRange.from, 'MMM d, yyyy')
                    )
                  ) : (
                    <span>Date Range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={1}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
		
        {userRole && (
          <div className="flex justify-start pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => navigate('/export-reports')}
            >
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {displayedReports.length === 0 && !loading ? (
          <Card className="p-8 text-center text-muted-foreground">
            No reports found
          </Card>
        ) : (
          <>
            {displayedReports.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                onClick={() => handleReportClick(report.id)}
                showAuthor={showAuthor}
                isNew={!viewedReports.has(report.id)}
              />
            ))}

            {/* Infinite scroll trigger */}
            <div ref={observerTarget} className="h-4" />

            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {!hasMore && displayedReports.length > 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No more reports to load
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
