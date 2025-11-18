import { useState, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { uploadFileToWorker } from "@/lib/upload";
import { fileServeUrl } from "@/lib/storage";
import { useMediaQuery } from "@/hooks/use-media-query";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  MapPin, 
  Paperclip, 
  Loader2, 
  X, 
  Send, 
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickPostInputProps {
  onSuccess: () => void;
}

export const QuickPostInput = ({ onSuccess }: QuickPostInputProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { 
    location, 
    status: locationStatus, 
    requestLocation, 
    openPermissionHelp 
  } = useLocation();

  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(f => f.size <= 10 * 1024 * 1024);
      if (validFiles.length !== newFiles.length) {
        toast({ title: "Warning", description: "Some files >10MB skipped", variant: "destructive" });
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

      setDescription("");
      setFiles([]);
      toast({ title: "Posted!", description: "Activity log updated." });
      onSuccess();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLocationButton = () => {
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
          <span>On • ±{Math.round(location.accuracy)}m</span>
        </div>
      );
    }
    return (
      <button onClick={requestLocation} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted hover:bg-muted/80 hover:text-primary px-3 py-1.5 rounded-full transition-all group" title="Enable Location">
        <MapPin className="h-3 w-3 group-hover:text-primary transition-colors" />
        <span>Location</span>
      </button>
    );
  };

  return (
    <div className={cn(
      "bg-card border rounded-2xl shadow-sm transition-all overflow-hidden",
      isDesktop ? "p-0" : "bg-card/95"
    )}>
      {/* Container Utama */}
      <div className={cn("flex flex-col", isDesktop ? "p-5" : "p-3")}>
        
        {/* Bagian Atas: Avatar & Input */}
        <div className="flex gap-3 mb-2">
          {/* Avatar */}
          {!isDesktop && (
            <div className="flex-shrink-0 pt-1">
              <Avatar className="h-9 w-9 border ring-2 ring-background">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

          {/* Input Area */}
          <div className="flex-1 min-w-0 space-y-1">
            {!isDesktop && (
              <div className="text-xs font-semibold text-foreground/80 ml-1">
                {formattedName}
              </div>
            )}

            <Textarea
              placeholder={isDesktop ? "What did you accomplish today?" : "What's happening?"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(
                "resize-none border-none shadow-none p-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0",
                isDesktop ? "text-lg min-h-[60px]" : "text-sm min-h-[50px] px-1"
              )}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* File Previews (Jika ada) */}
        {files.length > 0 && (
          <div className="flex gap-2 overflow-x-auto py-2 scrollbar-hide mb-2 pl-[1px]">
            {files.map((f, i) => (
              <div key={i} className="relative group flex-shrink-0">
                <div className="h-14 w-14 rounded-lg bg-muted border flex items-center justify-center overflow-hidden">
                  {f.type.startsWith('image/') ? (
                    <img src={URL.createObjectURL(f)} alt="preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-muted-foreground px-1 text-center break-all">{f.name.slice(-6)}</span>
                  )}
                </div>
                <button onClick={() => removeFile(i)} className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full p-1 hover:bg-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Garis Pemisah Desktop */}
        {isDesktop && <div className="h-px bg-border/40 w-full my-2" />}

        {/* Toolbar Bawah (Icons Sejajar Kiri dengan Container, bukan diindent) */}
        <div className={cn("flex items-center justify-between", !isDesktop && "pt-1")}>
          <div className="flex items-center gap-1">
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.mp4" />
            
            {/* Icon Attachment */}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full -ml-2" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
              <Paperclip className="h-4 w-4" />
            </Button>

            {/* Icon Location */}
            {renderLocationButton()}
          </div>

          {/* Post Button */}
          <Button 
            onClick={handleSubmit} 
            disabled={!description.trim() || isSubmitting || locationStatus === 'loading' || locationStatus === 'denied'}
            className={cn("rounded-full font-semibold shadow-sm", isDesktop ? "px-6 h-10" : "px-4 h-8 text-xs")}
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Post <Send className="ml-2 h-3 w-3" /></>}
          </Button>
        </div>

      </div>
    </div>
  );
};