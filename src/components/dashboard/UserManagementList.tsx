// UserManagementList.tsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { addRealtimeListener, removeRealtimeListener } from '@/integrations/supabase/realtime';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Search, User, Mail, Shield, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: 'staff' | 'approver' | 'admin';
  status: 'pending' | 'active' | 'inactive' | 'awaiting_reset';
  created_at: string;
}

export const UserManagementList = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, status, created_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const rolesMap = new Map((rolesData || []).map((r: any) => [r.user_id, r.role]) || []);
      const usersWithRoles = (profilesData || []).map((profile: any) => ({
        ...profile,
        role: rolesMap.get(profile.id) || 'staff'
      })) as UserProfile[];

      setUsers(usersWithRoles || []);
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

  useEffect(() => {
    fetchUsers();

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const handler = () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => fetchUsers(), 2000);
    };

    // do NOT create server-wide subscription by default; allowGlobal:false
    const profilesListenerId = addRealtimeListener({
      channelName: 'user-management-profiles',
      table: 'profiles',
      schema: 'public',
      event: '*',
      allowGlobal: false,
      handler,
    });

    const rolesListenerId = addRealtimeListener({
      channelName: 'user-management-roles',
      table: 'user_roles',
      schema: 'public',
      event: '*',
      allowGlobal: false,
      handler,
    });

    return () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      removeRealtimeListener('user-management-profiles', profilesListenerId);
      removeRealtimeListener('user-management-roles', rolesListenerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const updateUserRole = async (newRole: 'staff' | 'approver' | 'admin') => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-user-role', {
        body: { userId: selectedUser.id, newRole }
      });

      if (error) throw error;
      if ((data as any).success) {
        toast({ title: 'Success', description: 'User role updated successfully' });
        fetchUsers();
        setSelectedUser(null);
      } else {
        throw new Error((data as any).message || 'Failed to update role');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!selectedUser || !confirm('Reset password to default (123456)?')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-reset-password', {
        body: { userId: selectedUser.id }
      });

      if (error) throw error;
      toast({ title: 'Success', description: 'Password reset to 123456' });
      fetchUsers();
      setSelectedUser(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const updateUserStatus = async (newStatus: 'pending' | 'active' | 'inactive' | 'awaiting_reset') => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', selectedUser.id);

      if (error) throw error;
      toast({ title: 'Success', description: `User ${newStatus}` });
      fetchUsers();
      setSelectedUser(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const deleteUser = async () => {
    if (!selectedUser || !confirm('Delete this user? This cannot be undone.')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: selectedUser.id }
      });

      if (error) throw error;
      toast({ title: 'Success', description: 'User deleted' });
      fetchUsers();
      setSelectedUser(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'default';
      case 'approver': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'pending': return 'secondary';
      case 'inactive': return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredUsers.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No users found
          </Card>
        ) : (
          filteredUsers.map(user => (
            <Card
              key={user.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedUser(user)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{user.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span>{user.email}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        <Badge variant={getStatusBadgeVariant(user.status)}>
                          {user.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage User</DialogTitle>
            <DialogDescription>
              {selectedUser?.full_name} ({selectedUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Change Role</label>
              <Select
                value={selectedUser?.role}
                onValueChange={(value: 'staff' | 'approver' | 'admin') => updateUserRole(value)}
                disabled={actionLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="approver">Approver</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              {selectedUser?.status === 'pending' && (
                <Button onClick={() => updateUserStatus('active')} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Approve User
                </Button>
              )}

              {selectedUser?.status === 'active' && (
                <>
                  <Button variant="outline" onClick={resetPassword} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Reset Password
                  </Button>
                  <Button variant="destructive" onClick={() => updateUserStatus('inactive')} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Deactivate User
                  </Button>
                </>
              )}

              {selectedUser?.status === 'inactive' && (
                <Button onClick={() => updateUserStatus('active')} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Activate User
                </Button>
              )}

              {selectedUser?.status === 'awaiting_reset' && (
                <Button variant="secondary" onClick={resetPassword} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Reset to Default
                </Button>
              )}

              <Button variant="ghost" className="text-destructive" onClick={deleteUser} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Delete User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
