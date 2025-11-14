import { Home, User, Plus } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  userRole: 'staff' | 'approver' | 'admin';
  onCreateReport?: () => void;
}

export const MobileBottomNav = ({ userRole, onCreateReport }: MobileBottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;
  
  const handleHomeClick = () => {
    if (location.pathname === '/dashboard') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-50">
      <div className="flex items-center justify-around h-16 px-4">
        <button
          className={cn(
            "flex flex-col items-center justify-center flex-1 space-y-1",
            isActive('/dashboard') ? "text-primary" : "text-muted-foreground"
          )}
          onClick={handleHomeClick}
        >
          <Home className="h-6 w-6" />
          <span className="text-xs">Home</span>
        </button>

        {userRole === 'staff' && onCreateReport && (
          <button
            className="flex items-center justify-center w-14 h-14 -mt-6 rounded-full bg-primary text-primary-foreground shadow-lg"
            onClick={onCreateReport}
          >
            <Plus className="h-7 w-7" />
          </button>
        )}

        <button
          className={cn(
            "flex flex-col items-center justify-center flex-1 space-y-1",
            isActive('/profile') ? "text-primary" : "text-muted-foreground"
          )}
          onClick={() => navigate('/profile')}
        >
          <User className="h-6 w-6" />
          <span className="text-xs">Profile</span>
        </button>
      </div>
    </nav>
  );
};
