// MaintenanceCheck.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { addRealtimeListener, removeRealtimeListener } from '@/integrations/supabase/realtime';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type SystemSettingsRow = Database['public']['Tables']['system_settings']['Row'] | null;

interface MaintenanceCheckProps {
  children: React.ReactNode;
}

const MaintenanceCheck = ({ children }: MaintenanceCheckProps) => {
  const { userRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkMaintenanceMode = async () => {
      try {
        const res = (await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'maintenance_mode')
          .maybeSingle()) as {
          data: SystemSettingsRow;
          error: any;
        };

        const { data, error } = res;
        if (error) throw error;

        const maintenanceEnabled = (data?.value ?? 'false') === 'true';
        if (mounted) setIsMaintenanceMode(maintenanceEnabled);

        if (maintenanceEnabled && userRole && userRole !== 'admin') {
          navigate('/maintenance', { replace: true });
        }
      } catch (err) {
        console.error('Error checking maintenance mode:', err);
      } finally {
        if (mounted) setChecking(false);
      }
    };

    if (!authLoading) {
      checkMaintenanceMode();

      // IMPORTANT: we set filter so subscription is server-side filtered (only key = maintenance_mode).
      const listenerId = addRealtimeListener({
        channelName: 'maintenance-mode-changes',
        table: 'system_settings',
        schema: 'public',
        event: 'UPDATE',
        filter: { key: 'maintenance_mode' },
        handler: (payload: any) => {
          const newValue = (payload.new?.value ?? 'false') === 'true';
          setIsMaintenanceMode(newValue);

          if (newValue && userRole && userRole !== 'admin') {
            navigate('/maintenance', { replace: true });
          }
        }
      });

      return () => {
        // remove with same filter used above
        removeRealtimeListener('maintenance-mode-changes', listenerId, { key: 'maintenance_mode' });
      };
    }

    return () => { mounted = false; };
  }, [userRole, authLoading, navigate]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isMaintenanceMode && userRole === 'admin') return <>{children}</>;

  return <>{children}</>;
};

export default MaintenanceCheck;
