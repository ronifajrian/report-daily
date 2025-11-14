import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Report } from './StaffDashboard';
import { MapPin, FileText, File } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { AttachmentPreview } from './AttachmentPreview';
import { AttachmentCarouselPreview } from './AttachmentCarouselPreview';

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
  onClick: () => void;
  showAuthor?: boolean;
  isNew?: boolean;
}

export const ReportCard = ({ report, onClick, showAuthor = false, isNew = false }: ReportCardProps) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [attachments, setAttachments] = useState<ReportFile[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(true);

  useEffect(() => {
    const fetchAttachments = async () => {
      setLoadingAttachments(true);
      try {
        const { data, error } = await supabase
          .from('report_files')
          .select('*')
          .eq('report_id', report.id);
        
        if (error) throw error;
        setAttachments(data || []);
      } catch (error) {
        console.error('Error fetching attachments:', error);
      } finally {
        setLoadingAttachments(false);
      }
    };

    fetchAttachments();
  }, [report.id]);

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

  const openGoogleMaps = (e: React.MouseEvent, lat: number, lng: number) => {
    e.stopPropagation();
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };

  return (
    <>
      <Card 
        className={`cursor-pointer hover:shadow-md transition-all hover:border-primary/20 animate-fade-in ${
          isNew ? 'border-l-4 border-l-primary' : ''
        }`}
        onClick={onClick}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {showAuthor && (
                <p className="font-semibold text-sm mb-1">{report.profiles.full_name}</p>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {format(new Date(report.created_at), 'MMM dd, yyyy • HH:mm')}
                {report.latitude && report.longitude && (
                  <>
                    <span className="mx-1">•</span>
                    <MapPin 
                      className="h-3 w-3 text-primary cursor-pointer hover:text-primary/80"
                      onClick={(e) => openGoogleMaps(e, report.latitude!, report.longitude!)}
                    />
                  </>
                )}
              </p>
            </div>
            {getStatusBadge(report.status)}
          </div>

          <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">
            {report.description}
          </p>

          {!loadingAttachments && attachments.length > 0 && (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2 pb-2">
                {attachments.map((file, index) => {
                  const isImage = file.file_type?.startsWith('image/');
                  const isVideo = file.file_type?.startsWith('video/');

                  const handleFileClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    setPreviewInitialIndex(index);
                    setPreviewOpen(true);
                  };

                  return (
                    <AttachmentPreview 
                      key={file.id} 
                      file={file} 
                      isImage={isImage} 
                      isVideo={isVideo}
                      onClick={handleFileClick}
                    />
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}

          {report.rejection_reason && (
            <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
              <span className="font-semibold">Rejection reason: </span>
              {report.rejection_reason}
            </div>
          )}
        </CardContent>
      </Card>

      <AttachmentCarouselPreview
        files={attachments}
        initialIndex={previewInitialIndex}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
};
