import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';

export interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const location = useLocation();
  const { user, userData, logOut } = useAuth();

  const getInitials = () => {
    const displayName = userData?.name || user?.displayName || user?.email || '';
    if (!displayName) return '??';
    return displayName.slice(0, 2).toUpperCase();
  };

  const navItems = [
    { label: 'ORI', path: '/chat', icon: 'smart_toy' },
    { label: 'Tableau de bord', path: '/dashboard', icon: 'dashboard' },
    { label: 'Mes tâches', path: '/checklist', icon: 'task_alt' },
    { label: 'Profil', path: '/profile', icon: 'account_circle' },
  ];

  return (
    <nav className={cn(
      "hidden md:flex flex-col fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40 transition-all duration-200 ease-in-out",
      isCollapsed ? "w-14 p-2" : "w-64 p-4"
    )}>
      <div className={cn(
        "mb-8 flex items-center justify-between",
        !isCollapsed && "px-4"
      )}>
        {!isCollapsed && (
          <div>
            <h1 className="text-xl font-black text-[#E8002D] font-lexend tracking-tight">ORI by l'Étudiant</h1>
            <p className="text-[12px] font-medium text-gray-500 font-lexend uppercase tracking-wider">Accompagnement orientation</p>
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors",
            isCollapsed && "w-full flex justify-center"
          )}
        >
          <span className="material-symbols-outlined">
            {isCollapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>

      <Link
        to="/chat"
        onClick={() => {
          console.log('[NEW CONV] Red button clicked');
          window.dispatchEvent(new CustomEvent('new-conversation'));
        }}
        className={cn(
          "w-full mb-6 bg-[#E8002D] text-white py-3 rounded-xl font-semibold flex items-center justify-center transition-all",
          isCollapsed ? "px-0 h-10" : "px-4 gap-2 hover:opacity-90"
        )}
      >
        <span className="material-symbols-outlined">add</span>
        {!isCollapsed && "Nouvelle discussion"}
      </Link>

      <div className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center rounded-lg transition-all font-semibold",
                isActive 
                  ? "bg-red-50 text-[#E8002D]" 
                  : "text-gray-600 hover:bg-gray-50",
                isCollapsed ? "justify-center h-10 w-10 px-0" : "gap-3 px-4 py-3"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <span className={cn(
                "material-symbols-outlined",
                isActive && "fill-current"
              )}>
                {item.icon}
              </span>
              {!isCollapsed && item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <button
          onClick={() => {
            const shareUrl = `${window.location.origin}/share/${user?.uid}`;
            navigator.clipboard.writeText(shareUrl);
            // show a small toast: "Lien copié !"
          }}
          className={cn(
            "mx-3 mb-3 flex items-center gap-2 bg-[#FFD100] hover:bg-yellow-400 transition-colors rounded-xl text-sm font-semibold text-gray-900",
            isCollapsed ? "w-10 h-10 justify-center mx-auto" : "px-3 py-2.5 w-[calc(100%-24px)]"
          )}
          title="Partager avec mes parents"
        >
          <span style={{ fontSize: '14px' }}>🔗</span>
          {!isCollapsed && "Partager avec mes parents"}
        </button>

        <div className={cn(
          "flex items-center border-t border-gray-100",
          isCollapsed ? "flex-col py-2 px-0 gap-2" : "gap-3 px-4 py-3"
        )}>
          <div className="w-10 h-10 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-[#E8002D] font-bold shrink-0">
            {getInitials()}
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">
                {userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Utilisateur'}
              </p>
              <p className="text-xs text-gray-500 truncate">Élève</p>
            </div>
          )}
          <button 
            onClick={() => logOut()}
            className="text-gray-400 hover:text-[#E8002D] transition-colors"
            title="Déconnexion"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
