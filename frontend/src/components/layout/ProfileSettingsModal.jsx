import React, { useState, useEffect } from 'react';
import { 
  User, 
  X, 
  Check, 
  Loader2, 
  Sparkles, 
  ShieldCheck, 
  BookOpen, 
  LogOut, 
  Calendar,
  Layers,
  FileText
} from 'lucide-react';
import { 
  updateUserProfileAPI, 
  getSavedProfilePreferences, 
  saveProfilePreferences,
  logoutUser 
} from '../../services/api';

const CITATION_STYLES = [
  { id: 'APA 7th', name: 'APA 7th Edition (Author, Year)' },
  { id: 'IEEE', name: 'IEEE Style [1] Numerical' },
  { id: 'Harvard', name: 'Harvard Referencing System' },
  { id: 'MLA 9th', name: 'MLA 9th Edition (Author Page)' },
  { id: 'Chicago', name: 'Chicago Manual of Style (Author-Date)' },
];

const ACADEMIC_FIELDS = [
  'Computer Science & Artificial Intelligence',
  'Engineering & Technology',
  'Biomedicine & Health Sciences',
  'Social Sciences & Humanities',
  'Physics, Mathematics & Formal Sciences',
  'Economics & Business Management',
  'Interdisciplinary Academic Research',
];

const getUserInitials = (name) => {
  if (!name || typeof name !== 'string') return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function ProfileSettingsModal({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
  onLogout,
}) {
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSavedSuccess, setNameSavedSuccess] = useState(false);
  const [nameError, setNameError] = useState(null);

  const [preferences, setPreferences] = useState(() => getSavedProfilePreferences());
  const [prefsSavedSuccess, setPrefsSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(currentUser?.name || '');
      setPreferences(getSavedProfilePreferences());
      setNameSavedSuccess(false);
      setNameError(null);
      setPrefsSavedSuccess(false);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSaveName = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;

    try {
      setSavingName(true);
      setNameError(null);
      setNameSavedSuccess(false);

      const updated = await updateUserProfileAPI({ name: name.trim() });
      setNameSavedSuccess(true);

      if (onProfileUpdated) {
        onProfileUpdated(updated);
      }
      setTimeout(() => setNameSavedSuccess(false), 3000);
    } catch (err) {
      setNameError(err.response?.data?.detail || 'Failed to update profile name.');
    } finally {
      setSavingName(false);
    }
  };

  const handlePreferenceChange = (key, value) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    saveProfilePreferences(updated);
    setPrefsSavedSuccess(true);
    setTimeout(() => setPrefsSavedSuccess(false), 2500);
  };

  const handleLogoutClick = () => {
    if (window.confirm('Are you sure you want to log out?')) {
      logoutUser();
      onClose();
      if (onLogout) onLogout();
    }
  };

  const formattedDate = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : 'Active Scholar';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5 text-zinc-100 font-sans max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
              <User className="h-4 w-4 stroke-[2]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Profile & Settings</h2>
              <p className="text-[11px] text-zinc-400">Manage your identity and research preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* User Card Overview */}
        <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md shrink-0"
            style={{ backgroundColor: '#c34e00' }}
          >
            {getUserInitials(currentUser?.name || name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100 truncate">
                {currentUser?.name || 'Academic Scholar'}
              </span>
              <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                Free
              </span>
            </div>
            <div className="text-xs text-zinc-400 truncate mt-0.5">
              {currentUser?.email || 'Guest Session'}
            </div>
          </div>
        </div>

        {/* Section 1: Display Name */}
        <form onSubmit={handleSaveName} className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Display Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full academic name..."
              className="flex-1 bg-zinc-950/70 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/80 transition-colors"
            />
            <button
              type="submit"
              disabled={savingName || !name.trim() || name.trim() === currentUser?.name}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-zinc-950 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {savingName ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : nameSavedSuccess ? (
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              ) : null}
              <span>{savingName ? 'Saving...' : nameSavedSuccess ? 'Saved' : 'Save'}</span>
            </button>
          </div>

          {nameSavedSuccess && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-0.5">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span>Name updated successfully across the system.</span>
            </div>
          )}

          {nameError && (
            <div className="text-[11px] text-rose-400 pt-0.5">
              {nameError}
            </div>
          )}
        </form>

        {/* Section 2: Academic & Research Defaults */}
        <div className="space-y-3 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Academic & Citation Preferences
            </label>
            {prefsSavedSuccess && (
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                <Check className="h-3 w-3" /> Auto-saved
              </span>
            )}
          </div>

          {/* Citation Format */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-300 font-medium flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-zinc-400" />
              Preferred Citation Format
            </label>
            <select
              value={preferences.citationStyle || 'APA 7th'}
              onChange={(e) => handlePreferenceChange('citationStyle', e.target.value)}
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/80 transition-colors cursor-pointer"
            >
              {CITATION_STYLES.map((c) => (
                <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Research Discipline */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-300 font-medium flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
              Primary Research Field
            </label>
            <select
              value={preferences.academicField || ACADEMIC_FIELDS[0]}
              onChange={(e) => handlePreferenceChange('academicField', e.target.value)}
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/80 transition-colors cursor-pointer"
            >
              {ACADEMIC_FIELDS.map((field) => (
                <option key={field} value={field} className="bg-zinc-900 text-zinc-200">
                  {field}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section 3: Account & Session Info */}
        <div className="space-y-2 pt-2 border-t border-zinc-800/80">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Account Status
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-zinc-800/60 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10.5px] text-zinc-500">Tier</div>
                <div className="font-semibold text-zinc-200">Free Scholar</div>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-zinc-800/60 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-zinc-400 shrink-0" />
              <div>
                <div className="text-[10.5px] text-zinc-500">Member Since</div>
                <div className="font-semibold text-zinc-200">{formattedDate}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions: Log Out */}
        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleLogoutClick}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4 stroke-[1.8]" />
            <span>Log out of ScholarsMate</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
