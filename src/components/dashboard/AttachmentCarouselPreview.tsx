// src/components/dashboard/AttachmentCarouselPreview.tsx
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch';
import { fileServeUrl } from '@/lib/storage';
import { fetchProtectedAsObjectUrl } from '@/lib/protectedFetch';
import { cn } from '@/lib/utils';

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
  
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  
  // Ref untuk melacak apakah penutupan dipicu oleh tombol Back browser
  const closedByBackRef = useRef(false);

  const { toast } = useToast();

  // --- HISTORY & BACK BUTTON HANDLER ---
  useEffect(() => {
    if (open) {
      // Reset flag setiap kali modal dibuka
      closedByBackRef.current = false;
      
      // Tambahkan state baru ke history browser
      window.history.pushState({ previewOpen: true }, "", window.location.href);

      const handlePopState = () => {
        closedByBackRef.current = true;
        onOpenChange(false);
      };

      window.addEventListener("popstate", handlePopState);

      return () => {
        window.removeEventListener("popstate", handlePopState);
        if (!closedByBackRef.current) {
            window.history.back();
        }
      };
    }
  }, [open, onOpenChange]);

  // --- RESET STATE SAAT BUKA ---
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setIsZoomed(false);
    }
  }, [open, initialIndex]);

  // --- CAROUSEL SYNC ---
  useEffect(() => {
    if (!api) return;
    api.scrollTo(initialIndex, true);

    const onSelect = () => {
      setCurrentIndex(api.selectedScrollSnap());
      setIsZoomed(false);
      if (transformRef.current) {
        transformRef.current.resetTransform();
      }
    };

    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api, initialIndex]);

  // --- GESTURE HANDLING ---
  useEffect(() => {
    if (!api) return;
    api.reInit({ watchDrag: !isZoomed });
  }, [api, isZoomed]);

  // --- LOAD FILE URL ---
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
      if (!workerUrl) throw new Error('No storage path');
      const objUrl = await fetchProtectedAsObjectUrl(workerUrl);
      setFileUrls((p) => ({ ...p, [file.id]: objUrl }));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingStates((p) => ({ ...p, [file.id]: false }));
    }
  };

  const handleDownload = async (file: ReportFile) => {
    try {
      const url = fileUrls[file.id] ?? file.file_url;
      if (!url) throw new Error("URL not ready");
      
      const link = document.createElement('a');
      link.href = url;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      toast({ title: 'Error', description: 'Download failed', variant: 'destructive' });
    }
  };

  const renderFilePreview = (file: ReportFile) => {
    const isLoading = loadingStates[file.id];
    const url = fileUrls[file.id] ?? file.file_url;
    const isImage = file.file_type?.startsWith('image/');
    const isVideo = file.file_type?.startsWith('video/');
    const isPdf = file.file_type === 'application/pdf';
    const isDoc = file.file_type?.includes('word') || file.file_type?.includes('document');
    const isExcel = file.file_type?.includes('sheet') || file.file_type?.includes('excel');

    if (isLoading) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-white/70 gap-3">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-xs font-medium">Loading...</p>
        </div>
      );
    }

    if (isImage && url) {
      return (
        <div className="w-full h-full overflow-hidden bg-black">
            <TransformWrapper
                ref={transformRef}
                initialScale={1}
                minScale={1}
                maxScale={5}
                centerOnInit={true}
                panning={{ disabled: !isZoomed }} 
                doubleClick={{ mode: "reset" }}
                onTransformed={(e) => {
                    const zoomed = e.state.scale > 1.01;
                    if (zoomed !== isZoomed) setIsZoomed(zoomed);
                }}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                <TransformComponent
                    wrapperStyle={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "100%",
                    }}
                    contentStyle={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "100%",
                    }}
                >
                    <div className="w-full h-full flex items-center justify-center">
                      <img
                          src={url}
                          alt={file.file_name}
                          className="max-w-full max-h-full object-contain block transition-opacity duration-200"
                      />
                    </div>
                </TransformComponent>
                )}
            </TransformWrapper>
        </div>
      );
    }

    if (isVideo && url) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black">
            <video
                src={url}
                controls
                playsInline
                className="max-h-screen max-w-full w-full object-contain"
            />
        </div>
      );
    }

    const getFileIcon = () => {
      if (isPdf) return <FileText className="h-20 w-20 text-red-500 mb-4" />;
      if (isDoc) return <FileText className="h-20 w-20 text-blue-500 mb-4" />;
      if (isExcel) return <FileSpreadsheet className="h-20 w-20 text-green-500 mb-4" />;
      return <FileIcon className="h-20 w-20 text-white/60 mb-4" />;
    };

    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-center max-w-xs w-full border border-white/10">
            <div className="flex justify-center">{getFileIcon()}</div>
            <h3 className="font-semibold text-white text-base line-clamp-2 mb-2">{file.file_name}</h3>
            <p className="text-white/60 text-xs mb-6">Preview not available</p>
            <Button onClick={() => handleDownload(file)} variant="secondary" className="w-full font-medium">
            <Download className="h-4 w-4 mr-2" />
            Download
            </Button>
        </div>
      </div>
    );
  };

  if (!files.length) return null;
  const currentFile = files[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="attachment-preview-desc"
        className="max-w-full w-screen h-[100dvh] p-0 bg-black border-none [&>button]:hidden duration-0 focus:outline-none"
      >
        <DialogTitle className="sr-only">Preview</DialogTitle>
        <DialogDescription id="attachment-preview-desc" className="sr-only">
          Full screen attachment preview
        </DialogDescription>

        <div className="relative w-full h-full min-h-[100dvh] flex flex-col overflow-hidden bg-black">
          
          {/* Header Overlay */}
          <div className={cn(
            "absolute top-0 left-0 right-0 z-50 p-4 flex items-start justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-all duration-300 pointer-events-none",
            isZoomed ? "opacity-0 -translate-y-full" : "opacity-100 translate-y-0"
          )}>
            <div className="flex-1 min-w-0 mr-4 pt-1 pointer-events-auto">
               <div className="text-white/90 text-sm font-bold drop-shadow-md tracking-wide">
                {currentIndex + 1} / {files.length}
               </div>
               <p className="text-white/70 text-xs truncate mt-0.5 max-w-[200px] drop-shadow-sm">
                 {currentFile?.file_name}
               </p>
            </div>

            <div className="flex items-center gap-3 pointer-events-auto">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => currentFile && handleDownload(currentFile)}
                className="h-10 w-10 rounded-full bg-black/30 text-white hover:bg-black/50 backdrop-blur-md border border-white/10"
              >
                <Download className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-10 w-10 rounded-full bg-black/30 text-white hover:bg-black/50 backdrop-blur-md border border-white/10"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Carousel Area */}
          <div className="flex-1 w-full h-full relative">
            <Carousel 
                setApi={setApi} 
                className="w-full h-full"
                opts={{
                    loop: false,
                    duration: 20,
                }}
            >
              <CarouselContent className="h-full ml-0"> 
                {files.map((file) => (
                  <CarouselItem
                    key={file.id}
                    className="h-full pl-0 basis-full relative" 
                  >
                    {renderFilePreview(file)}
                  </CarouselItem>
                ))}
              </CarouselContent>
              
              {!isZoomed && files.length > 1 && (
                  <>
                    <CarouselPrevious className="hidden sm:flex left-4 h-12 w-12 bg-white/10 border-white/5 text-white hover:bg-white/20 backdrop-blur-sm" />
                    <CarouselNext className="hidden sm:flex right-4 h-12 w-12 bg-white/10 border-white/5 text-white hover:bg-white/20 backdrop-blur-sm" />
                  </>
              )}
            </Carousel>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
