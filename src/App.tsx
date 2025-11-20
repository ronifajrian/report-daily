// /src/App.tsx
import React, { Suspense, lazy, useEffect, useCallback, useRef } from "react"; // ✅ Tambahkan import hooks
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom"; // ✅ Tambahkan useLocation, useNavigate
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import MaintenanceCheck from "@/components/MaintenanceCheck";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import ExportReports from "./pages/ExportReports";
import NotFound from "./pages/NotFound";
import { LocationProvider } from "@/contexts/LocationContext";
import { LocationPermissionModal } from "@/components/location/LocationPermissionModal";

// Lazy load heavier pages so initial bundle is smaller
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const Maintenance = lazy(() => import("./pages/Maintenance"));

// QueryClient tuned to reduce refetch chatter in production
const queryClient = new QueryClient({
  defaultOptions: {
    // cast to any to avoid mismatches with installed @tanstack/react-query types
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      cacheTime: 1000 * 60 * 10, // 10 minutes
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

// ✅ NEW: Interface untuk prop yang akan diterima oleh komponen turunan (Dashboard, Profile, dll)
interface DashboardContentProps {
  onRefreshTriggerRegistration: (refreshFn: () => void) => void;
}

// ✅ NEW: Wrapper Component untuk menghubungkan Layout dan Content
const DashboardRouteWrapper = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const refreshReportsRef = useRef<(() => void) | null>(null);

  const registerRefreshFunction = useCallback((refreshFn: () => void) => {
    refreshReportsRef.current = refreshFn;
  }, []);

  const handleHomeClick = useCallback(() => {
    if (location.pathname === '/dashboard') {
      if (refreshReportsRef.current) {
        refreshReportsRef.current();
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      navigate('/dashboard');
    }
  }, [location.pathname, navigate]);

  let contentWithProps = null;
  
  // ✅ FIX OPTIMAL: Menggunakan React.Children untuk mencari elemen valid
  // Ini akan mengabaikan 'null', 'undefined', string kosong, atau komentar yang mungkin terselip
  const validChild = React.Children.toArray(children).find((child) => 
    React.isValidElement(child)
  ) as React.ReactElement<DashboardContentProps> | undefined;

  if (validChild) {
    // Kloning elemen anak yang valid dan suntikkan prop
    contentWithProps = React.cloneElement(validChild, {
      onRefreshTriggerRegistration: registerRefreshFunction,
    });
  } else {
    console.error("DashboardRouteWrapper: No valid child element found.");
    // Fallback agar aplikasi tidak crash total
    contentWithProps = <div className="p-4 text-red-500">Error: Komponen halaman tidak valid.</div>;
  }

  return (
    <ProtectedRoute>
      <MaintenanceCheck>
        <DashboardLayout onHomeClick={handleHomeClick}>
          {contentWithProps}
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
                <Route path="/" element={<Index />} />
                <Route path="/maintenance" element={<Maintenance />} />
                <Route
                  path="/reset-password"
                  element={
                    <ProtectedRoute>
                      <ResetPassword />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pending-approval"
                  element={
                    <ProtectedRoute>
                      <PendingApproval />
                    </ProtectedRoute>
                  }
                />

                {/* Dashboard routes menggunakan Wrapper baru */}
                <Route
                  path="/dashboard"
                  element={
                    <DashboardRouteWrapper>
                      <Dashboard />
                    </DashboardRouteWrapper>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <DashboardRouteWrapper>
                      <Profile /> 
                    </DashboardRouteWrapper>
                  }
                />
                <Route 
                  path="/export-reports" 
                  element={
                    <DashboardRouteWrapper>
                      <ExportReports />
                    </DashboardRouteWrapper>
                  } 
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
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
