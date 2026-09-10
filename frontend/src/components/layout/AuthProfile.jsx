import React, { useEffect, useState } from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';
import { getCurrentUser, logoutUser } from "../../services/api";

export const AuthProfile = ({ currentUser, onAuthChange, onOpenAuth, onOpenSettings }) => {
  const [localUser, setLocalUser] = useState(null);
  const [loading, setLoading] = useState(currentUser === undefined);

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

  const user = currentUser !== undefined ? currentUser : localUser;

  const handleLogout = () => {
    logoutUser();
    if (currentUser === undefined) {
      fetchUser();
    }
    if (onAuthChange) onAuthChange();
  };

  if (loading && !user) {
    return <div className="text-[11px] text-zinc-500 py-1 font-mono">Loading...</div>;
  }

  return (
    <div className="w-full select-none">
      {user && !user.is_guest ? (
        <div className="flex items-center justify-between w-full min-h-[44px] py-1">
          <div className="flex items-center gap-3 overflow-hidden min-w-0 pr-1">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full border border-zinc-700 shrink-0 object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs text-amber-400 font-bold shrink-0">
                {user.name ? user.name[0].toUpperCase() : 'U'}
              </div>
            )}
            <span className="text-sm font-semibold text-zinc-200 truncate" title={user.name || 'User'}>
              {user.name || 'User'}
            </span>
          </div>
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/80 p-2 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="text-xs font-medium text-zinc-300 truncate">Guest</span>
          </div>

          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => onOpenAuth && onOpenAuth('login')}
              className="w-full py-2.5 px-3 text-sm font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition-all text-center cursor-pointer shadow-sm"
            >
              Log In
            </button>
          </div>
        </div>
      )}
    </div>
  );
};