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
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import {
  fetchBrainMemoriesAPI,
  consolidateBrainMemoriesAPI,
  createBrainMemoryAPI,
  updateBrainMemoryAPI,
  deleteBrainMemoryAPI,
  clearBrainMemoriesAPI,
} from '../../services/api';

const CATEGORY_CONFIG = {
  all: { label: 'All Takeaways', icon: Layers, color: 'zinc' },
  decision: { label: 'Decisions', icon: CheckCircle2, color: 'blue', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  constraint: { label: 'Constraints', icon: AlertTriangle, color: 'purple', badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  finding: { label: 'Paper Findings', icon: BookOpen, color: 'emerald', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

export default function BrainModal({
  isOpen,
  onClose,
  activeWorkspaceId,
  activeSessionId,
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // New takeaway input
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

  // Counts by category
  const counts = useMemo(() => {
    const res = { all: memories.length, decision: 0, constraint: 0, finding: 0 };
    for (const m of memories) {
      const c = (m.category || 'decision').toLowerCase();
      if (c === 'decision' || c === 'milestone') res.decision++;
      else if (c === 'constraint') res.constraint++;
      else if (c === 'finding' || c === 'insight') res.finding++;
      else res.decision++;
    }
    return res;
  }, [memories]);

  const activeCount = useMemo(() => {
    return memories.filter((m) => m.is_active).length;
  }, [memories]);

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

  // ── On-demand consolidation from chat ────────────────────────────────
  const handleSyncFromChat = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncSuccessMsg(null);
    try {
      const res = await consolidateBrainMemoriesAPI({
        session_id: activeSessionId || null,
        workspace_id: activeWorkspaceId || null,
      });
      if (res && Array.isArray(res.memories)) {
        const prevCount = memories.length;
        setMemories(res.memories);
        const diff = res.memories.length - prevCount;
        setSyncSuccessMsg(
          diff > 0
            ? `Extracted ${diff} new takeaway${diff > 1 ? 's' : ''} from conversation!`
            : 'Workspace Brain is up to date with chat context.'
        );
      } else {
        await loadMemories();
        setSyncSuccessMsg('Refreshed memory list.');
      }
    } catch (err) {
      console.error('Failed to sync from chat:', err);
      await loadMemories();
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncSuccessMsg(null), 4000);
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
        session_id: activeSessionId || null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div
        ref={modalRef}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-zinc-100 font-sans"
      >
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
              <Brain className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base text-zinc-100 tracking-tight">
                  Workspace Brain
                </span>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium shrink-0">
                  {activeCount} active in context
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate mt-0.5 flex items-center gap-1.5">
                <FolderOpen className="h-3 w-3 text-zinc-500 shrink-0" />
                <span>{activeWorkspaceName}</span>
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Sync from Chat Button */}
            <button
              type="button"
              onClick={handleSyncFromChat}
              disabled={isSyncing || isLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer shadow-sm ${
                isSyncing
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-zinc-900 hover:bg-zinc-800/90 text-zinc-200 hover:text-amber-300 border-zinc-700/80'
              }`}
              title="Analyze active conversation turns and extract decisions & paper findings"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-amber-400' : 'text-zinc-400'}`} />
              <span>{isSyncing ? 'Analyzing Chat…' : 'Sync from Chat'}</span>
            </button>

            {/* Auto-Capture Pill */}
            <button
              type="button"
              onClick={toggleBrain}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                isBrainEnabled
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/15'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
              }`}
              title={isBrainEnabled ? 'Auto-capture is active: background AI extracts takeaways during research' : 'Auto-capture paused'}
            >
              <span className={`w-2 h-2 rounded-full ${isBrainEnabled ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-zinc-600'}`} />
              <span>{isBrainEnabled ? 'Auto-Capture' : 'Paused'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer border border-zinc-800 ml-1"
              title="Close modal (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── SYNC STATUS BANNER ─────────────────────────────────────── */}
        {syncSuccessMsg && (
          <div className="flex items-center gap-2 px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 animate-in fade-in duration-200 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="font-medium">{syncSuccessMsg}</span>
          </div>
        )}

        {/* ── QUICK-ADD INPUT ────────────────────────────────────────── */}
        <div className="px-6 py-3.5 border-b border-zinc-800/80 bg-zinc-900/30 shrink-0">
          <form onSubmit={handleAddThought} className="flex items-center gap-2.5">
            <input
              ref={inputRef}
              type="text"
              value={newThought}
              onChange={(e) => setNewThought(e.target.value)}
              placeholder="Record a project decision, benchmark parameter, or paper takeaway..."
              className="flex-1 bg-zinc-900/90 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/25 transition-colors shadow-inner"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/70 cursor-pointer transition-colors shrink-0"
            >
              <option value="decision">Decision</option>
              <option value="constraint">Constraint / Discarded</option>
              <option value="finding">Paper Finding</option>
            </select>
            <button
              type="submit"
              disabled={!newThought.trim() || isAdding}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 text-xs font-semibold shadow-sm transition-all cursor-pointer shrink-0"
            >
              {isAdding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 stroke-[2.5]" />}
              <span>Add</span>
            </button>
          </form>
        </div>

        {/* ── CATEGORY TABS & SEARCH ─────────────────────────────────── */}
        <div className="px-6 py-2.5 border-b border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {Object.entries(CATEGORY_CONFIG).map(([id, cfg]) => {
              const Icon = cfg.icon;
              const count = counts[id] || 0;
              const isSelected = categoryFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategoryFilter(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{cfg.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? 'bg-amber-400 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-48 shrink-0">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search blueprint…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/70 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* ── MEMORY LIST ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 bg-zinc-950">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2.5">
              <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
              <span className="text-xs font-medium">Loading workspace blueprint…</span>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto shadow-inner">
                <Brain className="h-6 w-6 text-zinc-600" />
              </div>
              <div className="max-w-md">
                <p className="text-sm font-semibold text-zinc-200">No blueprint takeaways found</p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  ScholarsMate automatically captures architectural decisions, empirical parameters, and paper findings as you chat.
                </p>
              </div>
              {activeSessionId && (
                <button
                  type="button"
                  onClick={handleSyncFromChat}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition-all cursor-pointer shadow-sm mt-2"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Analyze Active Chat Now</span>
                </button>
              )}
            </div>
          ) : (
            filteredMemories.map((mem) => {
              const isEditing = editingId === mem.id;
              const cat = (mem.category || 'decision').toLowerCase();
              const catInfo = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.decision;
              const CatIcon = catInfo.icon;

              return (
                <div
                  key={mem.id}
                  className={`group p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                    mem.is_active
                      ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700/80 shadow-sm'
                      : 'bg-zinc-900/20 border-zinc-900/80 opacity-50'
                  }`}
                >
                  {/* Active / Inactive Context Checkbox */}
                  <div className="pt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={mem.is_active}
                      onChange={() => handleToggleActive(mem)}
                      title={mem.is_active ? 'Active in prompt: Injected into new chat context' : 'Inactive: Excluded from prompt'}
                      className="accent-amber-500 w-4 h-4 rounded cursor-pointer transition-colors"
                    />
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md font-mono border ${catInfo.badge}`}
                      >
                        <CatIcon className="h-3 w-3" />
                        <span>{cat}</span>
                      </span>

                      <span className="text-[10px] text-zinc-500">
                        {mem.is_active ? (
                          <span className="text-emerald-400/90 font-medium">● In prompt</span>
                        ) : (
                          <span className="text-zinc-500">Archived</span>
                        )}
                      </span>
                    </div>

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
                          className="flex-1 bg-zinc-950 border border-amber-500/80 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(mem.id)}
                          className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors cursor-pointer"
                          title="Save"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 transition-colors cursor-pointer"
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
                        className="text-xs text-zinc-200 leading-relaxed cursor-text hover:text-amber-200 transition-colors select-text"
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
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(mem.id)}
                        title="Delete takeaway"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <div className="px-6 py-3.5 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span className="text-[11.5px] text-zinc-500 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Active items are compiled into <code className="text-amber-300 font-mono text-[10.5px]">&lt;workspace_blueprint&gt;</code> to ground subsequent chats.</span>
          </span>

          <div className="flex items-center gap-2">
            {memories.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer mr-2 font-medium"
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
