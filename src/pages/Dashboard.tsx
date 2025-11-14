import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserStatus } from '@/hooks/useUserStatus';
import { Loader2 } from 'lucide-react';
import StaffDashboard from '@/components/dashboard/StaffDashboard';
import ApproverDashboard from '@/components/dashboard/ApproverDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';

const Dashboard = () => {
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

  // Callback to refresh reports after creation
  const handleReportCreated = () => {
    // This will trigger a re-fetch in StaffDashboard via realtime subscription
    // No need to manually refresh here
  };

  return (
    <>
      {userRole === 'staff' && <StaffDashboard />}
      {userRole === 'approver' && <ApproverDashboard />}
      {userRole === 'admin' && <AdminDashboard />}
    </>
  );
};

export default Dashboard;
