import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { MobileBottomNav } from '@/components/dashboard/MobileBottomNav';
import { CreateReportModal } from '@/components/dashboard/CreateReportModal';
import { CreateReportContext } from '@/contexts/CreateReportContext';
import { Loader2 } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  onReportCreated?: () => void;
  onHomeClick: () => void;
}

export const DashboardLayout = ({ children, onReportCreated, onHomeClick }: DashboardLayoutProps) => {
  const { userRole, loading } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userRole) return null;

  const handleCreateReport = () => setShowCreateModal(true);
  
  const handleReportSuccess = () => {
    setShowCreateModal(false);
    if (onReportCreated) onReportCreated();
  };

  return (
    <CreateReportContext.Provider value={{ openCreateReport: handleCreateReport }}>
      <div className="flex min-h-screen bg-background w-full">
        <DashboardSidebar 
          userRole={userRole as 'staff' | 'approver' | 'admin'} 
          onCreateReport={handleCreateReport}
          onHomeClick={onHomeClick} // ✅ TERUSKAN prop onHomeClick
        />
        
        <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
          {children}
        </main>

        <MobileBottomNav 
          userRole={userRole as 'staff' | 'approver' | 'admin'}
          onCreateReport={handleCreateReport}
          onHomeClick={onHomeClick} // ✅ TERUSKAN prop onHomeClick
        />
      </div>

      {/* Create Report Modal for Staff */}
      {userRole === 'staff' && (
        <CreateReportModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          onSuccess={handleReportSuccess}
        />
      )}
    </CreateReportContext.Provider>
  );
};
