import { useAuth } from '@/hooks/useAuth';
import { InfiniteReportsList } from './InfiniteReportsList';

export interface Report {
  id: string;
  user_id: string;
  description: string;
  file_url: string | null;
  file_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  latitude: number | null;
  longitude: number | null;
  profiles: {
    full_name: string;
  };
}

const StaffDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-10">

      {/* Feed List */}
      <div className="max-w-2xl mx-auto px-0 sm:px-4 py-4">
        <InfiniteReportsList 
          userId={user?.id}
          showAuthor={false}
          userRole="staff"
        />
      </div>
      
    </div>
  );
};

export default StaffDashboard;