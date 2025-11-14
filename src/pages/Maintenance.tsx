import { Settings, Wrench, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const Maintenance = () => {
  const [isRetrying, setIsRetrying] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single();

      if (error) throw error;

      if (data.value === 'false') {
        toast({
          title: "Success",
          description: "Maintenance completed! Redirecting...",
        });
        navigate('/', { replace: true });
      } else {
        toast({
          title: "Still Under Maintenance",
          description: "The system is still being maintained. Please try again later.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error checking maintenance status:', error);
      toast({
        title: "Error",
        description: "Failed to check maintenance status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
              <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 p-6 rounded-full">
                <Wrench className="h-16 w-16 text-primary animate-bounce" style={{ animationDuration: '2s' }} />
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Settings className="h-5 w-5 animate-spin" style={{ animationDuration: '3s' }} />
              <span className="text-sm font-medium uppercase tracking-wider">System Maintenance</span>
            </div>
            
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              We'll Be Back Soon
            </h1>
            
            <p className="text-muted-foreground leading-relaxed px-4">
              Our system is currently undergoing scheduled maintenance to improve your experience. 
              We appreciate your patience and will be back online shortly.
            </p>
          </div>

          <div className="pt-4 space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 bg-warning rounded-full animate-pulse" />
              <span>Maintenance in progress</span>
            </div>
            
            <Button 
              onClick={handleRetry}
              disabled={isRetrying}
              className="w-full group transition-all duration-300 hover:shadow-lg hover:scale-105"
              size="lg"
            >
              <RefreshCw className={`mr-2 h-4 w-4 transition-transform duration-500 ${isRetrying ? 'animate-spin' : 'group-hover:rotate-180'}`} />
              {isRetrying ? 'Checking...' : 'Try Again'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Maintenance;