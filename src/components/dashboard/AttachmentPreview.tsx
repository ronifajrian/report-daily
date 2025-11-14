// src/components/AttachmentPreview.tsx
import { useEffect, useState } from 'react';
import { FileText, File, FileSpreadsheet } from 'lucide-react';
import { fileServeUrl } from '@/lib/storage';
import { fetchProtectedAsObjectUrl } from '@/lib/protectedFetch';

interface AttachmentPreviewProps {
  file: {
    id: string;
    storage_path?: string | null;
    file_url?: string | null;
    file_name: string;
    file_type: string | null;
  };
  isImage: boolean;
  isVideo: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export const AttachmentPreview = ({ file, isImage, isVideo, onClick }: AttachmentPreviewProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdObjUrl: string | null = null;

    const loadThumbnail = async () => {
      try {
        if (file.file_url) {
          // detect worker/private URL heuristically
          const isWorkerUrl =
            file.file_url.includes('workers.dev') || file.file_url.includes('.r2.cloudflarestorage.com');
          if (isWorkerUrl) {
            const objUrl = await fetchProtectedAsObjectUrl(file.file_url);
            createdObjUrl = objUrl;
            if (!cancelled) setThumbnailUrl(objUrl);
          } else {
            if (!cancelled) setThumbnailUrl(file.file_url);
          }
          return;
        }

        if (!file.storage_path) return;
        const workerUrl = fileServeUrl(file.storage_path);
        const objUrl = await fetchProtectedAsObjectUrl(workerUrl);
        createdObjUrl = objUrl;
        if (!cancelled) setThumbnailUrl(objUrl);
      } catch (e) {
        console.error('Thumbnail load error', e);
      }
    };

    if (isImage) loadThumbnail();

    return () => {
      cancelled = true;
      // keep cached object URLs for SPA navigation — do not revoke here
    };
  }, [file.storage_path, file.file_url, isImage]);

  const isPdf = file.file_type === 'application/pdf';
  const isDoc = file.file_type?.includes('word') || file.file_type?.includes('document');
  const isExcel = file.file_type?.includes('sheet') || file.file_type?.includes('excel');

  if (isImage) {
    return (
      <div className="relative h-32 w-32 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer border-2 border-border hover:border-primary transition-colors bg-muted" onClick={onClick}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={file.file_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="relative h-32 w-32 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer border-2 border-border hover:border-primary transition-colors bg-gradient-to-br from-purple-500/20 to-pink-500/20" onClick={onClick}>
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <div className="w-0 h-0 border-l-6 border-l-black border-y-4 border-y-transparent ml-1" />
          </div>
        </div>
      </div>
    );
  }

  const getFileIcon = () => {
    if (isPdf) return <FileText className="h-8 w-8 text-red-500" />;
    if (isDoc) return <FileText className="h-8 w-8 text-blue-500" />;
    if (isExcel) return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
    return <File className="h-8 w-8 text-muted-foreground" />;
  };

  const getBgColor = () => {
    if (isPdf) return 'bg-red-500/10';
    if (isDoc) return 'bg-blue-500/10';
    if (isExcel) return 'bg-green-500/10';
    return 'bg-muted/50';
  };

  return (
    <div className={`relative h-32 w-32 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer border-2 border-border hover:border-primary transition-colors ${getBgColor()} flex flex-col items-center justify-center p-2`} onClick={onClick}>
      {getFileIcon()}
      <div className="mt-1 text-xs text-center truncate w-full px-1">
        {file.file_name}
      </div>
    </div>
  );
};
