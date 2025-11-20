// src/components/dashboard/ReportDetailModal.tsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  X,
  Save,
  Trash2,
  Upload,
  CheckCircle,
  XCircle,
  MapPin,
  ArrowLeft,
  AlertCircle,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { ImageThumbnail, VideoThumbnail, FileThumbnail } from "./AttachmentThumbnails";
import { AttachmentCarouselPreview } from "./AttachmentCarouselPreview";
import { ReportComments } from "./ReportComments";
import { uploadFileToWorker, deleteFileFromWorker } from "@/lib/upload";
import { fileServeUrl } from "@/lib/storage";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ReportDetailSkeleton } from "./ReportDetailSkeleton";
import { Separator } from "@/components/ui/separator"; 
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ReportFile {
  id: string;
  file_url?: string | null;
  storage_path?: string | null;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
}

interface ReportDetailType {
  id: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  profiles?: {
    full_name: string | null;
  } | null;
}

interface ReportDetailModalProps {
  reportId: string | null;
  open: boolean;
  onClose: () => void;
  onReportUpdated?: () => void;
  onReportDeleted?: (reportId: string) => void; 
}

export const ReportDetailModal = ({ 
  reportId, 
  open, 
  onClose, 
  onReportUpdated,
  onReportDeleted
}: ReportDetailModalProps) => {
  const { user, userRole } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ReportDetailType | null>(null);
  const [files, setFiles] = useState<ReportFile[]>([]);
  const [description, setDescription] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [isDeletingMap, setIsDeletingMap] = useState<Record<string, boolean>>({});
  
  const [reportNotFound, setReportNotFound] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // [UBAH] Default true agar komentar langsung terlihat terbuka
  const [showComments, setShowComments] = useState(true);

  useEffect(() => {
    if (open && reportId) {
      setReportNotFound(false);
      setIsDeleting(false);
      fetchReportDetail();
      // [UBAH] Reset ke true setiap kali buka report baru
      setShowComments(true);

      window.history.pushState({ modalOpen: true }, '');
      const handlePopState = (e: PopStateEvent) => {
        if (open) {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    } else {
      setReport(null);
      setFiles([]);
      setDescription("");
      setNewFiles([]);
      setRejectionReason("");
      setLoading(false);
    }
  }, [reportId, open, onClose]);

  const fetchReportDetail = async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      const { data: reportData, error: reportError } = await supabase
        .from("daily_reports")
        .select("*, profiles:user_id(full_name)")
        .eq("id", reportId)
        .maybeSingle(); 

      if (reportError) {
        if (reportError.code === 'PGRST116') {
          setReportNotFound(true);
          return;
        }
        throw reportError;
      }

      if (!reportData) {
        setReportNotFound(true);
        return;
      }

      const { data: filesData, error: filesError } = await supabase
        .from("report_files")
        .select("*")
        .eq("report_id", reportId)
        .order("id", { ascending: true });

      if (filesError) throw filesError;

      setReport(reportData as unknown as ReportDetailType);
      setDescription((reportData && reportData.description) || "");
      setFiles(filesData || []);
    } catch (err: any) {
      console.error("Error fetching report:", err);
      toast({ title: "Error", description: "Failed to load report details", variant: "destructive" });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    const oversized = selected.filter((f) => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      toast({ title: "Error", description: "File limit 10MB", variant: "destructive" });
      return;
    }
    setNewFiles((p) => [...p, ...selected]);
  };

  const removeNewFile = (index: number) => {
    setNewFiles((p) => p.filter((_, i) => i !== index));
  };

  const deleteExistingFile = useCallback(async (fileId: string) => {
        const file = files.find((f) => f.id === fileId);
        if (!file) return;
        if (!window.confirm(`Delete attachment "${file.file_name}"?`)) return;
        if (isDeletingMap[fileId]) return;

        setIsDeletingMap((s) => ({ ...s, [fileId]: true }));
        try {
            if (file.storage_path) await deleteFileFromWorker(file.storage_path);
            await supabase.from("report_files").delete().eq("id", fileId);
            setFiles((prev) => prev.filter((f) => f.id !== fileId));
            toast({ title: "Success", description: "File deleted" });
        } catch (err: any) {
            toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
        } finally {
            setIsDeletingMap((s) => { const cp = { ...s }; delete cp[fileId]; return cp; });
        }
    }, [files, isDeletingMap, toast]
  );

  const handleSave = async () => {
    if (!report || !user) return;
    setSaving(true);
    try {
      await supabase.from("daily_reports").update({ description }).eq("id", report.id);
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          const ext = file.name.split(".").pop() ?? "";
          const storagePath = `${user.id}/${report.id}-${Date.now()}.${ext}`;
          const { key } = await uploadFileToWorker(file, storagePath);
          const workerFileUrl = fileServeUrl(key);
          await supabase.from("report_files").insert({
            report_id: report.id, storage_path: key, file_url: workerFileUrl, file_name: file.name, file_size: file.size, file_type: file.type,
          });
        }
      }
      toast({ title: "Success", description: "Report updated" });
      setNewFiles([]);
      if (onReportUpdated) onReportUpdated(); 
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!report || !user) return;
    setActionLoading(true);
    try {
      await supabase.from("daily_reports").update({
        status: "approved", approved_by: user.id, approved_at: new Date().toISOString(), rejection_reason: null,
      }).eq("id", report.id);
      toast({ title: "Success", description: "Report approved" });
      if (onReportUpdated) onReportUpdated();
      onClose();
    } catch (err) { toast({ title: "Error", description: "Failed to approve", variant: "destructive" }); } 
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!report || !user || !rejectionReason.trim()) return;
    setActionLoading(true);
    try {
      await supabase.from("daily_reports").update({
        status: "rejected", approved_by: user.id, approved_at: new Date().toISOString(), rejection_reason: rejectionReason,
      }).eq("id", report.id);
      toast({ title: "Success", description: "Report rejected" });
      setShowRejectDialog(false);
      if (onReportUpdated) onReportUpdated();
      onClose();
    } catch (err) { toast({ title: "Error", description: "Failed to reject", variant: "destructive" }); }
    finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    if (!report) return;
    if (!window.confirm("Are you sure you want to delete this report? This action cannot be undone.")) return;
    
    setIsDeleting(true);
    setActionLoading(true);
    try {
        await supabase.from("report_files").delete().eq("report_id", report.id);
        await supabase.from("daily_reports").delete().eq("id", report.id);
        toast({ title: "Success", description: "Report deleted" });
        if (onReportDeleted) onReportDeleted(report.id);
        if (onReportUpdated) onReportUpdated(); 
        onClose();
    } catch (err) { toast({ title: "Error", description: "Failed to delete", variant: "destructive" }); }
    finally { setActionLoading(false); setIsDeleting(false); }
  };

  // --- UTILS ---
  const openGoogleMaps = () => {
    if (report?.latitude && report?.longitude) {
      // [UBAH] Menggunakan format standar Google Maps yang pasti valid
      window.open(`https://maps.google.com/?q=${report.latitude},${report.longitude}`, '_blank');
    }
  };

  const formatFullDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" }).format(new Date(dateString));
  };

  const formatTime = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(dateString));
  };

  const canEdit = report && userRole === "staff" && report.user_id === user?.id && report.status === "pending";
  const canDelete = report && (userRole === "admin" || (userRole === "staff" && report.user_id === user?.id && report.status === "pending"));
  const canApproveReject = userRole === "approver" || userRole === "admin";

  if (reportNotFound) return <Sheet open={open} onOpenChange={onClose}><SheetContent side="right"><div className="p-6 text-center">Report not found</div></SheetContent></Sheet>;
  if (isDeleting) return <Sheet open={open} onOpenChange={() => {}}><SheetContent side="right"><div className="p-6 text-center">Deleting...</div></SheetContent></Sheet>;

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent 
          side="right" 
          className="w-full p-0 sm:max-w-xl [&>button]:hidden border-l shadow-2xl flex flex-col h-full" 
        >
            <VisuallyHidden>
                <SheetTitle>Report Details</SheetTitle>
                <SheetDescription>View daily report details</SheetDescription>
            </VisuallyHidden>

            {loading ? (
                <ReportDetailSkeleton />
            ) : !report ? (
                <div className="flex items-center justify-center h-screen text-muted-foreground">Report not found</div>
            ) : (
            <>
              {/* --- HEADER --- */}
              <div className="flex-none border-b bg-background/95 backdrop-blur z-20 sticky top-0">
                <div className="px-4 py-3 flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9 -ml-1 text-muted-foreground hover:text-foreground rounded-full">
                      <ArrowLeft className="h-5 w-5" />
                    </Button>

                    <div className="flex-1 flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 flex-shrink-0 border ring-1 ring-background">
                            <AvatarFallback className="bg-secondary text-secondary-foreground font-medium text-sm">
                                {getInitials(report.profiles?.full_name || "U")}
                            </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex flex-col overflow-hidden justify-center">
                            <span className="font-semibold text-sm truncate leading-tight">
                                {report.profiles?.full_name || "Unknown User"}
                            </span>
                            <div className="flex items-center text-xs text-muted-foreground gap-1.5 truncate mt-0.5">
                                <span className="flex items-center gap-1">
                                   {formatFullDate(report.created_at)}, {formatTime(report.created_at)}
                                </span>
                                
                                {report.latitude && report.longitude && (
                                    <>
                                        <span className="text-muted-foreground/40">•</span>
                                        <div 
                                            className="flex items-center gap-0.5 text-primary hover:underline cursor-pointer transition-colors font-medium group"
                                            onClick={openGoogleMaps}
                                        >
                                            <MapPin className="h-3 w-3 group-hover:text-primary" />
                                            <span>Location</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex-shrink-0">
                        {report.status === "approved" ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 py-1 px-2">
                                <CheckCircle className="h-3 w-3 mr-1" /> <span className="hidden xs:inline">Approved</span>
                            </Badge>
                        ) : report.status === "rejected" ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 py-1 px-2">
                                <XCircle className="h-3 w-3 mr-1" /> <span className="hidden xs:inline">Rejected</span>
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200 py-1 px-2">
                                <Clock className="h-3 w-3 mr-1" /> <span className="hidden xs:inline">Pending</span>
                            </Badge>
                        )}
                    </div>
                </div>
              </div>

              {/* --- CONTENT --- */}
              <div className="flex-1 overflow-y-auto bg-background scroll-smooth">
                <div className="pb-32"> 
                  
                    {/* 1. Description */}
                    <div className="px-5 py-4">
                        {canEdit ? (
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="min-h-[120px] text-base leading-relaxed border-muted focus-visible:ring-primary resize-none p-0 border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent placeholder:text-muted-foreground/50"
                                placeholder="Write description here..."
                            />
                        ) : (
                            <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground break-words font-normal">
                                {description || <span className="text-muted-foreground italic">No description provided.</span>}
                            </div>
                        )}

                        {/* Rejection Notice */}
                        {report.status === "rejected" && report.rejection_reason && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex gap-3 items-start animate-in fade-in slide-in-from-top-1">
                                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-red-800">Report Rejected</p>
                                    <p className="text-sm text-red-700 mt-0.5 leading-snug">{report.rejection_reason}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. Attachments */}
                    {(files.length > 0 || newFiles.length > 0 || canEdit) && (
                        <div className="px-5 pb-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {files.map((file, index) => (
                                    <div key={file.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted/30 border shadow-sm hover:shadow-md transition-all">
                                        {file.file_type?.startsWith("image/") ? (
                                            <ImageThumbnail file={file} onClick={() => { setPreviewInitialIndex(index); setPreviewOpen(true); }} canEdit={canEdit} onDelete={() => deleteExistingFile(file.id)} saving={isDeletingMap[file.id]} />
                                        ) : file.file_type?.startsWith("video/") ? (
                                            <VideoThumbnail file={file} onClick={() => { setPreviewInitialIndex(index); setPreviewOpen(true); }} canEdit={canEdit} onDelete={() => deleteExistingFile(file.id)} saving={isDeletingMap[file.id]} />
                                        ) : (
                                            <FileThumbnail file={file} onClick={() => { setPreviewInitialIndex(index); setPreviewOpen(true); }} canEdit={canEdit} onDelete={() => deleteExistingFile(file.id)} saving={isDeletingMap[file.id]} isPdf={file.file_type === "application/pdf"} isDoc={file.file_type?.includes("word") || file.file_type?.includes("document")} isExcel={file.file_type?.includes("sheet") || file.file_type?.includes("excel")} />
                                        )}
                                    </div>
                                ))}

                                {newFiles.map((file, index) => (
                                    <div key={`new-${index}`} className="relative aspect-square bg-background border border-dashed border-primary/30 rounded-lg flex flex-col items-center justify-center p-2 animate-in fade-in zoom-in-95">
                                        <span className="text-[10px] text-center line-clamp-2 text-muted-foreground break-all font-medium">{file.name}</span>
                                        <Button size="icon" variant="destructive" onClick={() => removeNewFile(index)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md scale-90 hover:scale-100 transition-transform"><X className="h-3 w-3" /></Button>
                                    </div>
                                ))}

                                {canEdit && (
                                    <div className="aspect-square">
                                        <input type="file" multiple onChange={handleFileSelect} className="hidden" id="file-upload-modal" />
                                        <label htmlFor="file-upload-modal" className="flex flex-col items-center justify-center w-full h-full border-2 border-dashed border-muted-foreground/20 rounded-lg hover:bg-secondary/50 hover:border-primary/50 cursor-pointer transition-colors bg-muted/10">
                                            <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                                            <span className="text-xs text-muted-foreground font-medium">Upload</span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <Separator className="my-2 opacity-60" />
                    
                    {/* 3. Comments Section (Accordion - Default Open) */}
                    <div className="px-0">
                        <button 
                          onClick={() => setShowComments(!showComments)}
                          className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors group"
                        >
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                            <MessageSquare className="h-4 w-4" />
                            <span>Comments</span>
                          </div>
                          {showComments ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>

                        <div className={cn(
                          "grid transition-all duration-300 ease-in-out",
                          showComments ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        )}>
                          <div className="overflow-hidden">
                            <div className="px-5 pb-4 pt-0">
                              <ReportComments reportId={report.id} />
                            </div>
                          </div>
                        </div>
                    </div>

                </div>
              </div>

              {/* --- STICKY ACTION BAR --- */}
              {(canEdit || canApproveReject || canDelete) && (
                <div className="flex-none p-4 bg-background border-t shadow-[0_-4px_10px_rgba(0,0,0,0.03)] z-30 sticky bottom-0 w-full safe-area-pb">
                    <div className="flex items-center gap-3 max-w-md mx-auto w-full">
                        
                        

                        {canEdit && (
                            <Button 
                                onClick={handleSave} 
                                disabled={saving}
                                className="flex-1 h-11 text-base font-medium rounded-xl shadow-sm"
                            >
                                {saving ? (
                                    <> <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Saving... </>
                                ) : (
                                    <> <Save className="h-5 w-5 mr-2" /> Save Changes </>
                                )}
                            </Button>
                        )}

                        {canDelete && (
                            <Button 
                                variant="outline" 
                                size="icon"
                                onClick={handleDelete} 
                                disabled={actionLoading}
                                className="flex-shrink-0 h-11 w-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive rounded-xl"
                            >
                                {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                            </Button>
                        )}

                        {canApproveReject && (
                            <>
                                {report.status !== 'rejected' && (
                                    <Button 
                                        variant="outline"
                                        onClick={() => setShowRejectDialog(true)}
                                        disabled={actionLoading}
                                        className="flex-1 h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive font-medium rounded-xl"
                                    >
                                        <XCircle className="h-5 w-5 mr-2" /> Reject
                                    </Button>
                                )}
                                
                                {report.status !== 'approved' && (
                                    <Button 
                                        onClick={handleApprove}
                                        disabled={actionLoading}
                                        className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl shadow-sm"
                                    >
                                        {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5 mr-2" />}
                                        Approve
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Reject Report</DialogTitle>
                <DialogDescription>Please provide a reason for rejection.</DialogDescription>
            </DialogHeader>
            <div className="py-2">
                <Textarea 
                    placeholder="e.g. Blurry photo, incorrect location..." 
                    value={rejectionReason} 
                    onChange={(e) => setRejectionReason(e.target.value)} 
                    rows={3}
                    className="resize-none focus-visible:ring-destructive"
                />
            </div>
            <DialogFooter className="flex gap-2 sm:gap-0">
                <Button variant="ghost" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleReject} disabled={!rejectionReason.trim() || actionLoading}>
                    {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm Reject
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <AttachmentCarouselPreview files={files} initialIndex={previewInitialIndex} open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
  );
};