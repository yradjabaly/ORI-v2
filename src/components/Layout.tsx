import { Outlet, useLocation, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';

export default function Layout() {
  const location = useLocation();
  const isShare = location.pathname.startsWith('/share');
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  if (isShare) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar for Desktop */}
      <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 w-full bg-white border-b border-gray-100 flex justify-between items-center px-6 py-3 z-40">
        <h1 className="text-xl font-black text-[#E8002D] font-lexend">ORI by l'Étudiant</h1>
        <div className="flex gap-4">
          <span className="material-symbols-outlined text-gray-500">notifications</span>
          <span className="material-symbols-outlined text-gray-500">settings</span>
        </div>
      </header>

      {/* Main Content */}
      <main className={cn(
        "flex-1 w-full mt-16 md:mt-0 flex flex-col min-h-screen overflow-x-hidden transition-all duration-200 ease-in-out",
        isSidebarCollapsed ? "md:ml-14" : "md:ml-64"
      )}>
        <div className="flex-1">
          <Outlet />
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-100 z-40 pb-safe">
          <div className="flex justify-around items-center h-16">
            <Link to="/chat" className={cn(
              "flex flex-col items-center justify-center w-full h-full",
              location.pathname === '/chat' ? "text-[#E8002D]" : "text-gray-400"
            )}>
              <span className={cn("material-symbols-outlined", location.pathname === '/chat' && "fill-current")}>smart_toy</span>
              <span className="text-[10px] font-medium">ORI</span>
            </Link>
            <Link to="/dashboard" className={cn(
              "flex flex-col items-center justify-center w-full h-full",
              location.pathname === '/dashboard' ? "text-[#E8002D]" : "text-gray-400"
            )}>
              <span className={cn("material-symbols-outlined", location.pathname === '/dashboard' && "fill-current")}>dashboard</span>
              <span className="text-[10px] font-medium">Tableau</span>
            </Link>
            <Link to="/checklist" className={cn(
              "flex flex-col items-center justify-center w-full h-full",
              location.pathname === '/checklist' ? "text-[#E8002D]" : "text-gray-400"
            )}>
              <span className={cn("material-symbols-outlined", location.pathname === '/checklist' && "fill-current")}>task_alt</span>
              <span className="text-[10px] font-medium font-bold">Tâches</span>
            </Link>
            <Link to="/profile" className={cn(
              "flex flex-col items-center justify-center w-full h-full",
              location.pathname === '/profile' ? "text-[#E8002D]" : "text-gray-400"
            )}>
              <span className={cn("material-symbols-outlined", location.pathname === '/profile' && "fill-current")}>account_circle</span>
              <span className="text-[10px] font-medium">Profil</span>
            </Link>
          </div>
        </nav>
      </main>
    </div>
  );
}
