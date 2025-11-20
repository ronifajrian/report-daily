import { Home, User, Plus, FileText } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface DashboardSidebarProps {
  userRole: 'staff' | 'approver' | 'admin';
  onCreateReport?: () => void;
  onHomeClick?: () => void;
}

export const DashboardSidebar = ({ userRole, onCreateReport, onHomeClick }: DashboardSidebarProps) => { // ✅ Use new prop  const navigate = useNavigate();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      
      setUserName(data?.full_name || user.email || 'User');
    };
    
    fetchProfile();
  }, [user]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadgeColor = () => {
    switch (userRole) {
      case 'admin': return 'bg-accent text-accent-foreground';
      case 'approver': return 'bg-primary text-primary-foreground';
      case 'staff': return 'bg-success text-success-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // ✅ NEW: Handler klik Home yang memprioritaskan refresh
  const handleHomeClick = () => {
    if (location.pathname === '/dashboard' && onHomeClick) {
      // Jika sudah di dashboard dan ada fungsi refresh, panggil itu
      onHomeClick(); 
    } else {
      // Jika tidak, navigasi seperti biasa
      navigate('/dashboard');
    }
  };

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 border-r bg-sidebar-background h-screen sticky top-0">
      <div className="p-6 border-b">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-sidebar-foreground">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-primary text-white text-sm">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {userName}
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeColor()} inline-block mt-1`}>
              {userRole?.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
        <Button
          variant={isActive('/dashboard') ? 'secondary' : 'ghost'}
          className={cn(
            "w-full justify-start",
            isActive('/dashboard') && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
          onClick={handleHomeClick} // ✅ Gunakan handler baru
        >
          <Home className="h-5 w-5 mr-3" />
          Home
        </Button>

        <Button
          variant={isActive('/profile') ? 'secondary' : 'ghost'}
          className={cn(
            "w-full justify-start",
            isActive('/profile') && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
          onClick={() => navigate('/profile')}
        >
          <User className="h-5 w-5 mr-3" />
          Profile
        </Button>

        {userRole === 'staff' && onCreateReport && (
          <Button
            className="w-full justify-start bg-primary hover:bg-primary/90 text-primary-foreground mt-4"
            onClick={onCreateReport}
          >
            <Plus className="h-5 w-5 mr-3" />
            Create Report
          </Button>
        )}
      </nav>
    </aside>
  );
};
