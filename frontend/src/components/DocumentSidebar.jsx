import React from 'react';
import { Plus, FileText, CheckCircle2, Circle, RefreshCw } from 'lucide-react';

export default function DocumentSidebar({
  documents,
  selectedDocs,
  setSelectedDocs,
  onOpenCreateModal,
  refreshDocs,
  loadingDocs
}) {
  const toggleDoc = (docName) => {
    if (selectedDocs.includes(docName)) {
      setSelectedDocs(selectedDocs.filter((name) => name !== docName));
    } else {
      setSelectedDocs([...selectedDocs, docName]);
    }
  };

  return (
    <aside className="w-72 bg-zinc-950 border-r border-zinc-800/80 flex flex-col h-full shrink-0 select-none">
      {/* Top Gemini-Style Action: New Workspace */}
      <div className="p-4 border-b border-zinc-800/80">
        <button
          onClick={onOpenCreateModal}
          className="w-full flex items-center justify-center gap-2.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold py-3 px-4 rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          <Plus className="h-5 w-5 stroke-[2.5]" />
          <span className="text-sm">New Workspace</span>
        </button>
      </div>

      {/* Workspace Documents Navigation */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
          <span>Active Documents</span>
          <button
            onClick={refreshDocs}
            className="hover:text-amber-400 transition-colors"
            title="Refresh Library"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDocs ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-zinc-600 leading-relaxed">
            No active documents.<br />Click <strong className="text-zinc-400">+ New Workspace</strong> to select research papers.
          </div>
        ) : (
          documents.map((doc) => {
            const isSelected = selectedDocs.includes(doc.doc_name);
            return (
              <div
                key={doc.doc_name}
                onClick={() => toggleDoc(doc.doc_name)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all text-xs ${
                  isSelected
                    ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-800'
                    : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
                }`}
              >
                {isSelected ? (
                  <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-zinc-700 shrink-0" />
                )}
                <FileText className="h-4 w-4 text-zinc-500 shrink-0" />
                <span className="truncate flex-1">{doc.doc_name}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Scope Indicator */}
      <div className="p-4 border-t border-zinc-900 text-[11px] text-zinc-600 font-mono">
        {selectedDocs.length > 0 ? `${selectedDocs.length} Doc(s) Scoped` : 'Corpus Scope: All'}
      </div>
    </aside>
  );
}