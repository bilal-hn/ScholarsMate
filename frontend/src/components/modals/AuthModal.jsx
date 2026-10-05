import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, AlertCircle, Loader2, Compass, Eye, EyeOff } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import { loginUserAPI, registerUserAPI, setAuthToken } from '../../services/api';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function AuthModal({
  isOpen,
  initialMode = 'login', // 'login' | 'signup'
  onClose,
  onSuccess,
}) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setName('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!email.trim() || !password.trim()) {
          throw new Error('Please fill in both email and password.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        await registerUserAPI({
          name: name.trim() || undefined,
          email: email.trim(),
          password,
        });
      } else {
        if (!email.trim() || !password.trim()) {
          throw new Error('Please enter your email and password.');
        }
        await loginUserAPI({
          email: email.trim(),
          password,
        });
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Authentication failed. Please try again.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = (credentialResponse) => {
    if (credentialResponse.credential) {
      setAuthToken(credentialResponse.credential);
      if (onSuccess) onSuccess();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-zinc-900 border border-zinc-800 w-full max-w-[438px] rounded-2xl p-6 shadow-2xl space-y-5 text-zinc-100 font-sans relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Brand header */}
        <div className="text-center space-y-1.5 pt-1">
          <div className="h-10 w-10 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-inner">
            <Compass className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-zinc-100 tracking-tight">
            {mode === 'signup' ? 'Create ScholarsMate Account' : 'Welcome to ScholarsMate'}
          </h2>
          <p className="text-xs text-zinc-400">
            {mode === 'signup' 
              ? 'Join to sync literature syntheses, persistent workspaces, and citations.'
              : 'Log in to access your saved workspaces, research chats, and drafts.'}
          </p>
        </div>

        {/* Mode Toggle Tabs */}
        <div className="flex bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-800/80 h-12 items-center">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`flex-1 h-full flex items-center justify-center text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-zinc-800 text-amber-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); }}
            className={`flex-1 h-full flex items-center justify-center text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-zinc-800 text-amber-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Google OAuth Button (if client id available) */}
        {GOOGLE_CLIENT_ID && (
          <div className="space-y-3">
            <div className="flex justify-center w-full">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-in was cancelled or failed.')}
                theme="filled_black"
                shape="rectangular"
                size="large"
                width="340"
                text={mode === 'signup' ? 'signup_with' : 'signin_with'}
              />
            </div>
            <div className="flex items-center gap-2 text-zinc-600">
              <div className="h-px bg-zinc-800 flex-1" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">or with email</span>
              <div className="h-px bg-zinc-800 flex-1" />
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-3 rounded-xl animate-in fade-in">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Full Name</label>
              <div className="relative">
                <User className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. Dr. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 bg-zinc-950/70 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/80 transition-colors"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Email Address</label>
            <div className="relative">
              <Mail className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="name@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 bg-zinc-950/70 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/80 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Password</label>
            <div className="relative">
              <Lock className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 bg-zinc-950/70 border border-zinc-800 rounded-xl pl-9 pr-10 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/80 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer p-1"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 mt-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{mode === 'signup' ? 'Creating Account...' : 'Signing In...'}</span>
              </>
            ) : (
              <span>{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
            )}
          </button>
        </form>

        {/* Footer switch */}
        <div className="text-center pt-1 border-t border-zinc-800/60">
          <p className="text-[11.5px] text-zinc-400">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className="text-amber-400 hover:underline font-semibold cursor-pointer"
                >
                  Log In
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(null); }}
                  className="text-amber-400 hover:underline font-semibold cursor-pointer"
                >
                  Sign Up
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
