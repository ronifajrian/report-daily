import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { InfiniteReportsList } from './InfiniteReportsList';
import { QuickPostInput } from './QuickPostInput';
import { useMediaQuery } from "@/hooks/use-media-query";

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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const handleSuccess = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-10">
      
      {isDesktop ? (
        // ✅ DESKTOP: Margin atas (mt-8) agar tidak menempel Top Screen
        <div className="max-w-2xl mx-auto w-full mt-8 px-4">
          <QuickPostInput onSuccess={handleSuccess} />
        </div>
      ) : (
        // ✅ MOBILE: Sticky Header dengan Padding (p-3)
        // p-3 ini yang membuat input card tidak mepet kiri-kanan (sisi2)
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/40 shadow-sm p-3">
          <div className="max-w-2xl mx-auto w-full">
            <QuickPostInput onSuccess={handleSuccess} />
          </div>
        </div>
      )}

      {/* Feed List */}
      <div className="max-w-2xl mx-auto px-0 sm:px-4 py-4">
        <InfiniteReportsList 
          key={refreshTrigger} 
          userId={user?.id}
          showAuthor={false}
          userRole="staff"
        />
      </div>
      
    </div>
  );
};

export default StaffDashboard;