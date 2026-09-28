import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Library,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  FileText,
  Folder,
  FolderOpen,
  ArrowLeft,
  Upload,
  Loader2,
  ExternalLink,
  LayoutGrid,
  List,
  Sparkles,
  MessageSquare,
  PenTool,
  AlertCircle,
  MoreVertical,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  addPapersToWorkspace,
  removePaperFromWorkspace,
  renameWorkspace,
  getWorkspacePapers,
} from '../../services/api';

/**
 * Format relative timestamps to match ChatGPT Library view (e.g., 'Modified 1w ago')
 */
const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Recently';
  try {
    const now = new Date();
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Modified ${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `Modified ${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `Modified ${diffDay}d ago`;
    const diffWeek = Math.floor(diffDay / 7);
    if (diffWeek < 5) return `Modified ${diffWeek}w ago`;
    const diffMonth = Math.floor(diffDay / 30);
    return `Modified ${diffMonth}mo ago`;
  } catch {
    return 'Recently';
  }
};

export default function WorkspaceLibraryModal({
  isOpen,
  onClose,
  workspaces = [],
  activeWorkspaceId,
  onSelectWorkspace,
  onDeleteWorkspace,
  onOpenCreateModal,
  onRefreshWorkspaces,
  onOpenPdfViewer,
  onToggleWriter,
}) {
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);

  // View state: 'list' or 'grid'
  const [viewMode, setViewMode] = useState('list');
  // Tab filter: 'suggested', 'favorites', 'folders', 'all'
  const [activeTab, setActiveTab] = useState('all');
  // Search query
  const [searchQuery, setSearchQuery] = useState('');
  
  // Drill-down selected workspace (null = all workspaces view)
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [workspacePapers, setWorkspacePapers] = useState([]);
  const [isLoadingPapers, setIsLoadingPapers] = useState(false);

  // Uploading state inside drill-down
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Inline renaming state
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');

  // Dropdown menu state per workspace item
  const [openMenuId, setOpenMenuId] = useState(null);

  // Reset drilldown and filters on modal open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setOpenMenuId(null);
      setRenamingId(null);
      setUploadError(null);
    } else {
      setSelectedWorkspace(null);
    }
  }, [isOpen]);

  // Keep selectedWorkspace synced if workspaces prop updates
  useEffect(() => {
    if (selectedWorkspace) {
      const refreshed = workspaces.find((w) => w.id === selectedWorkspace.id);
      if (refreshed) {
        setSelectedWorkspace(refreshed);
      }
    }
  }, [workspaces]);

  // Load detailed papers when drill-down opens
  const loadPapers = async (wsId) => {
    setIsLoadingPapers(true);
    try {
      const res = await getWorkspacePapers(wsId);
      if (res && Array.isArray(res.papers)) {
        setWorkspacePapers(res.papers);
      } else {
        // Fallback to basic doc_names from workspace object
        const ws = workspaces.find((w) => w.id === wsId);
        const docs = ws?.documents || [];
        setWorkspacePapers(
          docs.map((doc) => ({
            doc_name: doc,
            title: doc.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
            authors: null,
            year: null,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load workspace papers:', err);
      const ws = workspaces.find((w) => w.id === wsId);
      const docs = ws?.documents || [];
      setWorkspacePapers(
        docs.map((doc) => ({
          doc_name: doc,
          title: doc.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
        }))
      );
    } finally {
      setIsLoadingPapers(false);
    }
  };

  const handleOpenDrilldown = (ws) => {
    setSelectedWorkspace(ws);
    loadPapers(ws.id);
  };

  const handleBackToAll = () => {
    setSelectedWorkspace(null);
    setWorkspacePapers([]);
    setUploadError(null);
  };

  // Keyboard shortcut: Escape closes modal or backs out
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedWorkspace) {
          handleBackToAll();
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, selectedWorkspace]);

  // Strictly filter to workspaces containing documents (exclude plain chat history!)
  const validWorkspaces = useMemo(() => {
    return (workspaces || []).filter(
      (ws) => Array.isArray(ws.documents) && ws.documents.length > 0
    );
  }, [workspaces]);

  // Filtered workspaces list
  const filteredWorkspaces = useMemo(() => {
    return validWorkspaces.filter((ws) => {
      const docs = ws.documents || [];
      // Tab filter
      if (activeTab === 'favorites' && ws.id !== activeWorkspaceId) return false;
      if (activeTab === 'folders' && docs.length < 2) return false;

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = (ws.name || '').toLowerCase().includes(q);
      const matchDoc = docs.some((d) => d.toLowerCase().includes(q));
      return matchName || matchDoc;
    });
  }, [validWorkspaces, activeTab, searchQuery, activeWorkspaceId]);


  // Handle uploading additional papers to current drill-down workspace
  const handleFileUpload = async (e) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedWorkspace) return;

    const files = Array.from(e.target.files).filter((f) =>
      f.name.toLowerCase().endsWith('.pdf')
    );

    if (files.length === 0) {
      setUploadError('Only PDF research documents are supported.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      await addPapersToWorkspace(selectedWorkspace.id, files);
      if (onRefreshWorkspaces) {
        await onRefreshWorkspaces();
      }
      await loadPapers(selectedWorkspace.id);
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Failed to add papers to workspace.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle deleting a paper from current drill-down workspace
  const handleRemovePaper = async (docName) => {
    if (!selectedWorkspace) return;
    if (!window.confirm(`Remove "${docName}" from this workspace?`)) return;

    try {
      await removePaperFromWorkspace(selectedWorkspace.id, docName);
      if (onRefreshWorkspaces) {
        await onRefreshWorkspaces();
      }
      setWorkspacePapers((prev) => prev.filter((p) => p.doc_name !== docName));
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to remove paper.');
    }
  };

  // Handle renaming workspace
  const handleStartRename = (ws) => {
    setRenamingId(ws.id);
    setRenameText(ws.name || '');
    setOpenMenuId(null);
  };

  const handleSaveRename = async (wsId) => {
    if (!renameText.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await renameWorkspace(wsId, renameText.trim());
      if (onRefreshWorkspaces) {
        await onRefreshWorkspaces();
      }
      if (selectedWorkspace && selectedWorkspace.id === wsId) {
        setSelectedWorkspace((prev) => ({ ...prev, name: renameText.trim() }));
      }
    } catch (err) {
      console.error('Failed to rename workspace:', err);
    } finally {
      setRenamingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        ref={modalRef}
        onClick={() => setOpenMenuId(null)}
        className="w-full max-w-5xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] h-[780px] text-zinc-100 font-sans"
      >
        {/* =================================================================== */}
        {/* 1. TOP HEADER & NAVIGATION BAR (Matches Reference Design)           */}
        {/* =================================================================== */}
        <div className="p-5 border-b border-zinc-800 flex flex-col gap-4 bg-zinc-900/95 shrink-0">
          <div className="flex items-center justify-between">
            {/* Left Title / Breadcrumb */}
            <div className="flex items-center gap-3">
              {selectedWorkspace ? (
                <button
                  type="button"
                  onClick={handleBackToAll}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>All Workspaces</span>
                </button>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center text-zinc-400 bg-transparent">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-100 tracking-tight">Workspaces</h2>
                  </div>
                </div>
              )}

              {selectedWorkspace && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">/</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100 text-sm">{selectedWorkspace.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-800/60 border border-zinc-700/60 text-zinc-300">
                      {(selectedWorkspace.documents || []).length} papers
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Action Controls: Search, View Switcher, New Workspace, Close */}
            <div className="flex items-center gap-2.5">
              {/* Search Bar (Only shown in main view or filter mode) */}
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder={selectedWorkspace ? 'Filter papers...' : 'Search workspaces...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-zinc-600 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {!selectedWorkspace && (
                <>
                  {/* Grid vs List View Toggle (Completely transparent without colored backgrounds) */}
                  <div className="flex items-center bg-transparent border border-zinc-800 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded-md transition-colors cursor-pointer bg-transparent ${
                        viewMode === 'grid'
                          ? 'text-zinc-100 font-medium'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                      title="Grid View"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 rounded-md transition-colors cursor-pointer bg-transparent ${
                        viewMode === 'list'
                          ? 'text-zinc-100 font-medium'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                      title="List View"
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                  </div>


                  {/* "+ New" Action Button */}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenCreateModal) onOpenCreateModal();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-semibold text-xs transition-colors cursor-pointer shadow-sm active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>New</span>
                  </button>
                </>
              )}

              {/* Close Modal Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer ml-1"
                aria-label="Close"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Filter Pills Bar (Only shown in Top-Level Workspaces View) */}
          {!selectedWorkspace && (
            <div className="flex items-center gap-1.5 border-t border-zinc-800/60 pt-3">
              {[
                { id: 'all', label: 'All Workspaces' },
                { id: 'favorites', label: 'Active Workspace' },
                { id: 'folders', label: 'Multi-Paper Workspaces' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* 2. BODY CONTENT (Workspaces List/Grid OR Workspace Papers Drilldown) */}
        {/* =================================================================== */}
        <div className="flex-1 overflow-y-auto p-5">
          {!selectedWorkspace ? (
            /* --------------------------------------------------------------- */
            /* VIEW A: ALL WORKSPACES (Reference Design: Name & Last Activity)  */
            /* --------------------------------------------------------------- */
            <div>
              {filteredWorkspaces.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center text-zinc-500">
                  <div className="h-12 w-12 rounded-2xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-400">
                    <Folder className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">No workspaces found</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mb-4">
                    {searchQuery
                      ? `No workspaces or papers match "${searchQuery}".`
                      : 'Create your first research workspace to index and ground your papers.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenCreateModal) onOpenCreateModal();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs shadow-md transition-all cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create Workspace</span>
                  </button>
                </div>
              ) : viewMode === 'list' ? (
                /* List View (Exact Match to ChatGPT Library Image) */
                <div className="space-y-1">
                  {/* Table Column Subheading */}
                  <div className="grid grid-cols-12 px-3 py-2 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider select-none border-b border-zinc-800/50">
                    <span className="col-span-7 sm:col-span-8">Name</span>
                    <span className="col-span-3 sm:col-span-3 text-right">Last activity</span>
                    <span className="col-span-2 sm:col-span-1 text-right">Actions</span>
                  </div>

                  {filteredWorkspaces.map((ws) => {
                    const isActive = ws.id === activeWorkspaceId;
                    const docCount = (ws.documents || []).length;
                    const isRenaming = renamingId === ws.id;

                    return (
                      <div
                        key={ws.id}
                        onClick={() => handleOpenDrilldown(ws)}
                        className={`group grid grid-cols-12 items-center px-3 py-2.5 rounded-xl transition-all cursor-pointer select-none border ${
                          isActive
                            ? 'bg-transparent border-zinc-700/60 hover:bg-zinc-800/30'
                            : 'bg-transparent hover:bg-zinc-800/30 border-transparent hover:border-zinc-800/50'
                        }`}
                      >
                        {/* Name Column */}
                        <div className="col-span-7 sm:col-span-8 flex items-center gap-3 min-w-0 pr-3">
                          {/* Workspace Thumbnail/Icon - Completely Transparent */}
                          <div className="h-8 w-8 flex items-center justify-center shrink-0 text-zinc-400 bg-transparent group-hover:text-zinc-200 transition-colors">
                            <FolderOpen className="h-5 w-5" />
                          </div>

                          {/* Workspace Details */}
                          <div className="flex flex-col min-w-0 flex-1">
                            {isRenaming ? (
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  value={renameText}
                                  onChange={(e) => setRenameText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(ws.id);
                                    if (e.key === 'Escape') setRenamingId(null);
                                  }}
                                  className="bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-100 focus:outline-none w-48"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(ws.id)}
                                  className="p-1 rounded hover:bg-zinc-700 text-emerald-400"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenamingId(null)}
                                  className="p-1 rounded hover:bg-zinc-700 text-zinc-400"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold text-xs sm:text-[13px] text-zinc-200 group-hover:text-zinc-100 truncate">
                                  {ws.name}
                                </span>
                                {isActive && (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-mono bg-transparent border border-emerald-500/40 text-emerald-400 font-medium">
                                    active
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Subtitle / Document Previews */}
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 truncate">
                              <span className="font-mono text-zinc-400 shrink-0">
                                {docCount} {docCount === 1 ? 'paper' : 'papers'}
                              </span>
                              {docCount > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="truncate text-zinc-500">
                                    {(ws.documents || []).slice(0, 2).join(', ')}
                                    {docCount > 2 ? ` +${docCount - 2} more` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Last Activity Column (Matches Screenshot Format) */}
                        <div className="col-span-3 sm:col-span-3 text-right">
                          <span className="text-xs text-zinc-400 font-sans">
                            {formatRelativeTime(ws.createdAt)}
                          </span>
                        </div>

                        {/* Actions Column */}
                        <div
                          className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectWorkspace(ws.id);
                              onClose();
                            }}
                            title="Open in Chat"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === ws.id ? null : ws.id);
                              }}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            {openMenuId === ws.id && (
                              <div className="absolute right-0 top-full mt-1 w-44 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-30 p-1 space-y-0.5 select-none">
                                <button
                                  type="button"
                                  onClick={() => handleOpenDrilldown(ws)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors text-left"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  <span>View Papers</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartRename(ws)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors text-left"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  <span>Rename</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Delete workspace "${ws.name}"?`)) {
                                      onDeleteWorkspace(ws.id);
                                    }
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/15 transition-colors text-left"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>Delete Workspace</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Grid / Cards View */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {filteredWorkspaces.map((ws) => {
                    const isActive = ws.id === activeWorkspaceId;
                    const docCount = (ws.documents || []).length;

                    return (
                      <div
                        key={ws.id}
                        onClick={() => handleOpenDrilldown(ws)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                          isActive
                            ? 'bg-transparent border-zinc-700 shadow-sm'
                            : 'bg-transparent hover:bg-zinc-800/30 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="h-8 w-8 flex items-center justify-center text-zinc-400 bg-transparent group-hover:text-zinc-200 transition-colors">
                              <FolderOpen className="h-5 w-5" />
                            </div>
                            <span className="text-[11px] font-mono text-zinc-500">
                              {formatRelativeTime(ws.createdAt)}
                            </span>
                          </div>

                          <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-zinc-200 transition-colors line-clamp-1 mb-1">
                            {ws.name}
                          </h3>

                          <p className="text-xs text-zinc-500 mb-3 font-mono">
                            {docCount} {docCount === 1 ? 'research paper' : 'research papers'}
                          </p>

                          {docCount > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {(ws.documents || []).slice(0, 3).map((d, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] font-mono bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-700/60 text-zinc-300 truncate max-w-[140px]"
                                  title={d}
                                >
                                  {d}
                                </span>
                              ))}
                              {docCount > 3 && (
                                <span className="text-[10px] font-mono text-zinc-500 px-1 py-0.5">
                                  +{docCount - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div
                          className="pt-3 border-t border-zinc-800/60 flex items-center justify-between mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectWorkspace(ws.id);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100 font-medium transition-colors cursor-pointer"
                          >
                            <MessageSquare className="h-3 w-3" />
                            <span>Chat</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenDrilldown(ws)}
                            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                          >
                            Manage papers →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* --------------------------------------------------------------- */
            /* VIEW B: WORKSPACE PAPERS DRILL-DOWN (View, Add, Delete Papers)  */
            /* --------------------------------------------------------------- */
            <div className="space-y-5">
              {/* Workspace Action Banner */}
              <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
                <div>
                  <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                    <span>{selectedWorkspace.name}</span>
                    <button
                      type="button"
                      onClick={() => handleStartRename(selectedWorkspace)}
                      className="text-zinc-500 hover:text-zinc-200 transition-colors"
                      title="Rename Workspace"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Manage research papers and groundings indexed for this workspace.
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {/* Hidden File Input for uploading to this workspace */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-transparent hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs shadow-xs transition-colors cursor-pointer active:scale-95"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-current" />
                    ) : (
                      <Upload className="h-4 w-4 stroke-[2.2] text-current" />
                    )}
                    <span>{isUploading ? 'Indexing...' : 'Add Papers'}</span>
                  </button>
                </div>
              </div>

              {/* Upload Error Banner */}
              {uploadError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Papers List Table */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Indexed Research Documents ({workspacePapers.length})
                  </h4>
                  <span className="text-[11px] text-zinc-500">
                    Click 'View PDF' to inspect side-by-side
                  </span>
                </div>

                {isLoadingPapers ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-400 gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                    <p className="text-xs">Loading papers and metadata...</p>
                  </div>
                ) : workspacePapers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500 bg-zinc-950/40 border border-dashed border-zinc-800 rounded-2xl p-6">
                    <FileText className="h-8 w-8 text-zinc-600 mb-2" />
                    <h5 className="text-sm font-semibold text-zinc-300 mb-0.5">No papers in this workspace yet</h5>
                    <p className="text-xs text-zinc-500 max-w-sm mb-4">
                      Upload PDF papers to enable page-level citation mapping and source-locked synthesis.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-transparent hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-zinc-100 font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                    >
                      <Upload className="h-4 w-4 stroke-[2.2] text-current" />
                      <span>Upload Papers</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workspacePapers.map((paper, idx) => {
                      const displayTitle = paper.title || paper.doc_name;
                      const normTitle = (displayTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                      const normDoc = (paper.doc_name || '').replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
                      const normAuthor = (paper.authors || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                      const isDuplicateAuthor =
                        !normAuthor ||
                        normAuthor === normTitle ||
                        normAuthor === normDoc ||
                        normTitle.includes(normAuthor) ||
                        normAuthor.includes(normTitle) ||
                        normDoc.includes(normAuthor) ||
                        normAuthor.includes(normDoc);

                      const cleanAuthor = isDuplicateAuthor ? null : paper.authors;

                      return (
                        <div
                          key={paper.doc_name || idx}
                          className="p-3 bg-transparent hover:bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700/80 rounded-xl transition-all flex items-center justify-between gap-3 group"
                        >
                          {/* Paper Details */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="h-8 w-8 flex items-center justify-center text-zinc-400 bg-transparent shrink-0">
                              <FileText className="h-5 w-5" />
                            </div>

                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className="font-semibold text-xs sm:text-[13px] text-zinc-100 truncate"
                                  title={displayTitle}
                                >
                                  {displayTitle}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 truncate">
                                <span className="font-mono text-zinc-400 truncate max-w-[220px]" title={paper.doc_name}>
                                  {paper.doc_name}
                                </span>
                                {cleanAuthor && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate text-zinc-400 max-w-[220px]">{cleanAuthor}</span>
                                  </>
                                )}
                                {paper.year && (
                                  <>
                                    <span>·</span>
                                    <span className="font-mono text-zinc-400">({paper.year})</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                        {/* Paper Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {onOpenPdfViewer && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenPdfViewer(paper.doc_name, 1);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                              title="Inspect in side-by-side PDF Viewer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">View PDF</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemovePaper(paper.doc_name)}
                            title="Remove paper from workspace"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* 3. MODAL FOOTER                                                     */}
        {/* =================================================================== */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/70 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>
              {validWorkspaces.length} total {validWorkspaces.length === 1 ? 'workspace' : 'workspaces'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-zinc-600 font-mono">ScholarsMate Workspace Engine</span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
