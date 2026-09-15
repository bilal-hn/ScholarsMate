import React, { useState, useRef, useEffect } from 'react';
import { PanelLeftOpen, MoreVertical, Trash2, Key } from 'lucide-react';

export default function TopNavbar({
  isSidebarCollapsed,
  onToggleSidebar,
  currentUser,
  onOpenAuth,
  onDeleteChat,
  onOpenSettings,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isAuthenticated = currentUser && !currentUser.is_guest;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <header className="h-[75px] bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-30 select-none">
      {/* Top Left: Blank when logged in; shows ScholarsMate when logged out */}
      <div className="flex items-center gap-3">
        {!isAuthenticated && (
          <div className="flex items-center gap-3">
            <div>
              <span className="text-lg font-bold tracking-tight text-zinc-100 font-sans block leading-tight">
                ScholarsMate
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Top Right: Three dots (with Delete Chat) when logged in; Login/Sign Up when logged out */}
      <div className="flex items-center gap-3 relative" ref={menuRef}>
        {isAuthenticated ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              title="Chat Options"
              className={`p-2.5 rounded-xl border transition-all cursor-pointer shadow-sm flex items-center justify-center ${
                isMenuOpen
                  ? 'bg-zinc-800 text-amber-400 border-zinc-700'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border-zinc-800'
              }`}
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in duration-150">
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-amber-400 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <Key className="h-4 w-4 shrink-0" />
                    <span>API Keys</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    if (onDeleteChat) onDeleteChat();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer text-left"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>Delete Chat</span>
                </button>
              </div>
            )}
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
