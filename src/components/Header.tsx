import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Share2, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

interface HeaderProps {
  readOnly?: boolean;
}

export default function Header({ readOnly = false }: HeaderProps) {
  const location = useLocation();
  const { user, userData, logOut } = useAuth();
  
  const getInitials = () => {
    const displayName = userData?.name || user?.displayName || user?.email || '';
    if (!displayName) return '??';
    return displayName.slice(0, 2).toUpperCase();
  };

  return (
    <header className={cn(
      "w-full h-14 border-b border-gray-200 flex justify-center items-center shrink-0 z-50",
      readOnly ? "bg-gray-50" : "bg-white"
    )}>
      <div className="w-full max-w-6xl px-6 flex justify-between items-center">
        <div className="flex flex-col">
          <Link to={readOnly ? "#" : "/chat"} className={cn("text-[#E8002D] font-bold text-xl tracking-tighter leading-none", readOnly && "pointer-events-none")}>
            ORI
          </Link>
          <span className="text-gray-500 text-[12px] font-medium mt-1">
            by l'Étudiant
          </span>
        </div>
        
        {!readOnly && (
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-6 text-gray-500">
              <Link 
                to="/chat" 
                className={cn(
                  "flex items-center gap-2 cursor-pointer transition-colors text-[11px] font-medium tracking-widest uppercase",
                  location.pathname === '/chat' ? "text-[#E8002D] underline underline-offset-[6px] decoration-2" : "hover:text-[#E8002D]"
                )}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Chat</span>
              </Link>
              <Link 
                to="/dashboard" 
                className={cn(
                  "flex items-center gap-2 cursor-pointer transition-colors text-[11px] font-medium tracking-widest uppercase",
                  location.pathname === '/dashboard' ? "text-[#E8002D] underline underline-offset-[6px] decoration-2" : "hover:text-[#E8002D]"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <Link 
                to="/checklist" 
                className={cn(
                  "flex items-center gap-2 cursor-pointer transition-colors text-[11px] font-medium tracking-widest uppercase",
                  location.pathname === '/checklist' ? "text-[#E8002D] underline underline-offset-[6px] decoration-2" : "hover:text-[#E8002D]"
                )}
              >
                <CheckSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Checklist</span>
              </Link>
            </nav>
            
            {user && (
              <div className="flex items-center gap-4 pl-6 ml-2 border-l border-gray-200">
                <Link to={`/share/${user.uid}`} className="flex items-center justify-center gap-2 bg-[#FFD100] text-amber-950 px-4 py-2 rounded-full text-[13px] font-bold transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 hidden md:flex">
                  <Share2 className="w-4 h-4" />
                  Partager avec mes parents 🔗
                </Link>
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#E8002D] font-bold text-xs uppercase" title={user.email || ''}>
                  {getInitials()}
                </div>
                <button 
                  onClick={logOut} 
                  className="text-[11px] text-gray-500 hover:text-[#E8002D] transition-colors uppercase font-medium tracking-widest hidden sm:inline-block"
                >
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
