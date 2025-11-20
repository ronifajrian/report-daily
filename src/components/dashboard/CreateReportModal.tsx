import { useState, useRef, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { uploadFileToWorker } from "@/lib/upload";
import { fileServeUrl } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import TextareaAutosize from "react-textarea-autosize";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  X,
  MapPin,
  Paperclip,
  Loader2,
  Send,
  AlertCircle,
  ImageIcon,
  FileText,
  Video,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Konstanta KEY untuk localStorage
const DRAFT_STORAGE_KEY = "report_draft_desc";

interface CreateReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateReportModal = ({ open, onOpenChange, onSuccess }: CreateReportModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { location, status: locationStatus, requestLocation, openPermissionHelp } = useLocation();

  // Initial state diambil dari localStorage jika ada (Lazy initialization)
  const [description, setDescription] = useState(() => {
    return localStorage.getItem(DRAFT_STORAGE_KEY) || "";
  });

  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedInput, setFocusedInput] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2. Effect untuk Auto-Save setiap kali description berubah
  useEffect(() => {
    if (description) {
      localStorage.setItem(DRAFT_STORAGE_KEY, description);
    } else {
      // Jika kosong, hapus dari storage agar bersih
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [description]);

  // Contoh logic tambahan di dalam useEffect mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      toast({
        title: "Draft Restored",
        description: "Text saved, but please re-select your files.",
      });
    }
  }, []);

  // 3. Update handleOpenChange agar LEBIH AMAN
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // UX CHOICE: Jangan hapus description di sini. 
      // Biarkan tersimpan di draft kalau user tidak sengaja menutup modal.
      // Kita hanya reset files dan focus.
      setFiles([]);
      setFocusedInput(false);
    }
    onOpenChange(isOpen);
  };

  // Normalize user name & initials
  const { userInitials, formattedName } = useMemo(() => {
    const rawName = user?.user_metadata?.full_name || "ME";
    const formatted = rawName
      .toLowerCase()
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const parts = formatted.trim().split(/\s+/);
    let initials = "ME";

    if (parts.length > 0 && parts[0] !== "") {
      if (parts.length === 1) {
        initials = parts[0].substring(0, 1).toUpperCase();
      } else {
        initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
    }

    return { userInitials: initials, formattedName: formatted };
  }, [user?.user_metadata?.full_name]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(f => f.size <= 10 * 1024 * 1024);

      if (validFiles.length !== newFiles.length) {
        toast({ title: "Warning", description: "Files >10MB were skipped", variant: "destructive" });
      }
      setFiles(prev => [...prev, ...validFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;

    let finalLocation = location;
    if (!finalLocation) {
      try {
        finalLocation = await requestLocation();
      } catch { return; }
    }

    setIsSubmitting(true);
    try {
      const { data: report, error } = await supabase
        .from("daily_reports")
        .insert({
          user_id: user?.id,
          description: description.trim(),
          latitude: finalLocation?.latitude,
          longitude: finalLocation?.longitude,
        })
        .select()
        .single();

      if (error) throw error;

      if (files.length > 0 && report) {
        await Promise.all(files.map(async (file) => {
          const ext = file.name.split('.').pop();
          const path = `${user?.id}/${report.id}-${Date.now()}.${ext}`;
          const { key } = await uploadFileToWorker(file, path);
          const url = fileServeUrl(key);

          await supabase.from("report_files").insert({
            report_id: report.id,
            storage_path: key,
            file_url: url,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type
          });
        }));
      }

      // 4. HAPUS DRAFT SETELAH SUKSES
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setDescription(""); // Reset state
      setFiles([]); // Reset files

      toast({ title: "Report Created", description: "Your report has been submitted successfully." });
      onSuccess();
      // Gunakan onOpenChange langsung agar tidak memanggil logic reset kita sendiri yg mungkin conflict
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    if (file.type.startsWith('video/')) return <Video className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderLocationButton = () => {
    if (locationStatus === 'loading') {
      return (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
        >
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Getting location...</span>
        </motion.div>
      );
    }

    if (locationStatus === 'denied') {
      return (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={openPermissionHelp}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
        >
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span className="text-xs font-medium text-red-700 dark:text-red-400">Location disabled</span>
        </motion.button>
      );
    }

    if (locationStatus === 'success' && location) {
      return (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
        >
          <MapPin className="h-4 w-4 fill-emerald-600 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {Math.round(location.accuracy)}m accuracy
          </span>
          <Check className="h-3 w-3 text-emerald-600" />
        </motion.div>
      );
    }

    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={requestLocation}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-primary transition-all group"
      >
        <MapPin className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover:text-primary transition-colors" />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 group-hover:text-primary transition-colors">Add location</span>
      </motion.button>
    );
  };

  const canSubmit = description.trim() && !isSubmitting && locationStatus !== 'loading' && locationStatus !== 'denied';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl w-[95%] p-0 gap-0 overflow-hidden border-0 shadow-2xl bg-gradient-to-b from-background to-muted/20">
        {/* Modern Header */}
        <div className="relative overflow-hidden border-b bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)]" />
          <div className="relative px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-primary/20 ring-2 ring-primary/10">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="text-sm font-bold bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-base">{formattedName}</h3>
                <p className="text-xs text-muted-foreground">Create new report</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-6 space-y-6">
          {/* Textarea - Enhanced */}
          <div className="relative">
            <TextareaAutosize
              ref={textareaRef}
              placeholder="What's happening on the field today? Share your progress, challenges, or observations..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={() => setFocusedInput(true)}
              onBlur={() => setFocusedInput(false)}
              minRows={6}
              maxRows={12}
              disabled={isSubmitting}
              className={`
                w-full resize-none rounded-2xl border-2 p-4 text-base
                placeholder:text-muted-foreground/60
                focus-visible:ring-4 focus-visible:ring-primary/20
                transition-all duration-200
                bg-white dark:bg-slate-950
                ${focusedInput ? 'border-primary shadow-lg shadow-primary/10' : 'border-gray-200 dark:border-gray-800'}
              `}
              style={{ lineHeight: 1.6 }}
            />
            <div className="absolute bottom-3 right-3 text-xs text-muted-foreground pointer-events-none">
              {description.length} / 5000
            </div>
          </div>

          {/* File Upload Area - Enhanced */}
          <div className="space-y-3">
            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.mp4,.mov"
            />
            
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="w-full p-6 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-primary hover:bg-primary/5 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Paperclip className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Attach files</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Images, videos, or documents (max 10MB each)
                  </p>
                </div>
              </div>
            </motion.button>

            {/* File Previews - Enhanced */}
            <AnimatePresence mode="popLayout">
              {files.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <p className="text-sm font-medium text-muted-foreground">
                    {files.length} file{files.length !== 1 ? 's' : ''} attached
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {files.map((file, idx) => (
                      <motion.div
                        key={idx}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="group relative flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border hover:border-primary/50 transition-all"
                      >
                        {file.type.startsWith('image/') ? (
                          <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            <img
                              src={URL.createObjectURL(file)}
                              alt="preview"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            {getFileIcon(file)}
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                        </div>

                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => removeFile(idx)}
                          className="flex-shrink-0 p-1.5 rounded-full bg-background border border-border hover:bg-destructive hover:border-destructive hover:text-destructive-foreground transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </motion.button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Modern Footer */}
        <div className="border-t bg-muted/30 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {renderLocationButton()}
            </div>

            <motion.div
              whileHover={{ scale: canSubmit ? 1.02 : 1 }}
              whileTap={{ scale: canSubmit ? 0.98 : 1 }}
            >
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="relative rounded-xl px-6 py-2.5 font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-2">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Posting...</span>
                    </>
                  ) : (
                    <>
                      <span>Post Report</span>
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </div>
              </Button>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};