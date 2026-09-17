import React, { useEffect, useState, useRef } from 'react';
import { 
  Key, 
  Settings, 
  LogOut, 
  LogIn, 
  Loader2,
  User as UserIcon
} from 'lucide-react';
import { getCurrentUser, logoutUser } from "../../services/api";
import ProfileSettingsModal from './ProfileSettingsModal';

const getUserInitials = (name) => {
  if (!name || typeof name !== 'string') return 'HF';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const AuthProfile = ({ 
  currentUser, 
  onAuthChange, 
  onOpenAuth, 
  onOpenSettings,
  onOpenProfileSettings,
  isCollapsed = false,
}) => {
  const [localUser, setLocalUser] = useState(null);
  const [loading, setLoading] = useState(currentUser === undefined);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const data = await getCurrentUser();
      setLocalUser(data);
    } catch {
      setLocalUser({
        id: 'guest',
        name: 'Guest User',
        is_guest: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser === undefined) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  // Click outside listener to close popup menu
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(e.target) &&
        buttonRef.current && 
        !buttonRef.current.contains(e.target)
      ) {
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

  const user = currentUser !== undefined ? currentUser : localUser;

  const handleLogout = () => {
    logoutUser();
    setIsMenuOpen(false);
    if (currentUser === undefined) {
      fetchUser();
    }
    if (onAuthChange) onAuthChange();
  };

  const handleProfileUpdated = (updatedUser) => {
    setLocalUser(updatedUser);
    if (onAuthChange) onAuthChange();
  };

  if (loading && !user) {
    return (
      <div className="flex items-center justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      </div>
    );
  }

  const isGuest = !user || user.is_guest;

  return (
    <div className={`relative select-none ${isCollapsed ? 'flex items-center justify-center' : 'w-full'}`}>
      {/* Pop-up Menu (Positioned Above the Trigger Button in sidebar, or floating to the right in siderail) */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className={`z-50 bg-zinc-950 border border-zinc-700/50 rounded-2xl shadow-2xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150 ${
            isCollapsed
              ? 'absolute left-full bottom-0 ml-3 w-56'
              : 'absolute bottom-full mb-2 left-0 right-0'
          }`}
        >
          {/* Top User Header Card (Non-clickable, arrow removed per user instruction) */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                className="w-9 h-9 rounded-full object-cover border border-zinc-700/60 shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm"
                style={{ backgroundColor: '#c34e00' }}
              >
                {getUserInitials(user?.name)}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-[14.5px] font-semibold text-zinc-100 truncate" title={user?.name || 'User'}>
                {user?.name || 'Academic Scholar'}
              </span>
              <span className="text-xs text-zinc-400 font-normal">
                {isGuest ? 'Guest' : 'Free'}
              </span>
            </div>
          </div>

          <div className="h-px bg-zinc-700/30 my-1 mx-1" />

          {/* Action 1: Add API Key */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenSettings();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-zinc-100 hover:bg-zinc-800/60 rounded-xl transition-colors cursor-pointer group text-left"
            >
              <Key className="h-4.5 w-4.5 stroke-[1.8] text-zinc-100 shrink-0" />
              <span>Add API key</span>
            </button>
          )}

          {/* Action 2: Settings (User Profile Functionality) */}
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              if (onOpenProfileSettings) {
                onOpenProfileSettings();
              } else {
                setIsProfileModalOpen(true);
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-zinc-100 hover:bg-zinc-800/60 rounded-xl transition-colors cursor-pointer group text-left"
          >
            <Settings className="h-4.5 w-4.5 stroke-[1.8] text-zinc-100 shrink-0" />
            <span>Settings</span>
          </button>

          {/* If Guest: Option to Log In */}
          {isGuest && onOpenAuth && (
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenAuth('login');
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-zinc-100 hover:bg-zinc-800/60 rounded-xl transition-colors cursor-pointer group text-left"
            >
              <LogIn className="h-4.5 w-4.5 stroke-[1.8] text-zinc-100 shrink-0" />
              <span>Log In / Sign Up</span>
            </button>
          )}

          {/* Action 3: Log Out */}
          {!isGuest && (
            <>
              <div className="h-px bg-zinc-700/30 my-1 mx-1" />
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-zinc-100 hover:bg-zinc-800/60 rounded-xl transition-colors cursor-pointer group text-left"
              >
                <LogOut className="h-4.5 w-4.5 stroke-[1.8] text-zinc-100 shrink-0" />
                <span>Log out</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Main Profile Trigger Button */}
      {isCollapsed ? (
        isGuest ? (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => (onOpenAuth ? onOpenAuth('login') : setIsMenuOpen((prev) => !prev))}
            className="relative group p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-all cursor-pointer flex items-center justify-center"
            aria-label="Log In"
          >
            <div className="relative">
              <UserIcon className="h-5 w-5" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-zinc-900" />
            </div>
            <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Log In / Sign Up
            </span>
          </button>
        ) : (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-label={user?.name || 'User Profile'}
            className="relative group p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center"
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user?.name || 'User'}
                className="w-8 h-8 rounded-full object-cover border border-zinc-700 group-hover:border-amber-500/60 transition-colors"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-sm group-hover:brightness-110 transition-all"
                style={{ backgroundColor: '#c34e00' }}
              >
                {getUserInitials(user?.name)}
              </div>
            )}

            {!isMenuOpen && (
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                {user?.name || 'User'}
              </span>
            )}
          </button>
        )
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-expanded={isMenuOpen}
          aria-label="User Profile Menu"
          className={`w-full flex items-center p-2 rounded-2xl transition-all cursor-pointer group text-left ${
            isMenuOpen
              ? 'bg-zinc-800/70 border border-zinc-700/50 shadow-sm'
              : 'hover:bg-zinc-800/50 border border-transparent'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 pr-1 w-full">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                className="w-9 h-9 rounded-full object-cover border border-zinc-700/60 shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm transition-transform group-hover:scale-105"
                style={{ backgroundColor: '#c34e00' }}
              >
                {getUserInitials(user?.name)}
              </div>
            )}

            <div className="flex flex-col min-w-0 flex-1">
              <span
                className="text-[14.5px] font-semibold text-zinc-100 truncate transition-colors"
                title={user?.name || 'User'}
              >
                {user?.name || 'Academic Scholar'}
              </span>
              <span className="text-xs text-zinc-400 font-normal">
                {isGuest ? 'Guest' : 'Free'}
              </span>
            </div>
          </div>
        </button>
      )}

      {/* Embedded Profile & Settings Modal */}
      <ProfileSettingsModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={user}
        onProfileUpdated={handleProfileUpdated}
        onLogout={handleLogout}
      />
    </div>
  );
};