import { useState, useRef, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { uploadFileToWorker } from "@/lib/upload";
import { fileServeUrl } from "@/lib/storage";
import { useMediaQuery } from "@/hooks/use-media-query";

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  X, 
  MapPin, 
  Paperclip, 
  Loader2, 
  Send, 
  AlertCircle,
} from 'lucide-react';
import { cn } from "@/lib/utils";

interface CreateReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// -----------------------------------------------------------------------------
// 1. MAIN COMPONENT (Hybrid Dialog)
// -----------------------------------------------------------------------------
export const CreateReportModal = ({ open, onOpenChange, onSuccess }: CreateReportModalProps) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        // ✅ KUNCI STABILITAS MOBILE: Flex Column Full Screen Absolute Position
        className={cn(
          "p-0 gap-0 bg-background focus:outline-none outline-none duration-200 flex flex-col h-full",
          
          // --- MOBILE STYLES (Full Screen Absolute) ---
          !isDesktop && [
            "fixed !inset-0 !z-[50]", 
            "!w-[100vw] !h-[100dvh]", // Gunakan 100dvh untuk merespons keyboard
            "!max-w-none !rounded-none border-none", 
            "!translate-x-0 !translate-y-0 !top-0 !left-0",
            "data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:slide-out-to-bottom-10"
          ],

          // --- DESKTOP STYLES ---
          isDesktop && "sm:max-w-xl sm:rounded-2xl border shadow-2xl"
        )}
      >
        <ReportFormContent 
          onClose={() => onOpenChange(false)} 
          onSuccess={onSuccess}
          isDesktop={isDesktop}
        />
      </DialogContent>
    </Dialog>
  );
};

// -----------------------------------------------------------------------------
// 2. CONTENT COMPONENT (Contains actual UI and Logic)
// -----------------------------------------------------------------------------
interface ReportFormContentProps {
  onClose: () => void;
  onSuccess: () => void;
  isDesktop: boolean;
}

const ReportFormContent = ({ onClose, onSuccess, isDesktop }: ReportFormContentProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { location, status: locationStatus, requestLocation, openPermissionHelp } = useLocation();

  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { userInitials, formattedName } = useMemo(() => {
    const rawName = user?.user_metadata?.full_name || "ME";
    const formatted = rawName.toLowerCase().split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    const parts = formatted.trim().split(/\s+/);
    let initials = "ME";
    if (parts.length > 0 && parts[0] !== "") {
      initials = parts.length === 1 ? parts[0].substring(0, 1).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return { userInitials: initials, formattedName: formatted };
  }, [user?.user_metadata?.full_name]);

  // ✅ AUTO FOCUS KEYBOARD
  useEffect(() => {
    if (!isDesktop) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isDesktop]);

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
      onClose();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLocationStatus = () => {
    if (locationStatus === 'loading') {
      return (
        <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-full animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Locating...</span>
        </div>
      );
    }
    if (locationStatus === 'denied') {
      return (
        <button onClick={openPermissionHelp} className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-full hover:bg-destructive/20 transition-colors">
          <AlertCircle className="h-3 w-3" />
          <span>Disabled</span>
        </button>
      );
    }
    if (locationStatus === 'success' && location) {
      return (
        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full cursor-default">
          <MapPin className="h-3 w-3 fill-emerald-600" />
          <span>{Math.round(location.accuracy)}m accuracy</span>
        </div>
      );
    }
    return (
      <button onClick={requestLocation} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted hover:bg-muted/80 hover:text-primary px-3 py-1.5 rounded-full transition-all group">
        <MapPin className="h-3 w-3 group-hover:text-primary transition-colors" />
        <span>Add Location</span>
      </button>
    );
  };

  return (
    // Container Flex Utama: Mengisi 100% tinggi modal (yang sudah diset 100dvh)
    <div className="flex flex-col h-full w-full bg-card">
      
      {/* --- HEADER --- */}
      {/* shrink-0: Tinggi header tetap, tidak akan terdorong keluar layar oleh keyboard */}
      <DialogHeader className={cn(
        "flex flex-row items-center justify-between bg-background/95 backdrop-blur-sm border-b shrink-0 z-20 transition-all",
        // ✅ FIX: Padding atas yang lebih besar untuk status bar aman
        isDesktop ? "px-5 py-4" : "px-4 pb-3 pt-4" 
      )}>
        <div className="flex items-center gap-3 w-full">
          
          <Button 
            variant="ghost" 
            size={isDesktop ? "icon" : "default"}
            className={cn(
              "text-muted-foreground hover:text-foreground transition-colors", 
              !isDesktop && "px-0 hover:bg-transparent font-normal text-base h-auto"
            )}
            onClick={onClose}
          >
            {isDesktop ? <X className="h-5 w-5" /> : "Cancel"}
          </Button>
          
          {isDesktop && <DialogTitle className="text-base font-semibold">New Report</DialogTitle>}
          {!isDesktop && <DialogTitle className="sr-only">New Report</DialogTitle>}
          
          {!isDesktop && (
            <div className="ml-auto">
              <Button 
                onClick={handleSubmit} 
                disabled={!description.trim() || isSubmitting || locationStatus === 'loading' || locationStatus === 'denied'}
                className="rounded-full px-5 h-8 text-sm font-bold"
                size="sm"
              >
                {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Post"}
              </Button>
            </div>
          )}
        </div>
      </DialogHeader>

      {/* --- BODY CONTENT (SCROLLABLE) --- */}
      {/* flex-1: Mengisi sisa ruang. Area ini yang memendek saat keyboard muncul. */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex gap-3 bg-background">
        <div className="flex-shrink-0">
            <Avatar className="h-10 w-10 border ring-2 ring-background">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                {userInitials}
              </AvatarFallback>
            </Avatar>
        </div>

        <div className="flex-1 flex flex-col gap-2 min-h-[100px]">
            <div className="text-sm font-semibold text-foreground/80 ml-1">
              {formattedName}
            </div>

            <Textarea
              ref={textareaRef}
              placeholder="What's happening on the field?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full flex-1 resize-none border-none shadow-none p-1 text-base sm:text-lg placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 bg-transparent"
              disabled={isSubmitting}
            />
            
            {/* File Previews */}
            {files.length > 0 && (
              <div className="flex gap-3 overflow-x-auto py-2 scrollbar-hide mt-auto pt-2">
                {files.map((f, i) => (
                  <div key={i} className="relative group flex-shrink-0">
                    <div className="h-20 w-20 rounded-xl bg-muted border flex items-center justify-center overflow-hidden">
                      {f.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(f)} alt="preview" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[9px] text-muted-foreground px-1 text-center break-all leading-tight">
                          {f.name.slice(-10)}
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={() => removeFile(i)} 
                      className="absolute -top-2 -right-2 bg-background border shadow-sm text-foreground rounded-full p-1 hover:bg-destructive hover:text-white transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* --- FOOTER / TOOLBAR --- */}
      {/* shrink-0: Tinggi footer tetap, akan didorong oleh keyboard naik agar selalu menempel di atas keyboard. */}
      <div className={cn(
        "border-t flex items-center justify-between shrink-0 bg-background z-20",
        isDesktop ? "p-4 bg-muted/30" : "p-3 pb-4" 
      )}>
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.mp4" 
            />
            
            <Button
              variant="ghost"
              size="icon"
              className="text-primary hover:text-primary hover:bg-primary/10 rounded-full h-10 w-10"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              title="Attach Files"
            >
              <Paperclip className="h-6 w-6 sm:h-5 sm:w-5" /> 
            </Button>

            {renderLocationStatus()}
          </div>

          {isDesktop && (
            <Button 
              onClick={handleSubmit} 
              disabled={!description.trim() || isSubmitting || locationStatus === 'loading' || locationStatus === 'denied'}
              className="rounded-full px-6 font-medium shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Post Report <Send className="ml-2 h-3 w-3" />
                </>
              )}
            </Button>
          )}
      </div>
    </div>
  );
};