import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileCheck, Clock, XCircle, FileText } from 'lucide-react';
import { InfiniteReportsList } from './InfiniteReportsList';
import { Report } from './StaffDashboard';

const ApproverDashboard = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
  });
  const [allUsers, setAllUsers] = useState<Array<{ id: string; full_name: string }>>([]);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('status');

      if (error) throw error;
      
      const total = data?.length || 0;
      const approved = data?.filter(r => r.status === 'approved').length || 0;
      const rejected = data?.filter(r => r.status === 'rejected').length || 0;
      const pending = data?.filter(r => r.status === 'pending').length || 0;

      setStats({ total, approved, rejected, pending });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchStaffUsers = async () => {
    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'staff');
      
      if (rolesError) throw rolesError;
      
      const staffUserIds = rolesData?.map(r => r.user_id) || [];
      
      if (staffUserIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('status', 'active')
          .in('id', staffUserIds);
        
        if (usersError) throw usersError;
        
        if (usersData) {
          setAllUsers(usersData);
        }
      } else {
        setAllUsers([]);
      }
    } catch (error: any) {
      console.error('Error fetching staff users:', error);
      setAllUsers([]);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchStaffUsers();

    // Subscribe to realtime updates with debouncing to reduce DB load
    let debounceTimeout: NodeJS.Timeout;
    
    const channel = supabase
      .channel('approver-stats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_reports',
        },
        () => {
          clearTimeout(debounceTimeout);
          debounceTimeout = setTimeout(() => fetchStats(), 2000);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimeout);
      supabase.removeChannel(channel);
    };
  }, []);

  const statsDisplay = [
    { title: 'Total', value: stats.total, icon: FileText, color: 'text-primary' },
    { title: 'Approved', value: stats.approved, icon: FileCheck, color: 'text-success' },
    { title: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-destructive' },
    { title: 'Pending', value: stats.pending, icon: Clock, color: 'text-warning' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 mb-20 md:mb-0">
      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {statsDisplay.map((stat) => (
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

      {/* Reports Timeline */}
      <div className="max-w-2xl mx-auto space-y-4">
        <InfiniteReportsList 
          showAuthor={true}
          allUsers={allUsers}
          userRole="approver"
        />
      </div>
    </div>
  );
};

export default ApproverDashboard;