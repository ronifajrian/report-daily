// ReportComments.tsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addRealtimeListener, removeRealtimeListener } from '@/integrations/supabase/realtime';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name?: string;
    email?: string;
  };
}

interface ReportCommentsProps {
  reportId: string;
}

export const ReportComments = ({ reportId }: ReportCommentsProps) => {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");
  const listenerRef = useRef<string | null>(null);

  const canComment = userRole === "approver" || userRole === "admin";

  useEffect(() => {
    let mounted = true;

    const fetchComments = async () => {
      try {
        const { data, error } = await supabase
          .from("report_comments")
          .select(`
            id,
            comment_text,
            created_at,
            user_id,
            profiles:user_id (
              full_name,
              email
            )
          `)
          .eq("report_id", reportId)
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (!mounted) return;
        setComments(data as Comment[]);
      } catch (error: any) {
        toast({
          title: "Error",
          description: "Failed to load comments",
          variant: "destructive",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchComments();

    // Set up realtime subscription with debouncing to reduce DB load
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        fetchComments();
      }, 1000);
    };

    const listenerId = addRealtimeListener({
      channelName: `report-comments-${reportId}`,
      table: 'report_comments',
      schema: 'public',
      event: '*',
      filter: { report_id: reportId },
      handler,
    });

    listenerRef.current = listenerId;

    return () => {
      mounted = false;
      if (debounceTimeout) clearTimeout(debounceTimeout);
      if (listenerRef.current) {
        removeRealtimeListener(`report-comments-${reportId}`, listenerRef.current, { report_id: reportId });
        listenerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("report_comments").insert({
        report_id: reportId,
        user_id: user.id,
        comment_text: newComment.trim(),
      });

      if (error) throw error;

      setNewComment("");
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getInitials = (name = "") => {
    return name
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {comments.length > 0 ? (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 pb-4 border-b last:border-b-0">
                    <Avatar className="h-8 w-8 mt-1">
                      <AvatarFallback className="text-xs">
                        {getInitials(comment.profiles?.full_name ?? "")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {comment.profiles?.full_name ?? 'Unknown'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {comment.comment_text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No comments yet
              </p>
            )}

            {canComment && (
              <form onSubmit={handleSubmitComment} className="pt-2">
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                    disabled={submitting}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={!newComment.trim() || submitting}
                      size="sm"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Posting...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Post Comment
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
