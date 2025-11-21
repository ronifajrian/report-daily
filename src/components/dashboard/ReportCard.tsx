// src/components/dashboard/ReportCard.tsx - UPDATED FOR ROUTE NAVIGATION
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Report } from './StaffDashboard';
import { MapPin } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { AttachmentPreview } from './AttachmentPreview';
import { AttachmentCarouselPreview } from './AttachmentCarouselPreview';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatRelativeTime, getInitials } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router-dom'; // ✅ NEW

interface ReportFile {
  id: string;
  file_url: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
}

interface ReportCardProps {
  report: Report;
  showAuthor?: boolean;
  isNew?: boolean;
}

const attachmentsCache = new Map<string, { data: ReportFile[]; timestamp: number }>();
const CACHE_TTL = 60000;

const debounce = (fn: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const ReportCard = ({ report, showAuthor = false, isNew = false }: ReportCardProps) => {
  // ✅ NEW: Use navigation instead of onClick callback
  const navigate = useNavigate();
  const location = useLocation();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [attachments, setAttachments] = useState<ReportFile[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!cardRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fetchedRef.current) {
          setIsVisible(true);
        }
      },
      {
        rootMargin: '200px',
        threshold: 0.01,
      }
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  const fetchAttachments = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = attachmentsCache.get(report.id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setAttachments(cached.data);
      return;
    }

    setLoadingAttachments(true);
    try {
      const { data, error } = await supabase
        .from('report_files')
        .select('id, file_url, storage_path, file_name, file_type, file_size')
        .eq('report_id', report.id)
        .order('created_at', { ascending: true })
        .limit(5);
      
      if (error) throw error;

      const files = data || [];
      setAttachments(files);

      attachmentsCache.set(report.id, { data: files, timestamp: Date.now() });

      if (attachmentsCache.size > 50) {
        const now = Date.now();
        for (const [key, value] of attachmentsCache.entries()) {
          if (now - value.timestamp > CACHE_TTL) {
            attachmentsCache.delete(key);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
    } finally {
      setLoadingAttachments(false);
    }
  }, [report.id]);

  useEffect(() => {
    if (isVisible) {
      const debouncedFetch = debounce(fetchAttachments, 100);
      debouncedFetch();
    }
  }, [isVisible, fetchAttachments]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/10 text-success hover:bg-success/20">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openGoogleMaps = useCallback((e: React.MouseEvent, lat: number, lng: number) => {
    e.stopPropagation();
    window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
  }, []);

  const handleFileClick = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setPreviewInitialIndex(index);
    setPreviewOpen(true);
  }, []);

  // ✅ NEW: Navigate to report detail route
  const handleCardClick = useCallback(() => {
    navigate(`/dashboard/report/${report.id}`, {
      state: { backgroundLocation: location }
    });
  }, [navigate, report.id, location]);

  return (
    <>
      <Card 
        ref={cardRef}
        className={`cursor-pointer hover:shadow-md transition-all hover:border-primary/20 animate-fade-in ${
          isNew ? 'border-l-4 border-l-primary' : ''
        }`}
        onClick={handleCardClick} // ✅ CHANGED: Use navigation instead of callback
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            
            <div className="flex flex-1 min-w-0 items-start gap-3">
              
              {showAuthor && report.profiles && (
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback className='text-sm bg-secondary text-secondary-foreground'>
                    {getInitials(report.profiles.full_name || 'N/A')}
                  </AvatarFallback>
                </Avatar>
              )}

              <div className="flex-1 min-w-0 pt-0.5">
                {showAuthor && report.profiles && (
                  <p className="font-semibold text-sm truncate leading-none">
                    {report.profiles.full_name}
                  </p>
                )}

                <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap mt-1">
                  <span className="whitespace-nowrap">
                    {formatRelativeTime(report.created_at)} 
                  </span>
                  
                  {report.latitude && report.longitude && (
                    <>
                      <span className="mx-1">•</span>
                      <MapPin 
                        className="h-3 w-3 text-primary cursor-pointer hover:text-primary/80 flex-shrink-0"
                        onClick={(e) => openGoogleMaps(e, report.latitude!, report.longitude!)}
                      />
                    </>
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex-shrink-0 pt-1">
              {getStatusBadge(report.status)}
            </div>
          </div>

          <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap break-words">
            {report.description}
          </p>

          {isVisible && !loadingAttachments && attachments.length > 0 && (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2 pb-2">
                {attachments.map((file, index) => {
                  const isImage = file.file_type?.startsWith('image/');
                  const isVideo = file.file_type?.startsWith('video/');

                  return (
                    <AttachmentPreview 
                      key={file.id} 
                      file={file} 
                      isImage={isImage} 
                      isVideo={isVideo}
                      onClick={(e) => handleFileClick(e, index)}
                    />
                  );
                })}
                {attachments.length >= 5 && (
                  <div className="flex items-center justify-center min-w-[128px] h-32 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                    +more
                  </div>
                )}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}

          {isVisible && loadingAttachments && (
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className="w-32 h-32 rounded-lg bg-muted/50 animate-pulse"
                />
              ))}
            </div>
          )}

          {report.rejection_reason && (
            <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
              <span className="font-semibold">Rejection reason: </span>
              <span className="break-words">{report.rejection_reason}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {previewOpen && (
        <AttachmentCarouselPreview
          files={attachments}
          initialIndex={previewInitialIndex}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
    </>
  );
};