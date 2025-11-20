import { useEffect } from 'react'; // ✅ Import useRef dan useCallback
import { useNavigate } from 'react-router-dom'; // ✅ Import useLocation
import { useAuth } from '@/hooks/useAuth';
import { useUserStatus } from '@/hooks/useUserStatus';
import { Loader2 } from 'lucide-react';
import StaffDashboard from '@/components/dashboard/StaffDashboard';
import ApproverDashboard from '@/components/dashboard/ApproverDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';

// ✅ NEW: Tambahkan interface untuk prop yang datang dari DashboardRouteWrapper
interface DashboardProps {
  onRefreshTriggerRegistration?: (refreshFn: () => void) => void;
}

const Dashboard = ({ onRefreshTriggerRegistration }: DashboardProps) => { 
  const { user, userRole, loading } = useAuth();
  const { status, loading: statusLoading } = useUserStatus(user?.id);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && !statusLoading && user && status !== 'active') {
      navigate('/pending-approval');
    }
  }, [user, status, loading, statusLoading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !userRole) {
    return null;
  }

  return (
      <>
        {userRole === 'staff' && (
          <StaffDashboard 
            onRefreshTriggerRegistration={onRefreshTriggerRegistration} // ✅ Pass the registration function
          />
        )}
        {userRole === 'approver' && (
          <ApproverDashboard 
            onRefreshTriggerRegistration={onRefreshTriggerRegistration} // ✅ Pass the registration function
          />
        )}
        {userRole === 'admin' && (
          <AdminDashboard 
            onRefreshTriggerRegistration={onRefreshTriggerRegistration} // ✅ Pass the registration function
          />
        )}
      </>
    );
  };

export default Dashboard;
