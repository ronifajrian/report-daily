// src/components/ReportDetail.tsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Save, Trash2, Upload, X, FileText, CheckCircle, XCircle, MapPin } from "lucide-react";
import { ImageThumbnail, VideoThumbnail, FileThumbnail } from "./AttachmentThumbnails";
import { Badge } from "@/components/ui/badge";
import { AttachmentCarouselPreview } from "./AttachmentCarouselPreview";
import { ReportComments } from "./ReportComments";
import { ScrollArea } from "@/components/ui/scroll-area";
import { uploadFileToWorker, deleteFileFromWorker } from "@/lib/upload";
import { fileServeUrl } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const ReportDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
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

  // per-file deleting map
  const [isDeletingMap, setIsDeletingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchReportDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchReportDetail = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: reportData, error: reportError } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("id", id)
        .single();

      if (reportError) throw reportError;

      const { data: filesData, error: filesError } = await supabase
        .from("report_files")
        .select("*")
        .eq("report_id", id)
        .order("id", { ascending: true });

      if (filesError) throw filesError;

      setReport(reportData as ReportDetailType);
      setDescription((reportData && reportData.description) || "");
      setFiles(filesData || []);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to load report", variant: "destructive" });
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

  // delete single file (attachment) — with per-file loading + optimistic-safe flow
  const deleteExistingFile = useCallback(
    async (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) {
        toast({ title: "Error", description: "File not found", variant: "destructive" });
        return;
      }

      // confirmation before doing anything
      const confirmed = window.confirm(`Hapus attachment "${file.file_name}"?`);
      if (!confirmed) return;

      if (isDeletingMap[fileId]) return; // guard double delete

      // set per-file deleting flag immediately for UX
      setIsDeletingMap((s) => ({ ...s, [fileId]: true }));

      // keep backup for rollback
      const prevFiles = files;

      try {
        // 1) attempt storage deletion (if storage_path exists)
        const storagePath = file.storage_path;
        if (storagePath) {
          try {
            await deleteFileFromWorker(storagePath);
          } catch (workerErr) {
            // Worker deletion failed — warn but continue to cleanup DB OR decide to abort
            console.warn("Worker delete failed:", workerErr);
            // Option: abort and rollback so user can retry. We'll abort here to avoid orphan record removal by mistake.
            throw new Error("Failed to delete file from storage. Please try again.");
          }
        }

        // 2) delete DB record
        const { error: dbErr } = await supabase.from("report_files").delete().eq("id", fileId);
        if (dbErr) throw dbErr;

        // 3) update UI state (remove)
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        toast({ title: "Success", description: `${file.file_name} deleted` });
      } catch (err: any) {
        console.error("deleteExistingFile error:", err);
        // rollback UI (we didn't remove from UI until success, but ensure full rollback for safety)
        setFiles(prevFiles);
        toast({ title: "Error", description: err?.message || "Failed to delete", variant: "destructive" });
      } finally {
        // clear per-file flag
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
      fetchReportDetail();
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
      fetchReportDetail();
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
      fetchReportDetail();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to reject", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // delete whole report (including attachments)
  const handleDelete = async () => {
    if (!report) return;
    if (!confirm("Are you sure you want to delete this report?")) return;

    setActionLoading(true);
    try {
      // 1) Ambil semua attachments untuk report ini
      const { data: attachments, error: fetchErr } = await supabase
        .from("report_files")
        .select("id, storage_path")
        .eq("report_id", report.id);

      if (fetchErr) throw fetchErr;

      // 2) Hapus masing-masing file via server-side function
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
              // lanjutkan untuk membersihkan DB
            }
          }
        }
      }

      // 3) Hapus semua record file di DB untuk report ini
      const { error: delFilesErr } = await supabase.from("report_files").delete().eq("report_id", report.id);
      if (delFilesErr) throw delFilesErr;

      // 4) Hapus report
      const { error: delReportErr } = await supabase.from("daily_reports").delete().eq("id", report.id);
      if (delReportErr) throw delReportErr;

      // 5) Notifikasi hasil
      if (errors.length > 0) {
        toast({
          title: "Partial success",
          description: `Report deleted but ${errors.length} attachment(s) failed to delete from storage.`,
          variant: "default",
        });
      } else {
        toast({ title: "Success", description: "Report and attachments deleted" });
      }

      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete report", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Report not found</p>
      </div>
    );
  }

  const canEdit = userRole === "staff" && report.user_id === user?.id && report.status === "pending";
  const canDelete =
    userRole === "admin" || (userRole === "staff" && report.user_id === user?.id && report.status === "pending");
  const canApproveReject = userRole === "approver" || userRole === "admin";

  return (
    <>
    <div className="flex flex-col h-screen bg-background">
        {/* Fixed Header with Actions */}
        <div className="sticky top-0 z-10 bg-background border-b shadow-sm">
          <div className="container max-w-4xl mx-auto px-4 py-4">
            {/* Top Row: Back Button and Status */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" onClick={() => navigate("/dashboard")} size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              {/* Status Indicator - Non-interactive */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border">
                {report.status === "approved" ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                ) : report.status === "rejected" ? (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                )}
                <span className="text-xs font-medium">
                  {report.status === "approved" ? "Approved" : report.status === "rejected" ? "Rejected" : "Pending Review"}
                </span>
              </div>
            </div>

            {/* Action Buttons - Only show if user has permissions */}
            {(canEdit || canApproveReject || canDelete) && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
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
                        Save Changes
                      </>
                    )}
                  </Button>
                )}
                {canApproveReject && report.status !== "approved" && (
                  <Button onClick={handleApprove} disabled={actionLoading} variant="default" size="sm">
                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
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

        {/* Scrollable Content Area */}
        <ScrollArea className="flex-1">
          <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
            {/* Description Card */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Description</CardTitle>
              </CardHeader>
              <CardContent>
                {canEdit ? (
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                    className="resize-none"
                    placeholder="Enter report description..."
                  />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {description || "No description provided"}
                  </p>
                )}

                {report.status === "rejected" && report.rejection_reason && (
                  <div className="mt-4 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <Label className="text-destructive font-semibold text-sm">Rejection Reason</Label>
                    <p className="mt-2 text-sm text-destructive/90">{report.rejection_reason}</p>
                  </div>
                )}

                {report.latitude && report.longitude && (
                  <div className="mt-4 pt-4 border-t">
                    <Label 
                      className="flex items-center gap-2 cursor-pointer text-primary hover:text-primary/80 transition-colors w-fit text-sm"
                      onClick={() =>
                        window.open(`https://www.google.com/maps?q=${report.latitude},${report.longitude}`, "_blank")
                      }
                    >
                      <MapPin className="h-4 w-4" />
                      View Location on Map
                    </Label>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Attachments Card */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Attachments ({files.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {files.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {files.map((file) => {
                      const isImage = file.file_type?.startsWith("image/");
                      const isVideo = file.file_type?.startsWith("video/");
                      const isPdf = file.file_type === "application/pdf";
                      const isDoc = file.file_type?.includes("word") || file.file_type?.includes("document");
                      const isExcel = file.file_type?.includes("sheet") || file.file_type?.includes("excel");

                      const handleFileClick = () => {
                        const fileIndex = files.findIndex(f => f.id === file.id);
                        setPreviewInitialIndex(fileIndex);
                        setPreviewOpen(true);
                      };

                      return (
                        <div key={file.id} className="relative group">
                          {isImage ? (
                            <ImageThumbnail file={file} onClick={handleFileClick} canEdit={canEdit} onDelete={() => deleteExistingFile(file.id)} saving={saving} />
                          ) : isVideo ? (
                            <VideoThumbnail file={file} onClick={handleFileClick} canEdit={canEdit} onDelete={() => deleteExistingFile(file.id)} saving={saving} />
                          ) : (
                            <FileThumbnail 
                              file={file} 
                              onClick={handleFileClick} 
                              canEdit={canEdit} 
                              onDelete={() => deleteExistingFile(file.id)} 
                              saving={saving}
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
                  <p className="text-sm text-muted-foreground text-center py-8">No attachments</p>
                )}

                {canEdit && (
                  <div className="pt-2">
                    <Label className="text-sm font-medium mb-2 block">Add New Files</Label>
                    <input type="file" multiple onChange={handleFileSelect} className="hidden" id="file-upload" />
                    <label htmlFor="file-upload">
                      <Button variant="outline" className="w-full" size="sm" asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          Select Files
                        </span>
                      </Button>
                    </label>
                    {newFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
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
          </CardContent>
        </Card>

        {/* Comments Section */}
        <ReportComments reportId={report.id} />
        </div>
        </ScrollArea>
      </div>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Report</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this report</DialogDescription>
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
              Reject Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AttachmentCarouselPreview
        files={files}
        initialIndex={previewInitialIndex}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
};

export default ReportDetail;
