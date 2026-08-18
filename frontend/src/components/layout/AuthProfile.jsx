import React, { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { getCurrentUser, setGoogleAuthToken, logoutUser } from "../../services/api";

export const AuthProfile = ({ onAuthChange }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const data = await getCurrentUser();
      setUser(data);
    } catch (err) {
      console.error('Auth check error:', err);
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
    return <div className="text-xs text-gray-400 p-2">Loading identity...</div>;
  }

  return (
    <div className="p-3 border-t border-gray-800 flex items-center justify-between">
      {user && !user.is_guest ? (
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 overflow-hidden">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white">
                {user.name ? user.name[0] : 'U'}
              </div>
            )}
            <div className="truncate">
              <p className="text-sm font-medium text-gray-200 truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-red-400 hover:text-red-300 ml-2 px-2 py-1 bg-gray-800 rounded"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            Guest Mode (Session Saved)
          </div>
          <GoogleLogin
            onSuccess={handleLoginSuccess}
            onError={() => console.error('Google Sign In Failed')}
            size="small"
            theme="filled_black"
            text="signin_with"
          />
        </div>
      )}
    </div>
  );
};