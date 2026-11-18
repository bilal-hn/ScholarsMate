import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Layers,
  Check,
  Loader2,
  Brain,
  MessageSquarePlus,
} from 'lucide-react';
import { getWorkspaceContextPointsAPI } from '../../services/api';

export default function NewChatModal({
  isOpen,
  onClose,
  workspace,
  defaultTitle = 'New Chat',
  onConfirm,
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [contextPoints, setContextPoints] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && workspace?.id) {
      setTitle(defaultTitle);
      setIsLoading(true);
      getWorkspaceContextPointsAPI(workspace.id)
        .then((points) => {
          if (Array.isArray(points) && points.length > 0) {
            setContextPoints(points);
            // Pre-select all active blueprint points by default
            setSelectedIds(new Set(points.map((p) => p.id)));
          } else {
            setContextPoints([]);
            setSelectedIds(new Set());
          }
        })
        .catch(() => {
          setContextPoints([]);
          setSelectedIds(new Set());
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, workspace, defaultTitle]);

  if (!isOpen) return null;

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === contextPoints.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contextPoints.map((p) => p.id)));
    }
  };

  const handleSubmit = (withBlueprint = true) => {
    const finalTitle = title.trim() || defaultTitle;
    const seedIds = withBlueprint && selectedIds.size > 0 ? Array.from(selectedIds) : [];
    onConfirm({ title: finalTitle, seedMemoryIds: seedIds });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-zinc-100 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <MessageSquarePlus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-100">
                New Chat in <span className="text-amber-400">{workspace?.name || 'Workspace'}</span>
              </h3>
              <p className="text-[11px] text-zinc-500">
                Start clean or seed with decisions from prior chats
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Chat Title Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              Chat Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Training Optimization & Baseline"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-colors font-medium"
            />
          </div>

          {/* Blueprint Seeding Section */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-zinc-200">
                  Workspace Blueprint Takeaways
                </span>
              </div>
              {contextPoints.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-medium cursor-pointer transition-colors"
                >
                  {selectedIds.size === contextPoints.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-xs text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                <span>Checking workspace decisions...</span>
              </div>
            ) : contextPoints.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-center space-y-1">
                <p className="text-xs text-zinc-400 font-medium">No prior blueprint decisions yet</p>
                <p className="text-[11px] text-zinc-600">
                  This chat will start clean. Key breakthroughs you reach will be saved to your blueprint.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                <p className="text-[11px] text-zinc-400 leading-relaxed mb-1.5">
                  Select key decisions and findings from prior chats to seed into this new thread:
                </p>
                {contextPoints.map((pt) => {
                  const isChecked = selectedIds.has(pt.id);
                  const category = pt.category || 'decision';
                  return (
                    <div
                      key={pt.id}
                      onClick={() => toggleSelect(pt.id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                        isChecked
                          ? 'bg-amber-500/10 border-amber-500/30 text-zinc-100 shadow-sm'
                          : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 accent-amber-500 rounded cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`text-[9.5px] font-semibold uppercase px-1.5 py-0.2 rounded font-mono ${
                              category === 'decision'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : category === 'constraint'
                                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {category}
                          </span>
                          {pt.session_title && (
                            <span className="text-[10px] text-zinc-500 font-sans truncate">
                              • {pt.session_title}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] leading-relaxed select-text font-normal">
                          {pt.thought}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {contextPoints.length > 0 && (
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer border border-zinc-700/60"
                title="Start with an empty conversation context"
              >
                Start Blank
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 stroke-[2.2]" />
              <span>
                {selectedIds.size > 0
                  ? `Create with Blueprint (${selectedIds.size})`
                  : 'Create Chat'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
