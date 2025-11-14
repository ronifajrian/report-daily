// src/components/AttachmentThumbnails.tsx
import { useEffect, useState } from 'react';
import { FileText, File, FileSpreadsheet, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fileServeUrl } from '@/lib/storage';
import { fetchProtectedAsObjectUrl } from '@/lib/protectedFetch';

interface ThumbnailProps {
  file: {
    id: string;
    storage_path?: string | null;
    file_url?: string | null;
    file_name: string;
    file_type: string | null;
  };
  onClick: () => void;
  canEdit?: boolean;
  onDelete: () => void;
  saving?: boolean;
}

const baseContainerClass =
  'relative aspect-square rounded-lg cursor-pointer border-2 border-border hover:border-primary transition-colors group flex items-center justify-center p-2';

/**
 * Note: overflow is intentionally set to visible on the outer wrapper
 * so the delete button can sit outside the thumbnail edge and not be clipped.
 */

export const ImageThumbnail = ({ file, onClick, canEdit, onDelete, saving }: ThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadThumbnail = async () => {
      try {
        if (file.file_url) {
          const isWorkerUrl =
            file.file_url.includes('workers.dev') || file.file_url.includes('.r2.cloudflarestorage.com');
          if (isWorkerUrl) {
            const obj = await fetchProtectedAsObjectUrl(file.file_url);
            if (!cancelled) setThumbnailUrl(obj);
            return;
          } else {
            if (!cancelled) setThumbnailUrl(file.file_url);
            return;
          }
        }

        if (!file.storage_path) return;
        const workerUrl = fileServeUrl(file.storage_path);
        const obj = await fetchProtectedAsObjectUrl(workerUrl);
        if (!cancelled) setThumbnailUrl(obj);
      } catch (e) {
        console.error('thumbnail err', e);
      }
    };
    loadThumbnail();
    return () => {
      cancelled = true;
      // we intentionally don't revoke object URLs here to keep SPA navigation snappy
    };
  }, [file.storage_path, file.file_url]);

  return (
    <div
      className={`${baseContainerClass} bg-muted`}
      style={{ overflow: 'visible' }} // allow delete button to sit outside and remain visible
      onClick={onClick}
      role="button"
      aria-label={`Open ${file.file_name}`}
    >
      <div className="w-full h-full rounded-lg overflow-hidden">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={file.file_name} className="w-full h-full object-cover rounded-lg" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/20">
            <FileText className="h-8 w-8 text-muted-foreground animate-pulse" />
          </div>
        )}
      </div>

      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (saving) return;
            onDelete();
          }}
          disabled={saving}
          aria-busy={saving}
          aria-label={saving ? 'Menghapus...' : `Hapus ${file.file_name}`}
          // positioned outside the thumbnail corner
          style={{ zIndex: 40 }}
          className={`
            absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2
            h-8 w-8 p-0 rounded-full flex items-center justify-center
            bg-white border border-gray-200 shadow-md
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
            transition-transform hover:scale-105
            ${saving ? 'opacity-80 cursor-not-allowed' : 'opacity-100'}
          `}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      )}

      <div className="absolute left-2 bottom-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-md truncate max-w-[90%]">
        {file.file_name}
      </div>
    </div>
  );
};

export const VideoThumbnail = ({ file, onClick, canEdit, onDelete, saving }: ThumbnailProps) => {
  return (
    <div
      className={`${baseContainerClass} bg-gradient-to-br from-purple-50 to-pink-50`}
      style={{ overflow: 'visible' }}
      onClick={onClick}
      role="button"
      aria-label={`Open ${file.file_name}`}
    >
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
          <div className="w-0 h-0 border-l-8 border-l-black border-y-6 border-y-transparent ml-1" />
        </div>
      </div>

      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (saving) return;
            onDelete();
          }}
          disabled={saving}
          aria-busy={saving}
          aria-label={saving ? 'Menghapus...' : `Hapus ${file.file_name}`}
          style={{ zIndex: 40 }}
          className={`
            absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2
            h-8 w-8 p-0 rounded-full flex items-center justify-center
            bg-white border border-gray-200 shadow-md
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
            transition-transform hover:scale-105
            ${saving ? 'opacity-80 cursor-not-allowed' : 'opacity-100'}
          `}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      )}

      <div className="absolute left-2 bottom-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-md truncate max-w-[90%]">
        {file.file_name}
      </div>
    </div>
  );
};

export const FileThumbnail = ({ file, onClick, canEdit, onDelete, saving, isPdf, isDoc, isExcel }: any) => {
  const getIcon = () => {
    if (isPdf) return <FileText className="h-12 w-12 text-red-500" />;
    if (isDoc) return <FileText className="h-12 w-12 text-blue-500" />;
    if (isExcel) return <FileSpreadsheet className="h-12 w-12 text-green-500" />;
    return <File className="h-12 w-12 text-muted-foreground" />;
  };

  const getBgColor = () => {
    if (isPdf) return 'bg-red-50';
    if (isDoc) return 'bg-blue-50';
    if (isExcel) return 'bg-green-50';
    return 'bg-muted/50';
  };

  return (
    <div
      className={`${baseContainerClass} ${getBgColor()}`}
      style={{ overflow: 'visible' }}
      onClick={onClick}
      role="button"
      aria-label={`Open ${file.file_name}`}
    >
      <div className="flex flex-col items-center justify-center w-full h-full p-2">
        {getIcon()}
        <div className="mt-2 text-xs text-center truncate w-full px-1">{file.file_name}</div>
      </div>

      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (saving) return;
            onDelete();
          }}
          disabled={saving}
          aria-busy={saving}
          aria-label={saving ? 'Menghapus...' : `Hapus ${file.file_name}`}
          style={{ zIndex: 40 }}
          className={`
            absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2
            h-8 w-8 p-0 rounded-full flex items-center justify-center
            bg-white border border-gray-200 shadow-md
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
            transition-transform hover:scale-105
            ${saving ? 'opacity-80 cursor-not-allowed' : 'opacity-100'}
          `}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
};
