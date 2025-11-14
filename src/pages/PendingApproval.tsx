import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserStatus } from '@/hooks/useUserStatus';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, CheckCircle2, RefreshCw } from 'lucide-react';

const PendingApproval = () => {
  const { user, signOut } = useAuth();
  const { status, loading, refreshing, refreshStatus } = useUserStatus(user?.id);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    
    if (status === 'awaiting_reset') {
      // User is waiting for admin to reset password - stay on this page
      return;
    } else if (status === 'active') {
      // Check if this was a password reset flow or regular approval
      const wasAwaitingReset = sessionStorage.getItem('wasAwaitingReset') === 'true';
      
      if (wasAwaitingReset) {
        // Password was reset by admin, sign out and redirect to login
        sessionStorage.removeItem('wasAwaitingReset');
        toast({
          title: 'Password Reset Complete',
          description: 'Your password has been reset to 123456. Please login with your new password.',
          duration: 5000,
        });
        signOut().then(() => {
          navigate('/auth', { replace: true });
        });
      } else {
        // Regular account activation, redirect to dashboard
        toast({
          title: 'Account Activated',
          description: 'Your account has been approved! Redirecting to dashboard...',
          duration: 3000,
        });
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      }
    }
  }, [status, loading, navigate, toast, signOut]);

  // Track when user enters awaiting_reset state
  useEffect(() => {
    if (status === 'awaiting_reset') {
      sessionStorage.setItem('wasAwaitingReset', 'true');
    }
  }, [status]);

  const handleRefreshStatus = async () => {
    await refreshStatus();
    // Status will be updated via realtime subscription or fetchStatus
    // The useEffect will handle navigation automatically
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md shadow-strong">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            {status === 'pending' || status === 'awaiting_reset' ? (
              <Clock className="h-16 w-16 text-primary animate-pulse" />
            ) : status === 'inactive' ? (
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <span className="text-3xl">❌</span>
              </div>
            ) : (
              <CheckCircle2 className="h-16 w-16 text-success" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {status === 'pending' && 'Waiting for Admin Approval'}
            {status === 'inactive' && 'Account Deactivated'}
            {status === 'active' && 'Account Approved'}
            {status === 'awaiting_reset' && 'Password Reset Pending'}
          </CardTitle>
          <CardDescription>
            {status === 'pending' && 'Your account has been created successfully. Please wait for an administrator to approve your account before you can access the dashboard.'}
            {status === 'inactive' && 'Your account has been deactivated by an administrator. Please contact support for more information.'}
            {status === 'active' && 'Your account is now active! Redirecting to dashboard...'}
            {status === 'awaiting_reset' && 'Your password reset request has been submitted to the administrator. Please wait for confirmation. Once approved, your password will be reset to a default password and you will be able to login again.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(status === 'pending' || status === 'awaiting_reset') && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                {status === 'pending' 
                  ? 'You will be notified via email once your account is approved. You can also check back here anytime.'
                  : 'Your password reset request has been submitted to the administrator. Please wait for approval.'}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button 
              variant="outline" 
              onClick={handleRefreshStatus}
              disabled={refreshing}
              className="w-full"
            >
              {refreshing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Status
                </>
              )}
            </Button>
            <Button 
              variant="secondary" 
              onClick={signOut}
              className="w-full"
            >
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;
