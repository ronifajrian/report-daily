// src/components/dashboard/ReportDetailModal.tsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { ImageThumbnail, VideoThumbnail, FileThumbnail } from "./AttachmentThumbnails";
import { AttachmentCarouselPreview } from "./AttachmentCarouselPreview";
import { ReportComments } from "./ReportComments";
import { uploadFileToWorker, deleteFileFromWorker } from "@/lib/upload";
import { fileServeUrl } from "@/lib/storage";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ReportDetailSkeleton } from "./ReportDetailSkeleton";

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
}

interface ReportDetailModalProps {
  reportId: string | null;
  open: boolean;
  onClose: () => void;
  onReportUpdated?: () => void;
}

export const ReportDetailModal = ({ reportId, open, onClose, onReportUpdated }: ReportDetailModalProps) => {
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

  useEffect(() => {
    if (open && reportId) {
      fetchReportDetail();
      
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
        .select("*")
        .eq("id", reportId)
        .single();

      if (reportError) throw reportError;

      const { data: filesData, error: filesError } = await supabase
        .from("report_files")
        .select("*")
        .eq("report_id", reportId)
        .order("id", { ascending: true });

      if (filesError) throw filesError;

      setReport(reportData as ReportDetailType);
      setDescription((reportData && reportData.description) || "");
      setFiles(filesData || []);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to load report", variant: "destructive" });
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
      toast({ title: "Error", description: "Some files exceed 10MB limit", variant: "destructive" });
      return;
    }
    setNewFiles((p) => [...p, ...selected]);
  };

  const removeNewFile = (index: number) => {
    setNewFiles((p) => p.filter((_, i) => i !== index));
  };

  const deleteExistingFile = useCallback(
    async (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) {
        toast({ title: "Error", description: "File not found", variant: "destructive" });
        return;
      }

      const confirmed = window.confirm(`Hapus attachment "${file.file_name}"?`);
      if (!confirmed) return;

      if (isDeletingMap[fileId]) return;

      setIsDeletingMap((s) => ({ ...s, [fileId]: true }));

      const prevFiles = files;

      try {
        const storagePath = file.storage_path;
        if (storagePath) {
          try {
            await deleteFileFromWorker(storagePath);
          } catch (workerErr) {
            console.warn("Worker delete failed:", workerErr);
            throw new Error("Failed to delete file from storage. Please try again.");
          }
        }

        const { error: dbErr } = await supabase.from("report_files").delete().eq("id", fileId);
        if (dbErr) throw dbErr;

        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        toast({ title: "Success", description: `${file.file_name} deleted` });
      } catch (err: any) {
        console.error("deleteExistingFile error:", err);
        setFiles(prevFiles);
        toast({ title: "Error", description: err?.message || "Failed to delete", variant: "destructive" });
      } finally {
        setIsDeletingMap((s) => {
          const cp = { ...s };
          delete cp[fileId];
          return cp;
        });
      }
    },
    [files, isDeletingMap, toast]
  );

  const handleSave = async () => {
    if (!report || !user) return;
    setSaving(true);
    try {
      const { error: updateError } = await supabase.from("daily_reports").update({ description }).eq("id", report.id);
      if (updateError) throw updateError;

      if (newFiles.length > 0) {
        for (const file of newFiles) {
          const ext = file.name.split(".").pop() ?? "";
          const storagePath = `${user.id}/${report.id}-${Date.now()}.${ext}`;

          const { key } = await uploadFileToWorker(file, storagePath);

          const workerFileUrl = fileServeUrl(key);

          const { error: insertError } = await supabase.from("report_files").insert({
            report_id: report.id,
            storage_path: key,
            file_url: workerFileUrl,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
          });

          if (insertError) throw insertError;
        }
      }

      toast({ title: "Success", description: "Report updated" });
      setNewFiles([]);
      
      // ✅ FIX: Close modal first, then trigger refresh
      onClose();
      
      // Small delay to ensure modal closes before refresh
      setTimeout(() => {
        if (onReportUpdated) onReportUpdated();
      }, 100);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!report || !user) return;
    setActionLoading(true);
    try {
      const { error: updateError } = await supabase
        .from("daily_reports")
        .update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", report.id);

      if (updateError) throw updateError;

      await supabase.from("report_audit_logs").insert({
        report_id: report.id,
        user_id: user.id,
        action: "approved",
        previous_status: report.status,
        new_status: "approved",
      });

      toast({ title: "Success", description: "Report approved" });
      
      // ✅ FIX: Close modal first, then trigger refresh
      onClose();
      
      setTimeout(() => {
        if (onReportUpdated) onReportUpdated();
      }, 100);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to approve", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!report || !user || !rejectionReason.trim()) {
      toast({ title: "Error", description: "Please provide a rejection reason", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      const { error: updateError } = await supabase
        .from("daily_reports")
        .update({
          status: "rejected",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq("id", report.id);

      if (updateError) throw updateError;

      await supabase.from("report_audit_logs").insert({
        report_id: report.id,
        user_id: user.id,
        action: "rejected",
        previous_status: report.status,
        new_status: "rejected",
        reason: rejectionReason,
      });

      toast({ title: "Success", description: "Report rejected" });
      setShowRejectDialog(false);
      setRejectionReason("");
      
      // ✅ FIX: Close modal first, then trigger refresh
      onClose();
      
      setTimeout(() => {
        if (onReportUpdated) onReportUpdated();
      }, 100);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to reject", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!report) return;
    if (!confirm("Are you sure you want to delete this report?")) return;

    setActionLoading(true);
    try {
      const { data: attachments, error: fetchErr } = await supabase
        .from("report_files")
        .select("id, storage_path")
        .eq("report_id", report.id);

      if (fetchErr) throw fetchErr;

      const errors: Array<{ id?: string; key?: string; error: any }> = [];
      if (Array.isArray(attachments)) {
        for (const a of attachments) {
          const key = (a as any).storage_path;
          const id = (a as any).id;
          if (key) {
            try {
              await deleteFileFromWorker(key);
            } catch (e) {
              console.warn("Failed deleting attachment at worker:", key, e);
              errors.push({ id, key, error: e });
            }
          }
        }
      }

      const { error: delFilesErr } = await supabase.from("report_files").delete().eq("report_id", report.id);
      if (delFilesErr) throw delFilesErr;

      const { error: delReportErr } = await supabase.from("daily_reports").delete().eq("id", report.id);
      if (delReportErr) throw delReportErr;

      if (errors.length > 0) {
        toast({
          title: "Partial success",
          description: `Report deleted but ${errors.length} attachment(s) failed to delete from storage.`,
          variant: "default",
        });
      } else {
        toast({ title: "Success", description: "Report and attachments deleted" });
      }

      onClose();
      
      setTimeout(() => {
        if (onReportUpdated) onReportUpdated();
      }, 100);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete report", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const canEdit = report && userRole === "staff" && report.user_id === user?.id && report.status === "pending";
  const canDelete =
    report && (userRole === "admin" || (userRole === "staff" && report.user_id === user?.id && report.status === "pending"));
  const canApproveReject = userRole === "approver" || userRole === "admin";

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent 
          side="right" 
          className="w-full p-0 sm:max-w-full [&>button]:hidden"
        >
            <VisuallyHidden>
            <SheetTitle>Report Details</SheetTitle>
            <SheetDescription>
                Menampilkan detail lengkap, lampiran, dan komentar untuk laporan harian.
            </SheetDescription>
            </VisuallyHidden>

            {loading ? (
            <ReportDetailSkeleton />
            ) : !report ? (
            <div className="flex items-center justify-center h-screen">
              <p className="text-muted-foreground">Report not found</p>
            </div>
          ) : (
            <div className="flex flex-col h-screen">
              {/* Fixed Header */}
              <div className="flex-none border-b bg-background">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onClose}
                      className="h-9 w-9 flex-shrink-0"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h2 className="text-lg font-semibold flex-1 truncate">Report Details</h2>
                    
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border flex-shrink-0">
                      {report.status === "approved" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      ) : report.status === "rejected" ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                      )}
                      <span className="text-xs font-medium hidden sm:inline">
                        {report.status === "approved" ? "Approved" : report.status === "rejected" ? "Rejected" : "Pending"}
                      </span>
                    </div>
                  </div>

                  {(canEdit || canApproveReject || canDelete) && (
                    <div className="flex flex-wrap gap-2">
                      {canEdit && (
                        <Button onClick={handleSave} disabled={saving} size="sm">
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Save
                            </>
                          )}
                        </Button>
                      )}
                      {canApproveReject && report.status !== "approved" && (
                        <Button onClick={handleApprove} disabled={actionLoading} size="sm">
                          {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                          Approve
                        </Button>
                      )}
                      {canApproveReject && report.status !== "rejected" && (
                        <Button onClick={() => setShowRejectDialog(true)} disabled={actionLoading} variant="destructive" size="sm">
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      )}
                      {canDelete && (
                        <Button onClick={handleDelete} variant="outline" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-6 space-y-6 pb-20">
                  {/* Description */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Description</Label>
                    {canEdit ? (
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={12}
                        className="resize-none w-full"
                        placeholder="Enter report description..."
                      />
                    ) : (
                      <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 p-4 rounded-lg break-words">
                        {description || "No description provided"}
                      </div>
                    )}

                    {report.status === "rejected" && report.rejection_reason && (
                      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                        <Label className="text-destructive font-semibold text-sm">Rejection Reason</Label>
                        <p className="mt-2 text-sm text-destructive/90 break-words">{report.rejection_reason}</p>
                      </div>
                    )}

                    {report.latitude && report.longitude && (
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(`https://www.google.com/maps?q=${report.latitude},${report.longitude}`, "_blank")
                          }
                        >
                          <MapPin className="h-4 w-4 mr-2" />
                          View Location
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Attachments */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Attachments ({files.length})</Label>
                    
                    {files.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {files.map((file) => {
                          const isImage = file.file_type?.startsWith("image/");
                          const isVideo = file.file_type?.startsWith("video/");
                          const isPdf = file.file_type === "application/pdf";
                          const isDoc = file.file_type?.includes("word") || file.file_type?.includes("document");
                          const isExcel = file.file_type?.includes("sheet") || file.file_type?.includes("excel");

                          const handleFileClick = () => {
                            const fileIndex = files.findIndex((f) => f.id === file.id);
                            setPreviewInitialIndex(fileIndex);
                            setPreviewOpen(true);
                          };

                          return (
                            <div key={file.id} className="relative group">
                              {isImage ? (
                                <ImageThumbnail
                                  file={file}
                                  onClick={handleFileClick}
                                  canEdit={canEdit}
                                  onDelete={() => deleteExistingFile(file.id)}
                                  saving={isDeletingMap[file.id]}
                                />
                              ) : isVideo ? (
                                <VideoThumbnail
                                  file={file}
                                  onClick={handleFileClick}
                                  canEdit={canEdit}
                                  onDelete={() => deleteExistingFile(file.id)}
                                  saving={isDeletingMap[file.id]}
                                />
                              ) : (
                                <FileThumbnail
                                  file={file}
                                  onClick={handleFileClick}
                                  canEdit={canEdit}
                                  onDelete={() => deleteExistingFile(file.id)}
                                  saving={isDeletingMap[file.id]}
                                  isPdf={isPdf}
                                  isDoc={isDoc}
                                  isExcel={isExcel}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {files.length === 0 && !canEdit && (
                      <p className="text-sm text-muted-foreground text-center py-8 bg-muted/30 rounded-lg">No attachments</p>
                    )}

                    {canEdit && (
                      <div className="pt-2 space-y-3">
                        <input type="file" multiple onChange={handleFileSelect} className="hidden" id="file-upload-modal" />
                        <label htmlFor="file-upload-modal">
                          <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                            <span>
                              <Upload className="h-4 w-4 mr-2" />
                              Add Files
                            </span>
                          </Button>
                        </label>
                        
                        {newFiles.length > 0 && (
                          <div className="space-y-2">
                            {newFiles.map((file, index) => (
                              <div key={index} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                                <span className="text-xs truncate flex-1">{file.name}</span>
                                <Button size="sm" variant="ghost" onClick={() => removeNewFile(index)} className="h-7 w-7 p-0">
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Comments */}
                  <ReportComments reportId={report.id} />
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <VisuallyHidden>
            <DialogTitle>Reject Report</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this report</DialogDescription>
          </VisuallyHidden>

            <DialogHeader>
            <h2 className="text-lg font-semibold leading-none tracking-tight">Reject Report</h2>
            <p className="text-sm text-muted-foreground">Please provide a reason for rejecting this report</p>
            </DialogHeader>

          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleReject} disabled={!rejectionReason.trim() || actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AttachmentCarouselPreview files={files} initialIndex={previewInitialIndex} open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
  );
};