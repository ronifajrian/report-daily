import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.object({
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }).max(100),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Check if this is a valid password recovery session
    const checkRecoverySession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          // If no valid session from recovery link, check if user is already authenticated
          const { data: { user } } = await supabase.auth.getUser();
          
          if (!user) {
            toast({
              title: 'Invalid or Expired Link',
              description: 'This password reset link is invalid or has expired. Please request a new one.',
              variant: 'destructive',
              duration: 5000,
            });
            navigate('/auth');
            return;
          }
        }
        
        setVerifying(false);
      } catch (error) {
        console.error('Error checking recovery session:', error);
        toast({
          title: 'Error',
          description: 'An error occurred while verifying your session.',
          variant: 'destructive',
        });
        navigate('/auth');
      }
    };

    checkRecoverySession();
  }, [navigate, toast, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      passwordSchema.parse({ password, confirmPassword });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      // Update profile status to active
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast({
        title: 'Password updated',
        description: 'Your password has been successfully updated. Redirecting to dashboard...',
        duration: 3000,
      });

      // Sign out to clear the recovery session
      await supabase.auth.signOut();
      
      // Redirect immediately to auth page for fresh login
      setTimeout(() => {
        navigate('/auth', { replace: true });
      }, 1500);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Validation Error',
          description: error.errors[0].message,
          variant: 'destructive',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Error',
          description: error.message || 'An error occurred while updating your password',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md shadow-strong">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">
            Create New Password
          </CardTitle>
          <CardDescription className="text-center">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <PasswordInput
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
