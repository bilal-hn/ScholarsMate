import React, { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { LogOut, User as UserIcon } from 'lucide-react';
import { getCurrentUser, setGoogleAuthToken, logoutUser } from "../../services/api";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const AuthProfile = ({ onAuthChange }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const data = await getCurrentUser();
      setUser(data);
    } catch {
      setUser({
        id: 'guest',
        name: 'Guest User',
        is_guest: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleLoginSuccess = (credentialResponse) => {
    if (credentialResponse.credential) {
      setGoogleAuthToken(credentialResponse.credential);
      fetchUser();
      if (onAuthChange) onAuthChange();
    }
  };

  const handleLogout = () => {
    logoutUser();
    fetchUser();
    if (onAuthChange) onAuthChange();
  };

  if (loading) {
    return <div className="text-[11px] text-zinc-500 py-1 font-mono">Loading...</div>;
  }

  return (
    <div className="flex items-center justify-between w-full select-none">
      {user && !user.is_guest ? (
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 overflow-hidden min-w-0 pr-1">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-6 h-6 rounded-full border border-zinc-700 shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[10px] text-amber-400 font-semibold shrink-0">
                {user.name ? user.name[0].toUpperCase() : 'U'}
              </div>
            )}
            <div className="truncate">
              <p className="text-xs font-medium text-zinc-200 truncate leading-none">{user.name || 'User'}</p>
              <p className="text-[10px] text-zinc-500 truncate mt-0.5 font-mono">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className="text-zinc-500 hover:text-rose-400 p-1 rounded-md transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="w-full flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="text-[11.5px] text-zinc-400 truncate">Guest</span>
          </div>
          {GOOGLE_CLIENT_ID && (
            <div className="shrink-0 scale-90 origin-right">
              <GoogleLogin
                onSuccess={handleLoginSuccess}
                onError={() => console.warn('Google Sign In cancelled or failed')}
                size="small"
                theme="filled_black"
                type="icon"
                shape="circle"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};