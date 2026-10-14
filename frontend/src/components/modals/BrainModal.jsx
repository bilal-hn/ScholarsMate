import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Brain,
  X,
  Minus,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  Globe,
  FolderOpen,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  fetchBrainMemoriesAPI,
  createBrainMemoryAPI,
  updateBrainMemoryAPI,
  deleteBrainMemoryAPI,
  clearBrainMemoriesAPI,
} from '../../services/api';

const CATEGORY_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'preference', label: 'Preference' },
  { id: 'profile', label: 'Profile' },
  { id: 'insight', label: 'Insight' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'directive', label: 'Directive' },
];

export default function BrainModal({
  isOpen,
  onClose,
  activeWorkspaceId,
  workspaces = [],
}) {
  const modalRef = useRef(null);
  const inputRef = useRef(null);

  // ── Brain enabled state (localStorage) ──────────────────────────────
  const [isBrainEnabled, setIsBrainEnabled] = useState(() => {
    try {
      return localStorage.getItem('brain_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleBrain = () => {
    const next = !isBrainEnabled;
    setIsBrainEnabled(next);
    try {
      localStorage.setItem('brain_enabled', String(next));
    } catch {}
  };

  // ── Core state ───────────────────────────────────────────────────────
  const [memories, setMemories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // New thought input
  const [newThought, setNewThought] = useState('');
  const [newScope, setNewScope] = useState('global');
  const [newCategory, setNewCategory] = useState('preference');
  const [isAdding, setIsAdding] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  // Active workspace name helper
  const activeWorkspaceName = useMemo(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    return ws ? ws.name : 'Current Workspace';
  }, [workspaces, activeWorkspaceId]);

  // ── Load memories ────────────────────────────────────────────────────
  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const res = await fetchBrainMemoriesAPI({
        workspace_id: activeWorkspaceId || undefined,
      });
      setMemories(res.memories || []);
    } catch (err) {
      console.error('Failed to load brain memories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen, activeWorkspaceId]);

  // Keyboard / outside-click handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingId) {
          setEditingId(null);
        } else {
          onClose();
        }
      }
    };
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, editingId]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleAddThought = async (e) => {
    if (e) e.preventDefault();
    if (!newThought.trim() || isAdding) return;

    setIsAdding(true);
    try {
      const created = await createBrainMemoryAPI({
        thought: newThought.trim(),
        scope: newScope,
        category: newCategory,
        workspace_id: newScope === 'workspace' ? activeWorkspaceId : null,
        is_active: true,
      });
      setMemories((prev) => [created, ...prev]);
      setNewThought('');
    } catch (err) {
      console.error('Failed to add thought:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleActive = async (mem) => {
    const nextState = !mem.is_active;
    setMemories((prev) =>
      prev.map((m) => (m.id === mem.id ? { ...m, is_active: nextState } : m))
    );
    try {
      await updateBrainMemoryAPI(mem.id, { is_active: nextState });
    } catch (err) {
      console.error('Failed to toggle memory:', err);
      setMemories((prev) =>
        prev.map((m) => (m.id === mem.id ? { ...m, is_active: mem.is_active } : m))
      );
    }
  };

  const handleSaveEdit = async (memId) => {
    if (!editText.trim()) return;
    const clean = editText.trim();
    setMemories((prev) =>
      prev.map((m) => (m.id === memId ? { ...m, thought: clean } : m))
    );
    setEditingId(null);
    try {
      await updateBrainMemoryAPI(memId, { thought: clean });
    } catch (err) {
      console.error('Failed to save edit:', err);
      loadMemories();
    }
  };

  const handleDeleteMemory = async (memId) => {
    setMemories((prev) => prev.filter((m) => m.id !== memId));
    try {
      await deleteBrainMemoryAPI(memId);
    } catch (err) {
      console.error('Failed to delete memory:', err);
      loadMemories();
    }
  };

  const handleClearAll = async () => {
    if (
      !window.confirm(
        'Are you sure you want to erase all Brain memories? This cannot be undone.'
      )
    ) {
      return;
    }
    try {
      await clearBrainMemoriesAPI({
        workspace_id: scopeFilter === 'workspace' ? activeWorkspaceId : undefined,
        scope: scopeFilter !== 'all' ? scopeFilter : undefined,
      });
      setMemories([]);
    } catch (err) {
      console.error('Failed to clear memories:', err);
      loadMemories();
    }
  };

  // ── Filtered list ─────────────────────────────────────────────────────
  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesThought = m.thought.toLowerCase().includes(q);
        const matchesCat = (m.category || '').toLowerCase().includes(q);
        if (!matchesThought && !matchesCat) return false;
      }
      if (scopeFilter === 'global' && m.scope !== 'global') return false;
      if (scopeFilter === 'workspace' && m.scope !== 'workspace') return false;
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      return true;
    });
  }, [memories, searchQuery, scopeFilter, categoryFilter]);

  if (!isOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div
        ref={modalRef}
        className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-zinc-100 font-sans"
      >
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
          {/* Left — icon + title + pill */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shrink-0">
              <Brain className="h-4 w-4" />
            </div>
            <span className="font-semibold text-[14px] text-zinc-100 tracking-tight shrink-0">
              Brain
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-medium shrink-0">
              {memories.length} {memories.length === 1 ? 'thought' : 'thoughts'}
            </span>
          </div>

          {/* Right — recording toggle + refresh + close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Recording toggle pill */}
            <button
              type="button"
              onClick={toggleBrain}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-medium transition-colors cursor-pointer ${
                isBrainEnabled
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700'
              }`}
              title={isBrainEnabled ? 'Pause recording' : 'Resume recording'}
            >
              <span
                className={`text-[9px] leading-none ${
                  isBrainEnabled ? 'text-emerald-400' : 'text-zinc-600'
                }`}
              >
                ●
              </span>
              {isBrainEnabled ? 'Recording' : 'Paused'}
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadMemories}
              disabled={isLoading}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer border border-zinc-800"
              title="Sync & Refresh Memories"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer border border-zinc-800"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── PAUSED BANNER ──────────────────────────────────────────── */}
        {!isBrainEnabled && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800/60 border-b border-zinc-700/50 shrink-0">
            <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-xs text-zinc-400">
              Brain paused · new memories won't be recorded
            </span>
          </div>
        )}

        {/* ── QUICK-ADD BAR ──────────────────────────────────────────── */}
        <div
          className={`px-4 pt-3 pb-2.5 border-b border-zinc-800 bg-zinc-950/40 shrink-0 ${
            !isBrainEnabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <form onSubmit={handleAddThought} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newThought}
                onChange={(e) => setNewThought(e.target.value)}
                placeholder="Teach Brain a new fact, rule, or finding..."
                className="flex-1 bg-zinc-950/70 border border-zinc-800 rounded-xl px-3.5 py-2 text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-colors"
              />
              <button
                type="submit"
                disabled={!newThought.trim() || isAdding}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 text-[12.5px] font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
              >
                {isAdding ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                )}
                <span>Add</span>
              </button>
            </div>

            {/* Scope & Category */}
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500">Scope:</span>
                <div className="flex items-center rounded-lg bg-zinc-950/80 border border-zinc-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setNewScope('global')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                      newScope === 'global'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    <Globe className="h-3 w-3" />
                    <span>Global</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewScope('workspace')}
                    disabled={!activeWorkspaceId}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                      newScope === 'workspace'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'text-zinc-400 hover:text-zinc-200 disabled:opacity-40 border border-transparent'
                    }`}
                  >
                    <FolderOpen className="h-3 w-3" />
                    <span>Workspace</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500">Category:</span>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-[11.5px] text-zinc-300 focus:outline-none focus:border-amber-500/80 cursor-pointer transition-colors"
                >
                  <option value="preference">Preference</option>
                  <option value="profile">Profile</option>
                  <option value="insight">Insight</option>
                  <option value="milestone">Milestone</option>
                  <option value="directive">Directive</option>
                </select>
              </div>
            </div>
          </form>
        </div>

        {/* ── FILTERS ROW ────────────────────────────────────────────── */}
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-3 shrink-0">
          {/* Scope pills */}
          <div className="flex items-center rounded-lg bg-zinc-950/80 border border-zinc-800 p-0.5">
            {['all', 'global', 'workspace'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScopeFilter(s)}
                className={`px-2.5 py-1 rounded-md text-[11.5px] transition-colors cursor-pointer capitalize ${
                  scopeFilter === s
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s === 'all' ? 'All' : s === 'global' ? 'Global' : 'Workspace'}
              </button>
            ))}
          </div>

          {/* Category select */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-[11.5px] text-zinc-300 focus:outline-none focus:border-amber-500/80 cursor-pointer transition-colors"
          >
            {CATEGORY_FILTER_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── MEMORY LIST ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5 bg-zinc-950/20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-amber-500/70" />
              <span className="text-[13px]">Loading Brain thoughts…</span>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                <Brain className="h-4.5 w-4.5" />
              </div>
              <p className="text-[13px] font-medium text-zinc-300">No memories found</p>
              <p className="text-[12px] text-zinc-500 max-w-xs">
                Brain automatically extracts durable facts as you research, or add custom rules above.
              </p>
            </div>
          ) : (
            filteredMemories.map((mem) => {
              const isEditing = editingId === mem.id;
              const isGlobal = mem.scope === 'global';

              return (
                <div
                  key={mem.id}
                  className={`group p-2.5 rounded-xl border bg-zinc-950/50 transition-all ${
                    mem.is_active
                      ? 'border-zinc-800 hover:border-zinc-700/80'
                      : 'border-zinc-800/40 opacity-40'
                  }`}
                >
                  {isEditing ? (
                    /* ── Expanded edit mode ── */
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        {/* category badge */}
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                          {mem.category || 'thought'}
                        </span>
                        {/* scope dot */}
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isGlobal ? 'bg-sky-400' : 'bg-amber-400'
                          }`}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(mem.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="flex-1 bg-zinc-950 border border-amber-500/80 rounded-lg px-3 py-1.5 text-[13px] text-zinc-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(mem.id)}
                          className="p-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors cursor-pointer"
                          title="Save"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 transition-colors cursor-pointer"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Single-line read mode ── */
                    <div className="flex items-center gap-2">
                      {/* Category badge */}
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                        {mem.category || 'thought'}
                      </span>

                      {/* Scope dot */}
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isGlobal ? 'bg-sky-400' : 'bg-amber-400'
                        }`}
                        title={isGlobal ? 'Global' : activeWorkspaceName}
                      />

                      {/* Thought text */}
                      <span
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditText(mem.thought);
                        }}
                        title={mem.thought}
                        className="flex-1 text-[13px] text-zinc-200 truncate cursor-text hover:text-amber-300 transition-colors"
                      >
                        {mem.thought}
                      </span>

                      {/* Action buttons — shown on hover */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Toggle active */}
                        <button
                          type="button"
                          onClick={() => handleToggleActive(mem)}
                          title={mem.is_active ? 'Disable memory' : 'Enable memory'}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${
                            mem.is_active
                              ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                              : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
                          }`}
                        >
                          {/* Simple circle-dot toggle indicator */}
                          <span className="text-[13px] leading-none">
                            {mem.is_active ? '◉' : '○'}
                          </span>
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(mem.id);
                            setEditText(mem.thought);
                          }}
                          title="Edit memory"
                          className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteMemory(mem.id)}
                          title="Forget memory"
                          className="p-1 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <div className="px-4 py-2.5 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between text-[12.5px] text-zinc-400 shrink-0">
          <span>
            Showing{' '}
            <strong className="text-zinc-200 font-semibold">{filteredMemories.length}</strong> of{' '}
            <strong className="text-zinc-200 font-semibold">{memories.length}</strong>
          </span>

          <div className="flex items-center gap-3">
            {memories.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[12px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer font-medium"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium transition-colors cursor-pointer text-[12.5px] border border-zinc-700/60"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
