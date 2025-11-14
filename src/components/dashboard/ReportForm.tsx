// src/components/ReportForm.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Upload, X } from "lucide-react";
import { z } from "zod";
import { uploadFileToWorker } from "@/lib/upload";
import { fileServeUrl } from "@/lib/storage";

const reportSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(1000),
});

interface ReportFormProps {
  onSuccess: () => void;
}

const ReportForm = ({ onSuccess }: ReportFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    if (!location) getCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser does not support geolocation",
        variant: "destructive",
      });
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(newLocation);
        setLocationLoading(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        toast({
          title: "Location access denied",
          description: "Please enable location access in your browser to submit reports",
          variant: "destructive",
        });
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = Array.from(e.target.files);
    const oversized = selectedFiles.filter((f) => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      toast({
        title: "Error",
        description: "Some files exceed 10MB limit",
        variant: "destructive",
      });
      return;
    }
    setFiles((p) => [...p, ...selectedFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((p) => p.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Not authenticated", description: "Please login first", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      reportSchema.parse({ description });

      if (!location) {
        toast({ title: "Location required", description: "Please allow location access", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Insert report row first
      const { data: reportData, error: insertError } = await supabase
        .from("daily_reports")
        .insert({
          user_id: user.id,
          description: description.trim(),
          latitude: location.latitude,
          longitude: location.longitude,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      if (!reportData || !reportData.id) throw new Error("Failed to create report");

      // Upload files via Worker and insert file records with storage_path + file_url
      if (files.length > 0) {
        for (const file of files) {
          const ext = file.name.split(".").pop() ?? "";
          // build a unique path including user & report id
          const storagePath = `${user.id}/${reportData.id}-${Date.now()}.${ext}`;

          // uploadFileToWorker returns { key } (we expect key == storagePath)
          const { key } = await uploadFileToWorker(file, storagePath);

          // build worker-accessible file URL and save it
          const workerFileUrl = fileServeUrl(key);

          const { error: fileError } = await supabase.from("report_files").insert({
            report_id: reportData.id,
            storage_path: key,
            file_url: workerFileUrl,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
          });

          if (fileError) throw fileError;
        }
      }

      toast({ title: "Success", description: "Report submitted successfully" });
      setDescription("");
      setFiles([]);
      const fileInput = document.getElementById("file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      getCurrentLocation();
      onSuccess();
    } catch (err: any) {
      if (err?.name === "ZodError" || err?.issues) {
        toast({ title: "Validation error", description: err.errors?.[0]?.message || err.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: err?.message || "Something went wrong", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-medium w-full">
      <CardContent className="pt-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Daily Activity Report</h3>
          <p className="text-sm text-muted-foreground">Share your daily work summary.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe your daily activities..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              required
              disabled={loading}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Attachments (Optional)</Label>
            <Input
              id="file"
              type="file"
              multiple
              onChange={handleFileChange}
              disabled={loading}
              accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp4"
            />
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded">
                    <span className="truncate flex-1">{f.name}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeFile(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Supported: PDF, DOC, PPT, Images, Video (max 10MB each)</p>
          </div>

          <Button type="submit" className="w-full" disabled={loading || !location}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Report
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ReportForm;
