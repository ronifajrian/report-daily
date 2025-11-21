// src/App.tsx - UPDATED WITH ROUTE-DRIVEN MODALS
import React, { Suspense, lazy, useCallback, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Outlet } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import MaintenanceCheck from "@/components/MaintenanceCheck";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import ExportReports from "./pages/ExportReports";
import NotFound from "./pages/NotFound";
import { LocationProvider } from "@/contexts/LocationContext";
import { LocationPermissionModal } from "@/components/location/LocationPermissionModal";

// Lazy load pages
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const Maintenance = lazy(() => import("./pages/Maintenance"));

// ✅ NEW: Lazy load modal component
const ReportDetailModal = lazy(() => import("./components/dashboard/ReportDetailModal").then(m => ({ 
  default: m.ReportDetailModal 
})));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      cacheTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    } as any,
  },
});

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div>Loading…</div>
  </div>
);

interface DashboardContentProps {
  onRefreshTriggerRegistration: (refreshFn: () => void) => void;
}

// ✅ NEW: Modal wrapper that handles closing via navigation
const ReportModalRoute = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract report ID from URL path
  const reportId = location.pathname.split('/').pop() || null;
  
  const handleClose = useCallback(() => {
    // Navigate back to the background route
    navigate(location.state?.backgroundLocation?.pathname || '/dashboard', { 
      replace: true 
    });
  }, [navigate, location.state]);

  const handleReportUpdated = useCallback(() => {
    // Trigger refresh via event or callback
    window.dispatchEvent(new CustomEvent('reportUpdated'));
    handleClose();
  }, [handleClose]);

  const handleReportDeleted = useCallback((deletedReportId: string) => {
    // Trigger delete event
    window.dispatchEvent(new CustomEvent('reportDeleted', { 
      detail: { reportId: deletedReportId } 
    }));
    handleClose();
  }, [handleClose]);

  return (
    <ReportDetailModal
      reportId={reportId}
      open={true}
      onClose={handleClose}
      onReportUpdated={handleReportUpdated}
      onReportDeleted={handleReportDeleted}
    />
  );
};

// ✅ NEW: Dashboard wrapper that supports background routes
const DashboardRouteWrapper = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const refreshReportsRef = useRef<(() => void) | null>(null);

  const registerRefreshFunction = useCallback((refreshFn: () => void) => {
    refreshReportsRef.current = refreshFn;
  }, []);

  const handleHomeClick = useCallback(() => {
    if (location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/report/')) {
      if (refreshReportsRef.current) {
        refreshReportsRef.current();
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      navigate('/dashboard');
    }
  }, [location.pathname, navigate]);

  const validChild = React.Children.toArray(children).find((child) => 
    React.isValidElement(child)
  ) as React.ReactElement<DashboardContentProps> | undefined;

  const contentWithProps = validChild ? React.cloneElement(validChild, {
    onRefreshTriggerRegistration: registerRefreshFunction,
  }) : <div className="p-4 text-red-500">Error: Invalid component.</div>;

  return (
    <ProtectedRoute>
      <MaintenanceCheck>
        <DashboardLayout onHomeClick={handleHomeClick}>
          {contentWithProps}
          {/* ✅ Render modal routes as overlay */}
          <Outlet />
        </DashboardLayout>
      </MaintenanceCheck>
    </ProtectedRoute>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <LocationProvider> 
          <Toaster />
          <Sonner />
          <LocationPermissionModal />

          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/maintenance" element={<Maintenance />} />
                <Route path="/reset-password" element={
                  <ProtectedRoute><ResetPassword /></ProtectedRoute>
                } />
                <Route path="/pending-approval" element={
                  <ProtectedRoute><PendingApproval /></ProtectedRoute>
                } />

                {/* ✅ NEW: Dashboard with nested modal routes */}
                <Route path="/dashboard" element={<DashboardRouteWrapper><Dashboard /></DashboardRouteWrapper>}>
                  {/* Modal route - renders as overlay */}
                  <Route path="report/:reportId" element={<ReportModalRoute />} />
                </Route>

                <Route path="/profile" element={
                  <DashboardRouteWrapper><Profile /></DashboardRouteWrapper>
                } />
                
                <Route path="/export-reports" element={
                  <DashboardRouteWrapper><ExportReports /></DashboardRouteWrapper>
                } />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </LocationProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;