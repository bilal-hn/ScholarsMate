import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  Book,
  Paperclip,
  Search,
  Upload,
  Download,
  Trash2,
  Tag,
  Sparkles,
  MessageSquare,
  RefreshCw,
  ArrowLeft,
  ExternalLink,
  X,
  AlertCircle,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Wand2,
  Plus,
  Layers,
  Inbox,
  Filter,
} from 'lucide-react';
import {
  getLibraryAPI,
  deleteLibraryItemAPI,
  exportLibraryBibtexAPI,
  uploadFile,
  autoEnrichDocumentAPI,
  addLibraryReferenceAPI,
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
  const [tagFilterQuery, setTagFilterQuery] = useState('');

  // Selected Document for Right Inspector (Single Click = Select/Inspect)
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Multi-select Checkbox State for Batch Actions
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Expandable sub-rows (Zotero shows attached Full Text PDF as a sub-row)
  const [expandedDocIds, setExpandedDocIds] = useState(new Set());

  // Sort State
  const [sortField, setSortField] = useState('title'); // 'title' | 'authors' | 'year' | 'venue' | 'created_at'
  const [sortAsc, setSortAsc] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Add by Identifier Modal State (FR-17.3)
  const [isAddIdentifierOpen, setIsAddIdentifierOpen] = useState(false);
  const [identifierInput, setIdentifierInput] = useState('');
  const [isAddingIdentifier, setIsAddingIdentifier] = useState(false);
  const [addError, setAddError] = useState(null);
  const [enrichingDocIds, setEnrichingDocIds] = useState(new Set());

  // Escape key returns to chat or closes inspector
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isAddIdentifierOpen) {
          setIsAddIdentifierOpen(false);
        } else if (selectedDoc) {
          setSelectedDoc(null);
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDoc, isAddIdentifierOpen, onClose]);

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

  // Expand / collapse sub-item (PDF attachment)
  const toggleRowExpansion = (docId, e) => {
    e?.stopPropagation();
    setExpandedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
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

  // Quick auto-enrich item via CrossRef or arXiv
  const handleQuickEnrich = async (docId, e) => {
    e.stopPropagation();
    setEnrichingDocIds((prev) => new Set(prev).add(docId));
    try {
      const enriched = await autoEnrichDocumentAPI(docId);
      if (enriched) {
        setItems((prev) => prev.map((item) => (item.id === docId ? enriched : item)));
        if (selectedDoc && selectedDoc.id === docId) setSelectedDoc(enriched);
      }
    } catch (err) {
      console.error('Failed to auto-enrich document:', err);
    } finally {
      setEnrichingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  // Add paper reference directly by DOI or arXiv ID
  const handleAddIdentifierSubmit = async (e) => {
    e.preventDefault();
    if (!identifierInput.trim()) return;
    setIsAddingIdentifier(true);
    setAddError(null);
    try {
      const newDoc = await addLibraryReferenceAPI(identifierInput.trim());
      setIsAddIdentifierOpen(false);
      setIdentifierInput('');
      await fetchLibrary();
      setSelectedDoc(newDoc);
    } catch (err) {
      setAddError(err.response?.data?.detail || 'Could not resolve identifier. Please verify the DOI or arXiv ID.');
    } finally {
      setIsAddingIdentifier(false);
    }
  };

  // Filter tags based on tag filter query
  const filteredTags = useMemo(() => {
    if (!tagFilterQuery.trim()) return availableTags;
    return availableTags.filter((t) => t.toLowerCase().includes(tagFilterQuery.toLowerCase().trim()));
  }, [availableTags, tagFilterQuery]);

  // Determine item icon based on type
  const getItemIcon = (item, isSelected) => {
    if (item.arxiv_id || item.item_type === 'preprint') {
      return (
        <FileCode
          className={`h-3.5 w-3.5 shrink-0 ${
            isSelected ? 'text-white' : 'text-rose-500'
          }`}
          title="Preprint (arXiv)"
        />
      );
    }
    if (item.item_type === 'book_chapter' || item.item_type === 'book') {
      return (
        <Book
          className={`h-3.5 w-3.5 shrink-0 ${
            isSelected ? 'text-white' : 'text-purple-500'
          }`}
          title="Book / Chapter"
        />
      );
    }
    // Default: Journal Article
    return (
      <FileText
        className={`h-3.5 w-3.5 shrink-0 ${
          isSelected ? 'text-white' : 'text-blue-500'
        }`}
        title="Journal Article"
      />
    );
  };

  return (
    <div className="h-full flex flex-col w-full bg-zinc-950 text-zinc-100 overflow-hidden select-text relative z-10 font-sans">
      {/* ========================================================================= */}
      {/* NATIVE ZOTERO-STYLE APPLICATION TOOLBAR (Height: 38px) */}
      {/* ========================================================================= */}
      <header className="h-10 border-b border-zinc-800 bg-zinc-900/90 px-3 flex items-center justify-between gap-3 shrink-0 select-none text-xs">
        {/* Left Section: Back to Chat Button + Breadcrumb */}
        <div className="flex items-center gap-2 shrink-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700/60 rounded text-[11.5px] font-medium transition-colors cursor-pointer group"
              title="Return to Chat Interface (Esc)"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-200" />
              <span>Back to Chat</span>
              <kbd className="text-[10px] bg-zinc-900 text-zinc-400 px-1 py-0.2 rounded border border-zinc-700/80 font-mono">Esc</kbd>
            </button>
          )}

          <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

          {/* Collection / Library Brand */}
          <div className="flex items-center gap-1.5 px-1">
            <Folder className="h-3.5 w-3.5 text-blue-500 fill-blue-500/20 shrink-0" />
            <span className="font-semibold text-zinc-200 text-xs">My Library</span>
            <span className="text-[11px] text-zinc-500 font-mono">({items.length})</span>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Zotero Desktop Action Buttons */}
          <div className="flex items-center gap-1">
            {/* New Item (Upload PDF) */}
            <label
              className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 rounded text-[11.5px] font-medium transition-colors cursor-pointer"
              title="Add PDF Document to Library"
            >
              <Plus className="h-3.5 w-3.5 text-blue-400" />
              <span>{isUploading ? 'Indexing...' : 'New Item'}</span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>

            {/* Add by Identifier (DOI / arXiv Wand) */}
            <button
              type="button"
              onClick={() => {
                setIsAddIdentifierOpen(true);
                setAddError(null);
              }}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 rounded text-[11.5px] font-medium transition-colors cursor-pointer"
              title="Add item by DOI or arXiv identifier"
            >
              <Wand2 className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden md:inline">Add by Identifier</span>
            </button>

            {/* Export BibTeX */}
            <button
              type="button"
              onClick={handleExportSelectedBibtex}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700/60 rounded text-[11.5px] font-medium transition-colors cursor-pointer"
              title="Export to BibTeX format"
            >
              <Download className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden md:inline">Export (.bib)</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={fetchLibrary}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
              title="Refresh Library"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>

          {/* Batch Selection Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-zinc-800">
              <button
                type="button"
                onClick={handleSynthesizeReview}
                className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium transition-colors shadow-sm cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                <span>Synthesize Review ({selectedIds.size})</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Section: Compact Zotero-Style Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative w-64 shrink-0">
          <Search className="h-3 w-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search All Fields & Tags..."
            className="w-full bg-zinc-950 border border-zinc-750 rounded pl-7 pr-6 py-1 text-[11.5px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
            >
              ×
            </button>
          )}
        </form>
      </header>

      {/* ========================================================================= */}
      {/* MAIN 3-PANE SPLIT VIEW: COLLECTIONS | DATA TABLE | INSPECTOR */}
      {/* ========================================================================= */}
      <div className="flex-1 flex w-full overflow-hidden">
        {/* ========================================================================= */}
        {/* PANE 1: ZOTERO TREE SIDEBAR (Collections & Tag Selector) */}
        {/* ========================================================================= */}
        <div className="w-56 h-full bg-zinc-900/70 border-r border-zinc-800 flex flex-col shrink-0 select-none">
          {/* Tree Navigation Header */}
          <div className="flex-1 overflow-y-auto py-2">
            {/* Root: My Library */}
            <div className="px-1.5 mb-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTag(null);
                  setActiveWorkspaceFilter(null);
                }}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                  !activeTag && !activeWorkspaceFilter
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                }`}
              >
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <Folder className={`h-3.5 w-3.5 shrink-0 ${!activeTag && !activeWorkspaceFilter ? 'text-white fill-white/20' : 'text-blue-500 fill-blue-500/20'}`} />
                <span className="truncate flex-1 text-left">My Library</span>
                <span className={`text-[10px] font-mono ${!activeTag && !activeWorkspaceFilter ? 'text-blue-100' : 'text-zinc-500'}`}>
                  {items.length}
                </span>
              </button>
            </div>

            {/* Indented Workspace Collections */}
            <div className="space-y-0.5 px-1.5 pl-4">
              {workspaces.map((ws) => {
                const isSelected = activeWorkspaceFilter === ws.id;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      setActiveWorkspaceFilter(isSelected ? null : ws.id);
                      setActiveTag(null);
                    }}
                    className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11.5px] transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                    }`}
                  >
                    <Folder className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-white fill-white/20' : 'text-blue-400 fill-blue-500/20'}`} />
                    <span className="truncate flex-1 text-left">{ws.name}</span>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-100' : 'text-zinc-500'}`}>
                      {ws.doc_names?.length || 0}
                    </span>
                  </button>
                );
              })}

              {/* Unfiled Items */}
              <button
                type="button"
                onClick={() => {
                  // Filter items not in any workspace
                  setActiveWorkspaceFilter('__unfiled__');
                  setActiveTag(null);
                }}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11.5px] transition-colors cursor-pointer ${
                  activeWorkspaceFilter === '__unfiled__'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                }`}
              >
                <Inbox className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <span className="truncate flex-1 text-left">Unfiled Items</span>
              </button>
            </div>
          </div>

          {/* Bottom Pane: Zotero Tag Selector */}
          <div className="h-44 border-t border-zinc-800 bg-zinc-950/40 flex flex-col p-2 select-none">
            {/* Filter Tags Input */}
            <div className="relative mb-1.5">
              <Filter className="h-3 w-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tagFilterQuery}
                onChange={(e) => setTagFilterQuery(e.target.value)}
                placeholder="Filter Tags..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded pl-6 pr-2 py-0.5 text-[10.5px] text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Tag List */}
            <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
              {filteredTags.length > 0 ? (
                filteredTags.map((tag) => {
                  const isSelected = activeTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setActiveTag(isSelected ? null : tag);
                        setActiveWorkspaceFilter(null);
                      }}
                      className={`w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] text-left transition-colors cursor-pointer truncate ${
                        isSelected
                          ? 'bg-blue-600 text-white font-medium'
                          : 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                      }`}
                    >
                      <Tag className={`h-2.5 w-2.5 shrink-0 ${isSelected ? 'text-white' : 'text-zinc-500'}`} />
                      <span className="truncate">{tag}</span>
                    </button>
                  );
                })
              ) : (
                <p className="text-[10px] text-zinc-600 italic px-1 py-2">No tags available</p>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PANE 2: HIGH-DENSITY DATA TABLE (Zotero Desktop Table) */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                <p className="text-xs">Loading library items...</p>
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
                <FileText className="h-8 w-8 text-zinc-700 stroke-[1.5]" />
                <p className="text-xs font-medium text-zinc-400">No items found in this collection.</p>
                <p className="text-[11px] text-zinc-600 max-w-xs text-center">
                  Use "New Item" to import PDF papers or "Add by Identifier" for DOI / arXiv lookups.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse select-none table-fixed">
                <thead>
                  <tr className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 font-semibold text-[11px] h-7 sticky top-0 z-10 select-none">
                    {/* Checkbox */}
                    <th className="w-7 px-1.5 text-center">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-zinc-400 hover:text-zinc-200 cursor-pointer align-middle"
                        title="Select All"
                      >
                        {selectedIds.size === sortedItems.length && sortedItems.length > 0 ? (
                          <CheckSquare className="h-3.5 w-3.5 text-blue-400" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </th>

                    {/* Expand / Collapse Chevron */}
                    <th className="w-5 px-0 text-center"></th>

                    {/* Item Type Icon */}
                    <th className="w-6 px-0 text-center"></th>

                    {/* Title */}
                    <th
                      onClick={() => toggleSort('title')}
                      className="px-2 cursor-pointer hover:text-zinc-200"
                    >
                      <div className="flex items-center gap-1">
                        <span>Title</span>
                        {sortField === 'title' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </th>

                    {/* Creator / Authors */}
                    <th
                      onClick={() => toggleSort('authors')}
                      className="w-48 px-2 cursor-pointer hover:text-zinc-200"
                    >
                      <div className="flex items-center gap-1">
                        <span>Creator</span>
                        {sortField === 'authors' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </th>

                    {/* Year */}
                    <th
                      onClick={() => toggleSort('year')}
                      className="w-16 px-2 text-center cursor-pointer hover:text-zinc-200"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Year</span>
                        {sortField === 'year' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </th>

                    {/* Venue / Publication */}
                    <th className="w-40 px-2 hidden lg:table-cell">Publication</th>

                    {/* Attachment Indicator */}
                    <th className="w-7 px-1 text-center" title="Has PDF Attachment">
                      <Paperclip className="h-3 w-3 mx-auto text-zinc-500" />
                    </th>

                    {/* Actions */}
                    <th className="w-24 px-2 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-850/40 text-xs">
                  {sortedItems.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    const isInspecting = selectedDoc?.id === item.id;
                    const isExpanded = expandedDocIds.has(item.id);

                    return (
                      <React.Fragment key={item.id}>
                        {/* Main Paper Row (Height ~28px - Dense Desktop Style) */}
                        <tr
                          onClick={() => setSelectedDoc(item)}
                          className={`h-7.5 transition-colors cursor-pointer group select-none ${
                            isInspecting
                              ? 'bg-blue-600 text-white font-normal'
                              : isSelected
                              ? 'bg-zinc-850 text-zinc-100'
                              : 'hover:bg-zinc-850/60 text-zinc-300'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleToggleSelectItem(item.id, e)}
                              className={`cursor-pointer align-middle ${
                                isInspecting ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              {isSelected ? (
                                <CheckSquare className={`h-3.5 w-3.5 ${isInspecting ? 'text-white' : 'text-blue-400'}`} />
                              ) : (
                                <Square className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>

                          {/* Expand/Collapse Chevron (Shows attached PDF sub-row) */}
                          <td className="px-0 text-center" onClick={(e) => toggleRowExpansion(item.id, e)}>
                            <button
                              type="button"
                              className={`p-0.5 hover:text-white cursor-pointer ${
                                isInspecting ? 'text-blue-100' : 'text-zinc-500'
                              }`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                          </td>

                          {/* Item Type Icon */}
                          <td className="px-0 text-center">
                            {getItemIcon(item, isInspecting)}
                          </td>

                          {/* Title & Metadata Badges */}
                          <td className="px-2 truncate">
                            <div className="flex items-center gap-1.5 truncate">
                              <span
                                className={`truncate font-medium text-[12.5px] ${
                                  isInspecting ? 'text-white' : 'text-zinc-100 group-hover:text-blue-400'
                                }`}
                                title={item.title || item.doc_name}
                              >
                                {item.title || item.doc_name}
                              </span>

                              {/* Subtle DOI / arXiv Tags */}
                              {item.doi && (
                                <span
                                  className={`text-[9.5px] px-1 py-0.2 rounded font-mono shrink-0 ${
                                    isInspecting
                                      ? 'bg-blue-700 text-blue-100'
                                      : 'bg-zinc-800 text-blue-400'
                                  }`}
                                  title={`DOI: ${item.doi}`}
                                >
                                  DOI
                                </span>
                              )}
                              {item.arxiv_id && (
                                <span
                                  className={`text-[9.5px] px-1 py-0.2 rounded font-mono shrink-0 ${
                                    isInspecting
                                      ? 'bg-blue-700 text-blue-100'
                                      : 'bg-zinc-800 text-rose-400'
                                  }`}
                                  title={`arXiv: ${item.arxiv_id}`}
                                >
                                  arXiv
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Creator / Authors */}
                          <td
                            className={`px-2 truncate text-[12px] ${
                              isInspecting ? 'text-blue-100' : 'text-zinc-400'
                            }`}
                          >
                            <span className="truncate">{item.authors || '—'}</span>
                          </td>

                          {/* Year */}
                          <td
                            className={`px-2 text-center font-mono text-[11.5px] ${
                              isInspecting ? 'text-blue-100' : 'text-zinc-400'
                            }`}
                          >
                            {item.year || '—'}
                          </td>

                          {/* Publication / Venue */}
                          <td
                            className={`px-2 truncate text-[12px] hidden lg:table-cell ${
                              isInspecting ? 'text-blue-100' : 'text-zinc-400'
                            }`}
                          >
                            <span className="truncate">{item.venue || '—'}</span>
                          </td>

                          {/* Attachment (PDF) Indicator */}
                          <td className="px-1 text-center">
                            <FileText
                              className={`h-3.5 w-3.5 mx-auto ${
                                isInspecting ? 'text-white' : 'text-red-400'
                              }`}
                              title="Full Text PDF Attached"
                            />
                          </td>

                          {/* Quick Row Actions */}
                          <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {/* Auto-enrich */}
                              <button
                                type="button"
                                onClick={(e) => handleQuickEnrich(item.id, e)}
                                disabled={enrichingDocIds.has(item.id)}
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isInspecting
                                    ? 'text-white hover:bg-blue-700'
                                    : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800'
                                }`}
                                title="Auto-enrich metadata via CrossRef/arXiv"
                              >
                                <Sparkles className={`h-3 w-3 ${enrichingDocIds.has(item.id) ? 'animate-spin text-amber-300' : ''}`} />
                              </button>

                              {/* Chat with paper */}
                              <button
                                type="button"
                                onClick={() => onStartChatWithPaper && onStartChatWithPaper(item.doc_name)}
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isInspecting
                                    ? 'text-white hover:bg-blue-700'
                                    : 'text-zinc-400 hover:text-blue-400 hover:bg-zinc-800'
                                }`}
                                title="Chat with this paper"
                              >
                                <MessageSquare className="h-3 w-3" />
                              </button>

                              {/* Read PDF */}
                              <button
                                type="button"
                                onClick={() => onOpenPdfViewer && onOpenPdfViewer(item.doc_name, 1)}
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isInspecting
                                    ? 'text-white hover:bg-blue-700'
                                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                                }`}
                                title="Read PDF"
                              >
                                <FileText className="h-3 w-3" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteItem(item.id, e)}
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isInspecting
                                    ? 'text-white hover:bg-blue-700'
                                    : 'text-zinc-500 hover:text-red-400 hover:bg-zinc-800'
                                }`}
                                title="Delete from library"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Zotero Sub-Row (Attached PDF child item) */}
                        {isExpanded && (
                          <tr className="bg-zinc-900/60 border-b border-zinc-850/60 text-xs">
                            <td colSpan={2}></td>
                            <td className="text-center">
                              <FileText className="h-3.5 w-3.5 mx-auto text-red-400" />
                            </td>
                            <td colSpan={6} className="py-1 px-2">
                              <div className="flex items-center justify-between text-[11.5px]">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-zinc-300">Full Text PDF:</span>
                                  <span className="text-zinc-400 font-mono text-[11px]">{item.doc_name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onOpenPdfViewer && onOpenPdfViewer(item.doc_name, 1)}
                                    className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10.5px] font-medium transition-colors"
                                  >
                                    Read PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onStartChatWithPaper && onStartChatWithPaper(item.doc_name)}
                                    className="px-2 py-0.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded text-[10.5px] font-medium transition-colors"
                                  >
                                    Chat
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PANE 3: ZOTERO 7-STYLE METADATA INSPECTOR (Right Pane) */}
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

      {/* ========================================================================= */}
      {/* MODAL: ADD BY DOI OR ARXIV IDENTIFIER */}
      {/* ========================================================================= */}
      {isAddIdentifierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2 text-zinc-100 font-semibold text-xs">
                <Wand2 className="h-4 w-4 text-amber-400" />
                <span>Add Item by Academic Identifier</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddIdentifierOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-200 rounded cursor-pointer transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="text-[11.5px] text-zinc-400 leading-relaxed">
              Enter any DOI (e.g. <code className="bg-zinc-950 px-1 py-0.2 rounded text-blue-400 font-mono text-[10.5px]">10.1145/3292500.3330964</code>) or arXiv ID (e.g. <code className="bg-zinc-950 px-1 py-0.2 rounded text-rose-400 font-mono text-[10.5px]">2305.18290</code>) to import full bibliographic metadata into your library.
            </p>

            <form onSubmit={handleAddIdentifierSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  autoFocus
                  value={identifierInput}
                  onChange={(e) => setIdentifierInput(e.target.value)}
                  placeholder="Paste DOI (10.xxxx/...) or arXiv ID (2305.18290)..."
                  className="w-full bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {addError && (
                <div className="text-[11px] bg-red-500/10 border border-red-500/30 text-red-400 px-2 py-1 rounded flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddIdentifierOpen(false)}
                  className="px-2.5 py-1 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingIdentifier || !identifierInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-medium shadow transition-colors cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 ${isAddingIdentifier ? 'animate-spin' : ''}`} />
                  <span>{isAddingIdentifier ? 'Resolving...' : 'Lookup & Add'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
