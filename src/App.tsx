// /src/App.tsx
import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import MaintenanceCheck from "@/components/MaintenanceCheck";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import ReportDetail from "./components/dashboard/ReportDetail";
import ExportReports from "./pages/ExportReports";
import NotFound from "./pages/NotFound";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
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

              {/* Dashboard routes with persistent layout and maintenance check */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <MaintenanceCheck>
                      <DashboardLayout>
                        <Dashboard />
                      </DashboardLayout>
                    </MaintenanceCheck>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <MaintenanceCheck>
                      <DashboardLayout>
                        <Profile />
                      </DashboardLayout>
                    </MaintenanceCheck>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/report/:id"
                element={
                  <ProtectedRoute>
                    <MaintenanceCheck>
                      <DashboardLayout>
                        <ReportDetail />
                      </DashboardLayout>
                    </MaintenanceCheck>
                  </ProtectedRoute>
                }
              />

              <Route 
                path="/export-reports" 
                element={
                  <ProtectedRoute>
                    <MaintenanceCheck>
                      <DashboardLayout>
                        <ExportReports />
                      </DashboardLayout>
                    </MaintenanceCheck>
                  </ProtectedRoute>
                } />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
