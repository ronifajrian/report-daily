import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Send, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name?: string;
  };
}

interface ReportCommentsProps {
  reportId: string;
}

const commentsCache = new Map<string, { data: Comment[]; timestamp: number }>();
const CACHE_TTL = 30000;

export const ReportComments = ({ reportId }: ReportCommentsProps) => {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");
  
  const channelRef = useRef<any>(null);
  const fetchedRef = useRef(false);

  const canComment = userRole === "approver" || userRole === "admin";

  const fetchComments = useCallback(async () => {
    if (fetchedRef.current && !loading) return;
    
    const cached = commentsCache.get(reportId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setComments(cached.data);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("report_comments")
        .select(`
          id,
          comment_text,
          created_at,
          user_id,
          profiles!inner(full_name)
        `)
        .eq("report_id", reportId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      const commentsList = (data as unknown as Comment[]) || [];
      setComments(commentsList);
      commentsCache.set(reportId, { data: commentsList, timestamp: Date.now() });
      fetchedRef.current = true;
    } catch (error: any) {
      console.error("Error loading comments:", error);
    } finally {
      setLoading(false);
    }
  }, [reportId, loading]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`report-comments-${reportId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'report_comments', filter: `report_id=eq.${reportId}` }, async (payload) => {
          try {
            const newCommentData = payload.new as any;
            const { data: profileData } = await supabase.from('profiles').select('full_name').eq('id', newCommentData.user_id).single();
            const completeComment: Comment = { ...newCommentData, profiles: { full_name: profileData?.full_name || 'Unknown' } };
            setComments(prev => {
              const exists = prev.some(c => c.id === completeComment.id);
              if (exists) return prev;
              const updated = [...prev, completeComment];
              commentsCache.set(reportId, { data: updated, timestamp: Date.now() });
              return updated;
            });
          } catch (e) { console.error(e); }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'report_comments', filter: `report_id=eq.${reportId}` }, (payload) => {
          setComments(prev => {
            const updated = prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new as any } : c);
            commentsCache.set(reportId, { data: updated, timestamp: Date.now() });
            return updated;
          });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'report_comments', filter: `report_id=eq.${reportId}` }, (payload) => {
          setComments(prev => {
            const updated = prev.filter(c => c.id !== payload.old.id);
            commentsCache.set(reportId, { data: updated, timestamp: Date.now() });
            return updated;
          });
      });

    channel.subscribe();
    channelRef.current = channel;
    return () => { try { if (channelRef.current) supabase.removeChannel(channelRef.current); } catch {} };
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
      toast({ title: "Posted", description: "Comment added successfully" });
      commentsCache.delete(reportId);
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to post comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const getInitials = (name = "") => {
    return name.split(" ").map((n) => n[0] ?? "").join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-4">
      {/* Comments List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length > 0 ? (
          <div className="flex flex-col gap-4">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3 items-start group animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Avatar className="h-8 w-8 border border-border/50 mt-0.5 flex-shrink-0">
                  <AvatarFallback className="bg-muted text-[10px] text-muted-foreground font-medium">
                    {getInitials(comment.profiles?.full_name ?? "") || <User className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="bg-muted/30 rounded-2xl rounded-tl-sm px-3 py-2 border border-border/30 inline-block min-w-[120px] max-w-full">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-xs text-foreground/90">
                        {comment.profiles?.full_name ?? 'Unknown'}
                        </span>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                        {comment.comment_text}
                    </p>
                  </div>
                  <div className="px-1 mt-1">
                     <span className="text-[10px] text-muted-foreground font-medium">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                     </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 bg-muted/10 rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground italic">No comments yet.</p>
          </div>
        )}
      </div>

      {/* Comment Input (Simplified) */}
      {canComment && (
        <form onSubmit={handleSubmitComment} className="flex items-end gap-2 pt-2">
          <Textarea
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={1}
            disabled={submitting}
            className="min-h-[40px] max-h-[120px] resize-none py-2.5 px-3 text-sm bg-background border-input focus:ring-primary/20 scrollbar-hide rounded-2xl"
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
                if(e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment(e);
                }
            }}
          />
          <Button
            type="submit"
            disabled={!newComment.trim() || submitting}
            size="icon"
            className="h-10 w-10 rounded-full shrink-0"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 ml-0.5" />
            )}
          </Button>
        </form>
      )}
    </div>
  );
};