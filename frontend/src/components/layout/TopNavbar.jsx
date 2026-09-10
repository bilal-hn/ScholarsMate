import React from 'react';
import { Compass, PanelLeftOpen, LogOut, User as UserIcon } from 'lucide-react';
import { logoutUser } from '../../services/api';

export default function TopNavbar({
  isSidebarCollapsed,
  onToggleSidebar,
  currentUser,
  onOpenAuth,
  onAuthChange,
}) {
  const handleLogout = () => {
    logoutUser();
    if (onAuthChange) onAuthChange();
  };

  const isAuthenticated = currentUser && !currentUser.is_guest;

  return (
    
    <header className="h-[75px] bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-30 select-none">
      {/* Top Left: Software Name (ScholarsMate) at right side of sidebar */}
      <div className="flex items-center gap-3">
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title="Expand Sidebar"
            className="p-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 rounded-xl shadow-md text-zinc-400 hover:text-zinc-100 transition-all cursor-pointer mr-1"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <div className="flex items-center gap-3">
          <div>
            <span className="text-lg font-bold tracking-tight text-zinc-100 font-sans block leading-tight">
              ScholarsMate
            </span>
          </div>
        </div>
      </div>

      {/* Top Right: Login and Sign Up buttons with specified dimensions */}
      <div className="flex items-center gap-3">
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 bg-zinc-900/90 border border-zinc-800 px-4 py-2 rounded-[28px] h-[55px] text-zinc-200 shadow-sm">
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full border border-zinc-700 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs text-amber-400 font-bold shrink-0">
                  {currentUser.name ? currentUser.name[0].toUpperCase() : 'U'}
                </div>
              )}
              <div className="text-left leading-none max-w-[150px] truncate">
                <p className="text-xs font-semibold text-zinc-200 truncate">{currentUser.name || 'User'}</p>
                <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">{currentUser.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                width: '250px',
                height: '50px',
                borderRadius: '25px',
                border: '1px transparent solid',
              }}
              className="bg-zinc-900/90 hover:bg-rose-950/40 hover:border-rose-700/80 text-zinc-300 hover:text-rose-400 font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenAuth && onOpenAuth('login')}
              style={{
                width: '125px',
                height: '50px',
                borderRadius: '25px',
                border: '1px transparent solid',
              }}
              className="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white font-semibold text-sm flex items-center justify-center transition-all cursor-pointer shadow-sm hover:border-zinc-500"
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => onOpenAuth && onOpenAuth('signup')}
              style={{
                width: '200px',
                height: '50px',
                borderRadius: '25px',
                border: '1px transparent solid',
              }}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm flex items-center justify-center transition-all cursor-pointer shadow-md hover:shadow-amber-500/20"
            >
              Sign Up
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
