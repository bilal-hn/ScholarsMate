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
  ToggleLeft,
  ToggleRight,
  Filter,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import {
  fetchBrainMemoriesAPI,
  createBrainMemoryAPI,
  updateBrainMemoryAPI,
  deleteBrainMemoryAPI,
  clearBrainMemoriesAPI,
} from '../../services/api';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'preference', label: 'Preferences' },
  { id: 'profile', label: 'Academic Profile' },
  { id: 'insight', label: 'Research Insights' },
  { id: 'milestone', label: 'Milestones' },
  { id: 'directive', label: 'Directives' },
];

export default function BrainModal({
  isOpen,
  onClose,
  activeWorkspaceId,
  workspaces = []
}) {
  const modalRef = useRef(null);
  const inputRef = useRef(null);

  const [memories, setMemories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all'); // 'all', 'global', 'workspace'
  const [categoryFilter, setCategoryFilter] = useState('all');

  // New Thought Input state
  const [newThought, setNewThought] = useState('');
  const [newScope, setNewScope] = useState('global');
  const [newCategory, setNewCategory] = useState('preference');
  const [isAdding, setIsAdding] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  // Active workspace name helper
  const activeWorkspaceName = useMemo(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    return ws ? ws.name : 'Current Workspace';
  }, [workspaces, activeWorkspaceId]);

  // Load memories on open
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

  // Keyboard shortcut: Escape to close
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

  // Add new thought
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

  // Toggle active state
  const handleToggleActive = async (mem) => {
    const nextState = !mem.is_active;
    // Optimistic UI update
    setMemories((prev) =>
      prev.map((m) => (m.id === mem.id ? { ...m, is_active: nextState } : m))
    );
    try {
      await updateBrainMemoryAPI(mem.id, { is_active: nextState });
    } catch (err) {
      console.error('Failed to toggle memory:', err);
      // Revert on error
      setMemories((prev) =>
        prev.map((m) => (m.id === mem.id ? { ...m, is_active: mem.is_active } : m))
      );
    }
  };

  // Save inline edit
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

  // Delete memory
  const handleDeleteMemory = async (memId) => {
    setMemories((prev) => prev.filter((m) => m.id !== memId));
    try {
      await deleteBrainMemoryAPI(memId);
    } catch (err) {
      console.error('Failed to delete memory:', err);
      loadMemories();
    }
  };

  // Clear all memories
  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to erase all Brain memories? This cannot be undone.')) {
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

  // Filtered memory list
  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesThought = m.thought.toLowerCase().includes(q);
        const matchesCat = (m.category || '').toLowerCase().includes(q);
        if (!matchesThought && !matchesCat) return false;
      }
      // Scope
      if (scopeFilter === 'global' && m.scope !== 'global') return false;
      if (scopeFilter === 'workspace' && m.scope !== 'workspace') return false;
      // Category
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;

      return true;
    });
  }, [memories, searchQuery, scopeFilter, categoryFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      {/* Window Frame */}
      <div
        ref={modalRef}
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-zinc-100 font-sans"
      >
        {/* Window Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500">
              <Brain className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[15px] text-zinc-100 tracking-tight">Brain</span>
                <span className="text-[11.5px] font-mono px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-medium">
                  {memories.length} {memories.length === 1 ? 'thought' : 'thoughts'}
                </span>
              </div>
              <p className="text-[12.5px] text-zinc-400">
                Persistent research context, user preferences, and workspace discoveries.
              </p>
            </div>
          </div>

          {/* Window Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadMemories}
              disabled={isLoading}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer border border-zinc-800"
              title="Sync & Refresh Memories"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer border border-zinc-800"
              title="Minimize"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
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

        {/* Quick Add Bar */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/40 shrink-0">
          <form onSubmit={handleAddThought} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <input
                ref={inputRef}
                type="text"
                value={newThought}
                onChange={(e) => setNewThought(e.target.value)}
                placeholder="Teach Brain a new fact, citation rule, or research finding..."
                className="flex-1 bg-zinc-950/70 border border-zinc-800 rounded-xl px-4 py-2.5 min-h-[42px] text-[13.5px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-colors"
              />
              <button
                type="submit"
                disabled={!newThought.trim() || isAdding}
                className="flex items-center gap-1.5 px-4.5 py-2.5 min-h-[42px] rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 text-[13px] font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
              >
                {isAdding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 stroke-[2.5]" />}
                <span>Add</span>
              </button>
            </div>

            {/* Scope & Category Selectors */}
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 font-medium">Scope:</span>
                <div className="flex items-center rounded-xl bg-zinc-950/80 border border-zinc-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setNewScope('global')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer ${
                      newScope === 'global'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Global (All Chats)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewScope('workspace')}
                    disabled={!activeWorkspaceId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer ${
                      newScope === 'workspace'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200 disabled:opacity-40 border border-transparent'
                    }`}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>This Workspace</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-zinc-400 font-medium">Category:</span>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="bg-zinc-950/80 border border-zinc-800 rounded-xl px-3 py-1.5 min-h-[34px] text-[12.5px] text-zinc-200 focus:outline-none focus:border-amber-500/80 cursor-pointer transition-colors"
                >
                  <option value="preference">Preference</option>
                  <option value="profile">Academic Profile</option>
                  <option value="insight">Research Insight</option>
                  <option value="milestone">Milestone</option>
                  <option value="directive">Directive</option>
                </select>
              </div>
            </div>
          </form>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-3 shrink-0">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search thoughts in Brain..."
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl pl-10 pr-3.5 py-2.5 min-h-[40px] text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 transition-colors"
            />
          </div>

          {/* Scope Filters */}
          <div className="flex items-center rounded-xl bg-zinc-950/80 border border-zinc-800 p-0.5 shrink-0 text-[12.5px]">
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-1.5 min-h-[30px] rounded-lg transition-colors cursor-pointer ${
                scopeFilter === 'all' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('global')}
              className={`px-3 py-1.5 min-h-[30px] rounded-lg transition-colors cursor-pointer ${
                scopeFilter === 'global' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Global
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('workspace')}
              className={`px-3 py-1.5 min-h-[30px] rounded-lg transition-colors cursor-pointer ${
                scopeFilter === 'workspace' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Workspace
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/30 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none text-[12.5px]">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer border ${
                categoryFilter === cat.id
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 font-medium'
                  : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Memories List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-zinc-950/20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-amber-500/70" />
              <span className="text-[13px]">Loading Brain thoughts...</span>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500 space-y-2">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                <Brain className="h-5 w-5" />
              </div>
              <p className="text-[13.5px] font-medium text-zinc-300">No memories found</p>
              <p className="text-[12.5px] text-zinc-500 max-w-xs">
                Brain automatically extracts durable facts as you research, or you can add custom rules above.
              </p>
            </div>
          ) : (
            filteredMemories.map((mem) => {
              const isEditing = editingId === mem.id;
              const isGlobal = mem.scope === 'global';

              return (
                <div
                  key={mem.id}
                  className={`group relative p-3.5 rounded-xl border transition-all ${
                    mem.is_active
                      ? 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700/80 shadow-xs'
                      : 'bg-zinc-950/30 border-zinc-800/40 opacity-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Meta Tags */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {/* Category badge */}
                        <span className="text-[11px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-md bg-zinc-800/90 text-zinc-300 border border-zinc-700/60">
                          {mem.category || 'Thought'}
                        </span>

                        {/* Scope badge */}
                        <span
                          className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${
                            isGlobal
                              ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {isGlobal ? <Globe className="h-3 w-3" /> : <FolderOpen className="h-3 w-3" />}
                          <span>{isGlobal ? 'Global' : activeWorkspaceName}</span>
                        </span>

                        {/* Date */}
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {new Date(mem.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>

                      {/* Thought Text (or inline edit input) */}
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(mem.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                            className="flex-1 bg-zinc-950 border border-amber-500/80 rounded-xl px-3 py-2 min-h-[38px] text-[13.5px] text-zinc-100 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(mem.id)}
                            className="p-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors cursor-pointer"
                            title="Save"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 transition-colors cursor-pointer"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p
                          onClick={() => {
                            setEditingId(mem.id);
                            setEditText(mem.thought);
                          }}
                          className="text-[13.5px] text-zinc-100 leading-relaxed cursor-text hover:text-amber-400 transition-colors"
                          title="Click to edit"
                        >
                          {mem.thought}
                        </p>
                      )}
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      {/* Active toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleActive(mem)}
                        title={mem.is_active ? 'Disable memory' : 'Enable memory'}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          mem.is_active ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {mem.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                      </button>

                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditText(mem.thought);
                        }}
                        title="Edit memory"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(mem.id)}
                        title="Forget memory"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-5 py-3.5 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between text-[13px] text-zinc-400 shrink-0">
          <span>
            Showing <strong className="text-zinc-200 font-semibold">{filteredMemories.length}</strong> of{' '}
            <strong className="text-zinc-200 font-semibold">{memories.length}</strong> stored thoughts
          </span>

          <div className="flex items-center gap-3">
            {memories.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[12.5px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer font-medium"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium transition-colors cursor-pointer text-[13px] border border-zinc-700/60 min-h-[36px]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
