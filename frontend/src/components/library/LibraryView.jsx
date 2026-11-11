import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Upload,
  Download,
  Trash2,
  Tag,
  Folder,
  Layers,
  Sparkles,
  MessageSquare,
  FileText,
  Clock,
  Filter,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Plus,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import {
  getLibraryAPI,
  deleteLibraryItemAPI,
  exportLibraryBibtexAPI,
  uploadFile,
} from '../../services/api';
import LibraryInspector from './LibraryInspector';

export default function LibraryView({
  workspaces = [],
  onClose,
  onStartChatWithPaper,
  onOpenPdfViewer,
  onOpenLitReviewWithDocs,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [activeWorkspaceFilter, setActiveWorkspaceFilter] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  
  // Selected Document for Right Inspector
  const [selectedDoc, setSelectedDoc] = useState(null);
  
  // Multi-select Checkbox State
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // Sort State
  const [sortField, setSortField] = useState('created_at'); // 'title' | 'year' | 'created_at' | 'authors'
  const [sortAsc, setSortAsc] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Escape key returns to chat or closes inspector
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedDoc) {
          setSelectedDoc(null);
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDoc, onClose]);

  // Fetch Library Items
  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const data = await getLibraryAPI({
        tag: activeTag,
        workspace_id: activeWorkspaceFilter,
        search: searchQuery,
      });
      setItems(data.items || []);
      setAvailableTags(data.available_tags || []);
      
      // If currently selected doc was updated, refresh its reference
      if (selectedDoc) {
        const found = (data.items || []).find((d) => d.id === selectedDoc.id);
        if (found) setSelectedDoc(found);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [activeTag, activeWorkspaceFilter]);

  // Handle Search on Enter or debounce
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLibrary();
  };

  // Upload handler
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await uploadFile(file);
      await fetchLibrary();
    } catch (err) {
      console.error('Failed to upload file to library:', err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Sorting
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [items, sortField, sortAsc]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Multi-select helpers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === sortedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedItems.map((i) => i.id)));
    }
  };

  const handleToggleSelectItem = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Batch BibTeX Export
  const handleExportSelectedBibtex = () => {
    if (selectedIds.size > 0) {
      const docIdsStr = Array.from(selectedIds).join(',');
      exportLibraryBibtexAPI({ doc_ids: docIdsStr });
    } else {
      exportLibraryBibtexAPI({ workspace_id: activeWorkspaceFilter });
    }
  };

  // Batch Literature Review trigger
  const handleSynthesizeReview = () => {
    const chosenDocs = sortedItems
      .filter((i) => selectedIds.has(i.id))
      .map((i) => i.doc_name);
    if (onOpenLitReviewWithDocs && chosenDocs.length > 0) {
      onOpenLitReviewWithDocs(chosenDocs);
    }
  };

  // Delete single item
  const handleDeleteItem = async (docId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to remove this document from your library?')) return;
    try {
      await deleteLibraryItemAPI(docId);
      if (selectedDoc && selectedDoc.id === docId) setSelectedDoc(null);
      await fetchLibrary();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  return (
    <div className="h-full flex flex-col w-full bg-zinc-950 text-zinc-200 overflow-hidden select-text relative z-10">
      {/* ========================================================================= */}
      {/* TOP WORKBENCH HEADER & ACTION BAR */}
      {/* ========================================================================= */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-md px-4 flex items-center justify-between gap-4 shrink-0 select-none">
        {/* Left: 1-Click Back to Chat Button & Branding */}
        <div className="flex items-center gap-3 shrink-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 hover:text-amber-400 text-zinc-200 border border-zinc-700/80 rounded-lg text-xs font-medium transition-all shadow-sm cursor-pointer group"
              title="Return to Chat Interface (Esc)"
            >
              <ArrowLeft className="h-4 w-4 text-zinc-400 group-hover:text-amber-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Chat</span>
              <kbd className="hidden sm:inline-block text-[10px] bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/80 font-mono">Esc</kbd>
            </button>
          )}

          <div className="h-5 w-px bg-zinc-800 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-500 shrink-0">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-zinc-100 tracking-tight leading-none">Reference Library</h1>
                <span className="text-[11px] bg-zinc-800/90 px-2 py-0.5 rounded-full text-zinc-400 font-mono">
                  {items.length} {items.length === 1 ? 'doc' : 'docs'}
                </span>
              </div>
              <p className="text-[10.5px] text-zinc-500 hidden sm:block mt-0.5">Zotero-style Academic Reference & Citation Manager</p>
            </div>
          </div>
        </div>

        {/* Center: Search Box */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md mx-2 relative">
          <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, authors, venue, DOI, or keywords..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/70 transition-colors shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
            >
              ×
            </button>
          )}
        </form>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {selectedIds.size > 0 && (
            <>
              <button
                type="button"
                onClick={handleSynthesizeReview}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-lg text-xs font-semibold shadow transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Synthesize Review ({selectedIds.size})</span>
              </button>
              <button
                type="button"
                onClick={handleExportSelectedBibtex}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export BibTeX</span>
              </button>
            </>
          )}

          {/* Upload PDF */}
          <label className="flex items-center gap-1.5 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            <span>{isUploading ? 'Indexing...' : 'Add Paper'}</span>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={fetchLibrary}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Refresh Library"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main 3-Pane Body */}
      <div className="flex-1 flex w-full overflow-hidden">
        {/* ========================================================================= */}
        {/* PANE 1: COLLECTIONS & WORKSPACES SIDEBAR */}
        {/* ========================================================================= */}
        <div className="w-64 h-full bg-zinc-900/60 border-r border-zinc-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Collections</span>
          </div>

          {/* Collections Nav */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
            <div>
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 block mb-1">
                Views
              </span>
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTag(null);
                    setActiveWorkspaceFilter(null);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                    !activeTag && !activeWorkspaceFilter
                      ? 'bg-amber-500/15 text-amber-400 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>All Documents</span>
                </button>
              </div>
            </div>

            {/* Workspaces / Collections */}
            <div>
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 block mb-1">
                Workspaces (Collections)
              </span>
              <div className="space-y-0.5">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      setActiveWorkspaceFilter(activeWorkspaceFilter === ws.id ? null : ws.id);
                      setActiveTag(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                      activeWorkspaceFilter === ws.id
                        ? 'bg-amber-500/15 text-amber-400 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Folder className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate">{ws.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {ws.doc_names?.length || 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tags Cloud */}
            {availableTags.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 block mb-1">
                  Filter by Tags
                </span>
                <div className="flex flex-wrap gap-1 px-1">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setActiveTag(activeTag === tag ? null : tag);
                        setActiveWorkspaceFilter(null);
                      }}
                      className={`text-[11px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                        activeTag === tag
                          ? 'bg-amber-500 text-zinc-950 font-medium'
                          : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom BibTeX Export Action */}
          <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/40">
            <button
              type="button"
              onClick={() => exportLibraryBibtexAPI()}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 rounded-md text-xs font-medium transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              <span>Export Library (.bib)</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PANE 2: MAIN DATA TABLE */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">

        {/* Data Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
              <RefreshCw className="h-5 w-5 animate-spin text-amber-500" />
              <p className="text-xs">Loading reference library...</p>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-3">
              <BookOpen className="h-8 w-8 text-zinc-700" />
              <p className="text-xs font-medium text-zinc-400">No documents found in this view.</p>
              <p className="text-[11px] text-zinc-600 max-w-xs text-center">
                Click "Add Paper" to import PDFs into your reference library.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-900/70 border-b border-zinc-800 text-zinc-400 font-medium select-none sticky top-0 z-10">
                  <th className="py-2.5 px-3 w-8">
                    <button
                      onClick={handleToggleSelectAll}
                      className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {selectedIds.size === sortedItems.length ? (
                        <CheckSquare className="h-3.5 w-3.5 text-amber-400" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </th>
                  <th
                    onClick={() => toggleSort('title')}
                    className="py-2.5 px-3 cursor-pointer hover:text-zinc-200"
                  >
                    <div className="flex items-center gap-1">
                      <span>Title & Filename</span>
                      {sortField === 'title' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('authors')}
                    className="py-2.5 px-3 w-48 cursor-pointer hover:text-zinc-200"
                  >
                    <div className="flex items-center gap-1">
                      <span>Authors</span>
                      {sortField === 'authors' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('year')}
                    className="py-2.5 px-3 w-20 cursor-pointer hover:text-zinc-200"
                  >
                    <div className="flex items-center gap-1">
                      <span>Year</span>
                      {sortField === 'year' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 w-36">Venue / Journal</th>
                  <th className="py-2.5 px-3 w-40">Workspaces</th>
                  <th className="py-2.5 px-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {sortedItems.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const isInspecting = selectedDoc?.id === item.id;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedDoc(item)}
                      className={`transition-colors cursor-pointer group ${
                        isInspecting
                          ? 'bg-amber-500/10 hover:bg-amber-500/15'
                          : isSelected
                          ? 'bg-zinc-900/80 hover:bg-zinc-900'
                          : 'hover:bg-zinc-900/50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleToggleSelectItem(item.id, e)}
                          className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-amber-400" />
                          ) : (
                            <Square className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>

                      {/* Title & Filename */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="font-medium text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-1">
                            {item.title || item.doc_name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {item.doc_name}
                            </span>
                            {item.summary_cache && (
                              <span className="inline-flex items-center gap-0.5 text-[9.5px] bg-amber-500/10 text-amber-400 px-1.5 py-0.2 rounded font-medium">
                                <Sparkles className="h-2.5 w-2.5" />
                                <span>TL;DR</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Authors */}
                      <td className="py-2.5 px-3 text-zinc-300">
                        <span className="line-clamp-1">{item.authors || '—'}</span>
                      </td>

                      {/* Year */}
                      <td className="py-2.5 px-3 font-mono text-zinc-400">
                        {item.year || '—'}
                      </td>

                      {/* Venue */}
                      <td className="py-2.5 px-3 text-zinc-400">
                        <span className="line-clamp-1">{item.venue || '—'}</span>
                      </td>

                      {/* Workspaces */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {item.workspaces?.length > 0 ? (
                            item.workspaces.map((ws) => (
                              <span
                                key={ws.id}
                                className="text-[10px] bg-zinc-800/80 text-zinc-400 px-1.5 py-0.5 rounded truncate max-w-[120px]"
                              >
                                {ws.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-zinc-600">—</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                          <button
                            onClick={() => onStartChatWithPaper && onStartChatWithPaper(item.doc_name)}
                            className="p-1 hover:text-amber-400 text-zinc-400 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Chat with this paper"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenPdfViewer && onOpenPdfViewer(item.doc_name, 1)}
                            className="p-1 hover:text-zinc-100 text-zinc-400 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Read PDF"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteItem(item.id, e)}
                            className="p-1 hover:text-red-400 text-zinc-500 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Delete from library"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PANE 3: METADATA & CITATION INSPECTOR */}
      {/* ========================================================================= */}
      {selectedDoc && (
        <LibraryInspector
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onUpdateDocument={(updated) => {
            setSelectedDoc(updated);
            fetchLibrary();
          }}
          onOpenPdf={onOpenPdfViewer}
          onChatWithPaper={onStartChatWithPaper}
        />
      )}
      </div>
    </div>
  );
}
