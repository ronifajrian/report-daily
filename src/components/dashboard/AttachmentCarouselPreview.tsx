// src/components/AttachmentCarouselPreview.tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselApi,
} from '@/components/ui/carousel';
import {
  Download,
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  X,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { fileServeUrl } from '@/lib/storage';
import { fetchProtectedAsObjectUrl } from '@/lib/protectedFetch';

interface ReportFile {
  id: string;
  file_url?: string | null;
  storage_path?: string | null;
  file_name: string;
  file_type: string | null;
}

interface AttachmentCarouselPreviewProps {
  files: ReportFile[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AttachmentCarouselPreview = ({
  files,
  initialIndex,
  open,
  onOpenChange,
}: AttachmentCarouselPreviewProps) => {
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (!api) return;

    // scroll ke index awal
    api.scrollTo(initialIndex);
    setCurrentIndex(initialIndex);

    // handler yang akan di-unsubscribe nanti
    const handler = () => {
      try {
        setCurrentIndex(api.selectedScrollSnap());
      } catch {
        // guard jika api berubah/invalid saat handler dipanggil
      }
    };

    // register
    api.on('select', handler);

    // cleanup harus mengembalikan fungsi yang tidak mengembalikan value (void)
    return () => {
      // safe-check bila api.off tidak tersedia
      try {
        // kalau library menyediakan `off`
        (api as any).off?.('select', handler);
        // atau kalau `on` mengembalikan unsubscribe, panggil itu instead.
      } catch {
        // ignore
      }
    };
  }, [api, initialIndex]);

  useEffect(() => {
    if (open && files[currentIndex]) {
      loadFileUrl(files[currentIndex]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentIndex, files]);

  const loadFileUrl = async (file: ReportFile) => {
    if (!file || fileUrls[file.id]) return;
    setLoadingStates((p) => ({ ...p, [file.id]: true }));
    try {
      if (file.file_url) {
        const isWorkerUrl =
          file.file_url.includes('workers.dev') ||
          file.file_url.includes('.r2.cloudflarestorage.com');
        if (isWorkerUrl) {
          const objUrl = await fetchProtectedAsObjectUrl(file.file_url);
          setFileUrls((p) => ({ ...p, [file.id]: objUrl }));
        } else {
          setFileUrls((p) => ({ ...p, [file.id]: file.file_url! }));
        }
        return;
      }
      const workerUrl = fileServeUrl(file.storage_path);
      if (!workerUrl) throw new Error('No storage path for file');
      const objUrl = await fetchProtectedAsObjectUrl(workerUrl);
      setFileUrls((p) => ({ ...p, [file.id]: objUrl }));
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to load file',
        variant: 'destructive',
      });
    } finally {
      setLoadingStates((p) => ({ ...p, [file.id]: false }));
    }
  };

  const handleDownload = async (file: ReportFile) => {
    try {
      const url = fileUrls[file.id] ?? file.file_url;
      if (!url) {
        toast({
          title: 'Error',
          description: 'No URL available',
          variant: 'destructive',
        });
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Success', description: 'File downloaded' });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Download failed',
        variant: 'destructive',
      });
    }
  };

  const renderFilePreview = (file: ReportFile) => {
    const isLoading = loadingStates[file.id];
    const url = fileUrls[file.id] ?? file.file_url;
    const isImage = file.file_type?.startsWith('image/');
    const isVideo = file.file_type?.startsWith('video/');
    const isPdf = file.file_type === 'application/pdf';
    const isDoc =
      file.file_type?.includes('word') || file.file_type?.includes('document');
    const isExcel =
      file.file_type?.includes('sheet') || file.file_type?.includes('excel');

    if (isLoading) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <Skeleton className="h-64 w-64 mx-auto rounded-lg" />
            <p className="text-sm text-white/60 animate-pulse">
              Loading preview...
            </p>
          </div>
        </div>
      );
    }

    if (isImage && url) {
      return (
        <TransformWrapper initialScale={1} minScale={1} maxScale={4} centerOnInit>
          <TransformComponent
            wrapperClass="!w-full !h-full"
            contentClass="!w-full !h-full flex items-center justify-center"
          >
            <img
              src={url}
              alt={file.file_name}
              className="w-full h-full object-contain"
              style={{
                maxWidth: '100vw',
                maxHeight: 'calc(100vh - 5rem)',
              }}
            />
          </TransformComponent>
        </TransformWrapper>
      );
    }

    if (isVideo && url) {
      return (
        <video
          src={url}
          controls
          className="w-full h-full object-contain"
          style={{
            maxWidth: '100vw',
            maxHeight: 'calc(100vh - 5rem)',
          }}
        />
      );
    }

    const getFileIcon = () => {
      if (isPdf) return <FileText className="h-24 w-24 text-red-500" />;
      if (isDoc) return <FileText className="h-24 w-24 text-blue-500" />;
      if (isExcel) return <FileSpreadsheet className="h-24 w-24 text-green-500" />;
      return <FileIcon className="h-24 w-24 text-white/60" />;
    };

    const getBgColor = () => {
      if (isPdf) return 'bg-red-500/10';
      if (isDoc) return 'bg-blue-500/10';
      if (isExcel) return 'bg-green-500/10';
      return 'bg-white/5';
    };

    const getFileTypeName = () => {
      if (isPdf) return 'PDF Document';
      if (isDoc) return 'Word Document';
      if (isExcel) return 'Excel Spreadsheet';
      return 'Document';
    };

    return (
      <div className={`${getBgColor()} rounded-2xl p-8 text-center space-y-5 max-w-md`}>
        <div className="flex justify-center">{getFileIcon()}</div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg text-white">{getFileTypeName()}</h3>
          <p className="text-sm text-white/60 break-all">{file.file_name}</p>
        </div>
        <Button onClick={() => handleDownload(file)} className="mt-4" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Download to View
        </Button>
      </div>
    );
  };

  if (!files.length) return null;
  const currentFile = files[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="attachment-preview-desc"
        className="max-w-full w-screen h-screen p-0 bg-black/95 border-none [&>button]:hidden"
      >
        {/* Make Title/Description direct children (sr-only) so Radix runtime will detect them reliably */}
        <DialogTitle id="attachment-preview-title" className="sr-only">
          Attachment preview
        </DialogTitle>
        <DialogDescription id="attachment-preview-desc" className="sr-only">
          Preview lampiran dalam tampilan layar penuh. Tekan Escape untuk menutup.
        </DialogDescription>

        <div className="relative h-full flex flex-col w-full">
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex-1 min-w-0 mr-4">
              <h3 className="text-sm sm:text-base font-medium text-white truncate">
                {currentFile?.file_name}
              </h3>
              <p className="text-xs text-white/60">
                {currentIndex + 1} / {files.length}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => currentFile && handleDownload(currentFile)}
                className="h-9 w-9 sm:w-auto sm:px-3 p-0 sm:p-2 text-white hover:bg-white/10"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Download</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-9 w-9 p-0 text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="absolute inset-0 w-full h-full pt-16 flex items-center justify-center">
            <Carousel setApi={setApi} className="h-full w-full">
              <CarouselContent className="h-full">
                {files.map((file) => (
                  <CarouselItem
                    key={file.id}
                    className="h-full basis-full flex items-center justify-center"
                  >
                    {renderFilePreview(file)}
                  </CarouselItem>
                ))}
              </CarouselContent>
              {files.length > 1 && (
                <>
                  <CarouselPrevious className="left-2 sm:left-4 h-10 w-10 bg-black/50 border-white/20 text-white hover:bg-black/70 hover:text-white" />
                  <CarouselNext className="right-2 sm:right-4 h-10 w-10 bg-black/50 border-white/20 text-white hover:bg-black/70 hover:text-white" />
                </>
              )}
            </Carousel>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
