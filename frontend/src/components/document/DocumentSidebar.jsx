import React from 'react';
import { Plus, MessageSquare, Trash2, FolderKanban, Sparkles, Loader2 } from 'lucide-react';
import { AuthProfile } from '../layout/AuthProfile';

export default function DocumentSidebar({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onDeleteWorkspace,
  onOpenCreateModal,
  onGenerateReview,
  isGenerating,
  onAuthChange
}) {
  return (
    <aside className="w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col h-full shrink-0 select-none">
      {/* Top Action Buttons */}
      <div className="p-4 space-y-2 border-b border-zinc-900">
        {/* New Workspace Button */}
        <button
          onClick={onOpenCreateModal}
          className="w-full flex items-center justify-center gap-2.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold py-3 px-4 rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          <Plus className="h-5 w-5 stroke-[2.5]" />
          <span className="text-sm">New Workspace</span>
        </button>

        {/* Generate Literature Review Button */}
        <button
          onClick={onGenerateReview}
          disabled={isGenerating || workspaces.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium py-2.5 px-4 rounded-xl text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95 shadow-sm"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span>Synthesizing Review...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Generate Literature Review</span>
            </>
          )}
        </button>
      </div>

      {/* Recent Workspaces List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase flex items-center justify-between">
          <span>Recent Workspaces</span>
          <FolderKanban className="h-3.5 w-3.5 text-zinc-600" />
        </div>

        {workspaces.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">
            No workspaces yet.<br />Click <strong className="text-zinc-400">+ New Workspace</strong> to begin.
          </div>
        ) : (
          workspaces.map((ws) => {
            const isActive = ws.id === activeWorkspaceId;
            return (
              <div
                key={ws.id}
                onClick={() => onSelectWorkspace(ws)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                  isActive
                    ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-800'
                    : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                  <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-zinc-600'}`} />
                  <span className="truncate">{ws.name}</span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteWorkspace(ws.id);
                  }}
                  title="Delete Workspace"
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 p-1 rounded transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info & Auth Profile */}
      <div className="border-t border-zinc-900 bg-zinc-950/95">
        <div className="px-4 py-2 text-[11px] text-zinc-600 font-mono border-b border-zinc-900/60">
          {workspaces.length} Active Workspace(s)
        </div>
        <AuthProfile onAuthChange={onAuthChange} />
      </div>
    </aside>
  );
}