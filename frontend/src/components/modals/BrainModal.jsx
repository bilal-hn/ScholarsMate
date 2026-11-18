import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Brain,
  X,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import {
  fetchBrainMemoriesAPI,
  createBrainMemoryAPI,
  updateBrainMemoryAPI,
  deleteBrainMemoryAPI,
  clearBrainMemoriesAPI,
} from '../../services/api';

const CATEGORY_TABS = [
  { id: 'all', label: 'All Takeaways' },
  { id: 'decision', label: 'Decisions' },
  { id: 'constraint', label: 'Constraints & Discarded' },
  { id: 'finding', label: 'Paper Findings' },
];

export default function BrainModal({
  isOpen,
  onClose,
  activeWorkspaceId,
  workspaces = [],
}) {
  const modalRef = useRef(null);
  const inputRef = useRef(null);

  // ── Recording toggle (localStorage) ─────────────────────────────────
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
  const [categoryFilter, setCategoryFilter] = useState('all');

  // New thought input
  const [newThought, setNewThought] = useState('');
  const [newCategory, setNewCategory] = useState('decision');
  const [isAdding, setIsAdding] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  // Active workspace name helper
  const activeWorkspaceName = useMemo(() => {
    const ws = (workspaces || []).find((w) => w.id === activeWorkspaceId);
    return ws ? ws.name : 'Active Workspace';
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
      console.error('Failed to load blueprint memories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen, activeWorkspaceId]);

  // Keyboard / outside-click handlers (using window listeners to prevent scope shadow)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingId) setEditingId(null);
        else onClose();
      }
    };
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
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
        scope: 'workspace',
        category: newCategory,
        workspace_id: activeWorkspaceId || null,
        is_active: true,
      });
      setMemories((prev) => [created, ...prev]);
      setNewThought('');
    } catch (err) {
      console.error('Failed to add blueprint note:', err);
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
      console.error('Failed to toggle blueprint memory:', err);
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
        'Are you sure you want to clear all blueprint takeaways for this workspace?'
      )
    ) {
      return;
    }
    try {
      await clearBrainMemoriesAPI({
        workspace_id: activeWorkspaceId || undefined,
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
        const matchesThought = (m.thought || '').toLowerCase().includes(q);
        const matchesCat = (m.category || '').toLowerCase().includes(q);
        if (!matchesThought && !matchesCat) return false;
      }
      if (categoryFilter !== 'all') {
        const cat = (m.category || 'decision').toLowerCase();
        if (categoryFilter === 'decision' && cat !== 'decision' && cat !== 'milestone') return false;
        if (categoryFilter === 'constraint' && cat !== 'constraint') return false;
        if (categoryFilter === 'finding' && cat !== 'finding' && cat !== 'insight') return false;
      }
      return true;
    });
  }, [memories, searchQuery, categoryFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div
        ref={modalRef}
        className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-zinc-100 font-sans"
      >
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
              <Brain className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-zinc-100 tracking-tight">
                  Workspace Blueprint
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-amber-400 border border-zinc-700/60 font-medium shrink-0">
                  {memories.length} {memories.length === 1 ? 'takeaway' : 'takeaways'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 truncate">
                {activeWorkspaceName}
              </p>
            </div>
          </div>

          {/* Right — recording toggle + refresh + close */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleBrain}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                isBrainEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700'
              }`}
              title={isBrainEnabled ? 'Pause automatic takeaway capture' : 'Resume automatic takeaway capture'}
            >
              <span className={`text-[8px] leading-none ${isBrainEnabled ? 'text-emerald-400' : 'text-zinc-600'}`}>
                ●
              </span>
              {isBrainEnabled ? 'Auto-Capture Active' : 'Capture Paused'}
            </button>

            <button
              type="button"
              onClick={loadMemories}
              disabled={isLoading}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer border border-zinc-800"
              title="Sync & Refresh Takeaways"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer border border-zinc-800"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── PAUSED BANNER ──────────────────────────────────────────── */}
        {!isBrainEnabled && (
          <div className="flex items-center gap-2 px-5 py-1.5 bg-zinc-800/40 border-b border-zinc-800 text-[11px] text-zinc-400 shrink-0">
            <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
            <span>Auto-capture paused · New chat turns won't record takeaways automatically.</span>
          </div>
        )}

        {/* ── QUICK-ADD INPUT ────────────────────────────────────────── */}
        <div className="px-5 pt-3.5 pb-3 border-b border-zinc-800 bg-zinc-950/40 shrink-0">
          <form onSubmit={handleAddThought} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newThought}
                onChange={(e) => setNewThought(e.target.value)}
                placeholder="Record a project decision, benchmark parameter, or constraint..."
                className="flex-1 bg-zinc-950/80 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-colors"
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-[11.5px] text-zinc-300 focus:outline-none focus:border-amber-500/80 cursor-pointer transition-colors shrink-0"
              >
                <option value="decision">Decision</option>
                <option value="constraint">Constraint / Discarded</option>
                <option value="finding">Paper Finding</option>
              </select>
              <button
                type="submit"
                disabled={!newThought.trim() || isAdding}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-zinc-950 text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
              >
                {isAdding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 stroke-[2.5]" />}
                <span>Add</span>
              </button>
            </div>
          </form>
        </div>

        {/* ── CATEGORY TABS & SEARCH ─────────────────────────────────── */}
        <div className="px-5 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center rounded-lg bg-zinc-950/80 border border-zinc-800 p-0.5">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  categoryFilter === tab.id
                    ? 'bg-zinc-800 text-amber-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-44">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg pl-8 pr-2.5 py-1 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/70"
            />
          </div>
        </div>

        {/* ── MEMORY LIST ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-zinc-950/20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-amber-400" />
              <span className="text-xs">Loading blueprint takeaways…</span>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500 space-y-2">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
                <Brain className="h-5 w-5 text-zinc-600" />
              </div>
              <p className="text-xs font-semibold text-zinc-300">No blueprint takeaways found</p>
              <p className="text-[11px] text-zinc-500 max-w-sm">
                Key decisions and parameters you reach during chats are saved here to seed future threads.
              </p>
            </div>
          ) : (
            filteredMemories.map((mem) => {
              const isEditing = editingId === mem.id;
              const cat = (mem.category || 'decision').toLowerCase();

              return (
                <div
                  key={mem.id}
                  className={`group p-3 rounded-xl border transition-all flex items-start gap-2.5 ${
                    mem.is_active
                      ? 'bg-zinc-950/50 border-zinc-800/90 hover:border-zinc-700'
                      : 'bg-zinc-950/20 border-zinc-900 opacity-40'
                  }`}
                >
                  {/* Active in blueprint checkbox */}
                  <input
                    type="checkbox"
                    checked={mem.is_active}
                    onChange={() => handleToggleActive(mem)}
                    title={mem.is_active ? 'Active in blueprint' : 'Archived / excluded from seeding'}
                    className="mt-1 accent-amber-500 rounded cursor-pointer shrink-0"
                  />

                  {/* Body / Edit */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className={`text-[9.5px] font-semibold uppercase px-1.5 py-0.2 rounded font-mono ${
                          cat === 'decision' || cat === 'milestone'
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            : cat === 'constraint'
                            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {cat}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(mem.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="flex-1 bg-zinc-950 border border-amber-500/80 rounded-lg px-2.5 py-1 text-xs text-zinc-100 focus:outline-none"
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
                    ) : (
                      <p
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditText(mem.thought);
                        }}
                        title="Click to edit"
                        className="text-xs text-zinc-200 leading-relaxed cursor-text hover:text-amber-300 transition-colors select-text"
                      >
                        {mem.thought}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditText(mem.thought);
                        }}
                        title="Edit takeaway"
                        className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(mem.id)}
                        title="Delete takeaway"
                        className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span className="text-[11.5px] text-zinc-500">
            💡 Active (checked) items will seed new chats in this workspace.
          </span>

          <div className="flex items-center gap-2">
            {memories.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11.5px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer mr-1 font-medium"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium transition-colors cursor-pointer text-xs border border-zinc-700/60"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
