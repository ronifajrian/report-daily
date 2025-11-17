// src/components/dashboard/AdminDashboard.tsx
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { addRealtimeListener, removeRealtimeListener } from '@/integrations/supabase/realtime';
import { useToast } from '@/hooks/use-toast';
import { InfiniteReportsList } from './InfiniteReportsList'; // ✅ named import
import { UserManagementList } from './UserManagementList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Users, UserCheck, Clock, Settings } from 'lucide-react';
import { Report } from './StaffDashboard';

const AdminDashboard = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeStaff, setActiveStaff] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [activeTab, setActiveTab] = useState('users');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [updatingMaintenance, setUpdatingMaintenance] = useState(false);

  // === Fetch initial dashboard stats ===
  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, status');

      if (usersError) throw usersError;

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const rolesMap = new Map(rolesData?.map((r: any) => [r.user_id, r.role]) || []);

      setTotalUsers(usersData?.length || 0);
      setActiveStaff(
        usersData?.filter(
          (u: any) => u.status === 'active' && rolesMap.get(u.id) === 'staff'
        ).length || 0
      );
      setPendingApprovals(usersData?.filter((u: any) => u.status === 'pending').length || 0);

      const { data: reportsData, error: reportsError } = await supabase
        .from('daily_reports')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false });

      if (reportsError) throw reportsError;
      setReports((reportsData || []) as Report[]);

      const uniqueUsers = Array.from(
        new Map(
          (reportsData || []).map((r: any) => [
            r.user_id,
            { id: r.user_id, full_name: r.profiles?.full_name },
          ])
        ).values()
      );
      setAllUsers(uniqueUsers);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // === Maintenance mode ===
  const fetchMaintenanceMode = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single();

      if (error) throw error;
      setMaintenanceMode(data.value === 'true');
    } catch (error: any) {
      console.error('Error fetching maintenance mode:', error);
    }
  };

  const toggleMaintenanceMode = async (enabled: boolean) => {
    setUpdatingMaintenance(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: enabled.toString() })
        .eq('key', 'maintenance_mode');

      if (error) throw error;
      setMaintenanceMode(enabled);
      toast({
        title: 'Success',
        description: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingMaintenance(false);
    }
  };

  // === Initial fetch + realtime listeners ===
  useEffect(() => {
    let mounted = true;
    fetchStats();
    fetchMaintenanceMode();

    // debounce realtime updates
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (mounted) fetchStats();
      }, 2000);
    };

    const reportsListenerId = addRealtimeListener({
      channelName: 'admin-reports',
      table: 'daily_reports',
      schema: 'public',
      event: '*',
      allowGlobal: false,
      handler,
    });

    const profilesListenerId = addRealtimeListener({
      channelName: 'admin-profiles',
      table: 'profiles',
      schema: 'public',
      event: '*',
      allowGlobal: false,
      handler,
    });

    const rolesListenerId = addRealtimeListener({
      channelName: 'admin-roles',
      table: 'user_roles',
      schema: 'public',
      event: '*',
      allowGlobal: false,
      handler,
    });

    return () => {
      mounted = false;
      if (debounceTimeout) clearTimeout(debounceTimeout);
      removeRealtimeListener('admin-reports', reportsListenerId);
      removeRealtimeListener('admin-profiles', profilesListenerId);
      removeRealtimeListener('admin-roles', rolesListenerId);
    };
  }, [activeTab]);

  const stats = [
    { title: 'Total Users', value: totalUsers, icon: Users, color: 'text-primary' },
    { title: 'Total Reports', value: reports.length, icon: FileText, color: 'text-secondary' },
    { title: 'Active Staff', value: activeStaff, icon: UserCheck, color: 'text-success' },
    { title: 'Pending Approvals', value: pendingApprovals, icon: Clock, color: 'text-warning' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 mb-20 md:mb-0">
      {/* === Maintenance Mode Toggle === */}
      <Card className="border-warning/50 bg-gradient-to-r from-warning/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <Settings className="h-5 w-5 text-warning" />
              </div>
              <div>
                <CardTitle className="text-base">Maintenance Mode</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  When enabled, only admins can access the system
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label
                htmlFor="maintenance-mode"
                className={`text-sm font-medium ${
                  maintenanceMode ? 'text-warning' : 'text-muted-foreground'
                }`}
              >
                {maintenanceMode ? 'ON' : 'OFF'}
              </Label>
              <Switch
                id="maintenance-mode"
                checked={maintenanceMode}
                onCheckedChange={toggleMaintenanceMode}
                disabled={updatingMaintenance}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* === Stats Cards === */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* === Tabs === */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText className="h-4 w-4 mr-2" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UserManagementList />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <InfiniteReportsList
              showAuthor={true}
              allUsers={allUsers}
              userRole="admin"  // ← Tambahkan ini (atau bisa userRole jika sudah ada dari useAuth)
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
