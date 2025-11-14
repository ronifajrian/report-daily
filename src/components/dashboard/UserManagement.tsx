import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: 'staff' | 'approver' | 'admin';
  status: 'pending' | 'active' | 'inactive' | 'awaiting_reset';
  created_at: string;
}

const UserManagement = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStates, setLoadingStates] = useState<{ [userId: string]: { action: string, loading: boolean } }>({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, status, created_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles from user_roles table
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const rolesMap = new Map(rolesData?.map(r => [r.user_id, r.role]) || []);
      const usersWithRoles = profilesData?.map(profile => ({
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

  const updateUserRole = async (userId: string, newRole: 'staff' | 'approver' | 'admin') => {
    setLoadingStates(prev => ({ ...prev, [userId]: { action: 'role', loading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke('update-user-role', {
        body: { userId, newRole }
      });

      if (error) throw error;

      if (data.success) {
        toast({ 
          title: 'Success', 
          description: 'User role updated successfully',
          duration: 3000,
        });
        fetchUsers();
      } else {
        throw new Error(data.message || 'Failed to update role');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [userId]: { action: '', loading: false } }));
    }
  };

  const resetPasswordToDefault = async (userId: string) => {
    if (!confirm('Are you sure you want to reset this user\'s password to default (123456)?')) return;
    
    setLoadingStates(prev => ({ ...prev, [userId]: { action: 'reset', loading: true } }));
    try {
      const { error } = await supabase.functions.invoke('admin-reset-password', {
        body: { userId }
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Password has been reset to default (123456)',
        duration: 3000,
      });
      
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset password',
        variant: 'destructive',
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [userId]: { action: '', loading: false } }));
    }
  };

  const updateUserStatus = async (userId: string, newStatus: 'pending' | 'active' | 'inactive' | 'awaiting_reset') => {
    setLoadingStates(prev => ({ ...prev, [userId]: { action: 'status', loading: true } }));
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: 'Success', 
        description: `User ${newStatus === 'active' ? 'approved' : newStatus === 'inactive' ? 'deactivated' : newStatus === 'awaiting_reset' ? 'password reset approved' : 'set to pending'}`,
        duration: 3000,
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [userId]: { action: '', loading: false } }));
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    setLoadingStates(prev => ({ ...prev, [userId]: { action: 'delete', loading: true } }));
    try {
      const { error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId }
      });

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: 'User deleted successfully',
        duration: 3000,
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [userId]: { action: '', loading: false } }));
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'default';
      case 'approver': return 'secondary';
      case 'staff': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'pending': return 'secondary';
      case 'inactive': return 'destructive';
      case 'awaiting_reset': return 'outline';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User Management
          </CardTitle>
        </CardHeader>
        <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={getRoleBadgeVariant(user.role || 'staff')}>
                    {(user.role || 'staff').toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(user.status || 'pending')}>
                    {(user.status || 'pending').toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Select
                        value={user.role}
                        onValueChange={(value: 'staff' | 'approver' | 'admin') =>
                          updateUserRole(user.id, value)
                        }
                        disabled={loadingStates[user.id]?.loading}
                      >
                        <SelectTrigger className="w-[120px]">
                          {loadingStates[user.id]?.action === 'role' && loadingStates[user.id]?.loading ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Loading...</span>
                            </div>
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="approver">Approver</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {user.status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => updateUserStatus(user.id, 'active')}
                        disabled={loadingStates[user.id]?.loading}
                      >
                        {loadingStates[user.id]?.action === 'status' && loadingStates[user.id]?.loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Approving...
                          </>
                        ) : (
                          'Approve'
                        )}
                      </Button>
                    )}
                    
                    {user.status === 'awaiting_reset' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => resetPasswordToDefault(user.id)}
                        disabled={loadingStates[user.id]?.loading}
                      >
                        {loadingStates[user.id]?.action === 'reset' && loadingStates[user.id]?.loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Resetting...
                          </>
                        ) : (
                          'Reset to Default'
                        )}
                      </Button>
                    )}
                    
                    {user.status === 'active' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resetPasswordToDefault(user.id)}
                          disabled={loadingStates[user.id]?.loading}
                        >
                          {loadingStates[user.id]?.action === 'reset' && loadingStates[user.id]?.loading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Resetting...
                            </>
                          ) : (
                            'Reset Password'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateUserStatus(user.id, 'inactive')}
                          disabled={loadingStates[user.id]?.loading}
                        >
                          {loadingStates[user.id]?.action === 'status' && loadingStates[user.id]?.loading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Deactivating...
                            </>
                          ) : (
                            'Deactivate'
                          )}
                        </Button>
                      </>
                    )}
                    
                    {user.status === 'inactive' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateUserStatus(user.id, 'active')}
                        disabled={loadingStates[user.id]?.loading}
                      >
                        {loadingStates[user.id]?.action === 'status' && loadingStates[user.id]?.loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Activating...
                          </>
                        ) : (
                          'Activate'
                        )}
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteUser(user.id)}
                      disabled={loadingStates[user.id]?.loading}
                      className="text-destructive hover:text-destructive"
                    >
                      {loadingStates[user.id]?.action === 'delete' && loadingStates[user.id]?.loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'Delete'
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </CardContent>
      </Card>
  );
};

export default UserManagement;
