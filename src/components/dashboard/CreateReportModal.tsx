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
  DialogHeader,
  DialogTitle
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
  AlertCircle
} from 'lucide-react';

interface CreateReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateReportModal = ({ open, onOpenChange, onSuccess }: CreateReportModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { location, status: locationStatus, requestLocation, openPermissionHelp } = useLocation();

  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // keyboard / viewport handling
  const [isInputActive, setIsInputActive] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const textareaBlurTimeoutRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setDescription("");
      setFiles([]);
      setIsInputActive(false);
      setKeyboardHeight(0);
    }
    onOpenChange(isOpen);
  };

  // Normalisasi nama & inisial
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

      toast({ title: "Report Created", description: "Your report has been submitted successfully." });
      onSuccess();
      handleOpenChange(false);
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLocationStatus = () => {
    if (locationStatus === 'loading') {
      return (
        <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-3 py-1 rounded-full animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Locating...</span>
        </div>
      );
    }
    if (locationStatus === 'denied') {
      return (
        <button onClick={openPermissionHelp} className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-1 rounded-full hover:bg-destructive/20 transition-colors">
          <AlertCircle className="h-3 w-3" />
          <span>Disabled</span>
        </button>
      );
    }
    if (locationStatus === 'success' && location) {
      return (
        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full cursor-default">
          <MapPin className="h-3 w-3 fill-emerald-600" />
          <span>{Math.round(location.accuracy)}m</span>
        </div>
      );
    }
    return (
      <button onClick={requestLocation} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted hover:bg-muted/80 hover:text-primary px-3 py-1 rounded-full transition-all group">
        <MapPin className="h-3 w-3 group-hover:text-primary transition-colors" />
        <span>Add Location</span>
      </button>
    );
  };

  // Cleanup blur timeout on unmount
  useEffect(() => {
    return () => {
      if (textareaBlurTimeoutRef.current) {
        window.clearTimeout(textareaBlurTimeoutRef.current);
        textareaBlurTimeoutRef.current = null;
      }
    };
  }, []);

  // visualViewport / keyboard detection with fallback
  useEffect(() => {
    const vv = (typeof window !== "undefined" ? (window as any).visualViewport : undefined);

    const computeKeyboard = () => {
      const full = window.innerHeight || (document.documentElement?.clientHeight ?? 0);

      if (!vv) {
        // fallback: we can't reliably know kb height, so set to 0
        setKeyboardHeight(0);
        return;
      }

      // keyboardHeight ≈ full window height - visualViewport.height - offsetTop
      const kb = Math.max(0, full - (vv.height || 0) - (vv.offsetTop || 0));
      setKeyboardHeight(kb);
    };

    // detect mobile-ish by width
    const detectMobile = () => {
      setIsMobile((typeof window !== "undefined") ? window.innerWidth < 640 : false);
    };

    if (vv) {
      vv.addEventListener("resize", computeKeyboard);
      vv.addEventListener("scroll", computeKeyboard);
      // initial
      computeKeyboard();
    } else {
      window.addEventListener("resize", computeKeyboard);
      computeKeyboard();
    }

    window.addEventListener("resize", detectMobile);
    detectMobile();

    return () => {
      if (vv) {
        vv.removeEventListener("resize", computeKeyboard);
        vv.removeEventListener("scroll", computeKeyboard);
      } else {
        window.removeEventListener("resize", computeKeyboard);
      }
      window.removeEventListener("resize", detectMobile);
    };
  }, []);

  // textarea focus/blur handlers with small debounce and scrollIntoView
  const handleTextareaFocus = () => {
    if (textareaBlurTimeoutRef.current) {
      window.clearTimeout(textareaBlurTimeoutRef.current);
      textareaBlurTimeoutRef.current = null;
    }
    setIsInputActive(true);

    // give browser a moment to adjust visualViewport, then scroll textarea into center
    setTimeout(() => {
      try {
        textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        // ignore in case browser blocks scroll
      }
    }, 120);
  };
  const handleTextareaBlur = () => {
    textareaBlurTimeoutRef.current = window.setTimeout(() => {
      setIsInputActive(false);
      textareaBlurTimeoutRef.current = null;
    }, 120);
  };

  // compute top offset: prefer visualViewport.offsetTop when available (accounts for browser UI)
  let pinnedTop = 8;
  if (typeof window !== "undefined") {
    const vv = (window as any).visualViewport;
    if (vv && typeof vv.offsetTop === "number") {
      pinnedTop = Math.max(6, vv.offsetTop + 6);
    } else {
      pinnedTop = 8;
    }
  }

  // determine autosize rows: slightly lower max rows on mobile
  const maxRows = isMobile ? 10 : 15;
  const minRows = 5; // bigger textarea by default

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={`
          sm:max-w-xl w-[95%] rounded-2xl p-0 gap-0 overflow-hidden border shadow-2xl bg-card focus:outline-none outline-none transition-all
        `}
        // When input is active, force a mobile-friendly pinned top position and leave space for keyboard.
        style={
          isInputActive
            ? {
                position: "fixed",
                left: "50%",
                transform: "translateX(-50%)",
                top: `${pinnedTop}px`,
                // leave space from bottom equal to keyboardHeight + safe margin + notch safe area
                bottom: `calc(${Math.max(8, keyboardHeight + 8)}px + env(safe-area-inset-bottom))`,
                // limit height so inner content scrolls (avoid modal being pushed under keyboard)
                maxHeight: `calc(100vh - ${Math.max(160, keyboardHeight + pinnedTop + 40)}px)`,
                overflow: "auto",
                zIndex: 9999,
              } as React.CSSProperties
            : undefined
        }
      >
        {/* Reduced header padding, cleaner title */}
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between bg-background/95 backdrop-blur-sm">
          <DialogTitle className="text-sm font-semibold">New Report</DialogTitle>
        </DialogHeader>

        {/* Body: tighter spacing, larger textarea area */}
        <div className="p-4 flex gap-3 bg-background min-h-[160px]">
          <div className="flex-shrink-0">
            <Avatar className="h-9 w-9 border ring-0">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex-1 flex flex-col gap-2">
            <div className="text-sm font-medium text-foreground/90 ml-1">
              {formattedName}
            </div>

            <div className="relative">
              <TextareaAutosize
                ref={textareaRef}
                placeholder="What's happening on the field?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onFocus={handleTextareaFocus}
                onBlur={handleTextareaBlur}
                minRows={minRows}
                maxRows={maxRows}
                disabled={isSubmitting}
                className={`
                  w-full
                  resize-none
                  border
                  border-gray-200
                  dark:border-neutral-700
                  rounded-lg
                  p-3
                  text-base sm:text-lg
                  placeholder:text-muted-foreground/50
                  focus-visible:ring-2 focus-visible:ring-primary/30
                  focus:border-primary
                  bg-white
                  dark:bg-slate-900
                  shadow-sm
                  transition-shadow
                  outline-none
                `}
                style={{
                  // keep a smooth line-height and nice caret area
                  lineHeight: 1.5,
                }}
              />
            </div>

            {files.length > 0 && (
              <div className="flex gap-3 overflow-x-auto py-2 scrollbar-hide mt-1">
                {files.map((f, i) => (
                  <div key={i} className="relative group flex-shrink-0">
                    <div className="h-14 w-14 rounded-xl bg-muted border flex items-center justify-center overflow-hidden">
                      {f.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(f)} alt="preview" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground px-1 text-center break-all leading-tight">
                          {f.name.slice(-12)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute -top-2 -right-2 bg-background border shadow-sm text-foreground rounded-full p-1 hover:bg-destructive hover:text-white transition-colors"
                      aria-label="remove file"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Compact footer */}
        <div className="px-4 py-3 bg-muted/30 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.mp4"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              title="Attach Files"
              className="flex items-center justify-center p-2 rounded-full hover:bg-muted/60 transition"
            >
              <Paperclip className="h-5 w-5 text-primary" />
            </button>

            {renderLocationStatus()}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || isSubmitting || locationStatus === 'loading' || locationStatus === 'denied'}
            className="rounded-full px-4 py-2 font-medium shadow-md flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending
              </>
            ) : (
              <>
                Post
                <Send className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
