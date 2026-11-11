import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  FileUp,
  Check,
  GitMerge,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import {
  getLibraryAPI,
  deleteLibraryItemAPI,
  exportLibraryBibtexAPI,
  uploadFile,
  autoEnrichDocumentAPI,
  addLibraryReferenceAPI,
  importLibraryFileAPI,
  downloadItemPdfAPI,
  createManualLibraryItemAPI,
  getLibraryDuplicatesAPI,
} from '../../services/api';
import LibraryInspector from './LibraryInspector';
import DuplicateMerger from './DuplicateMerger';

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

  // Add by Identifier Modal State (FR-17.3 & FR-17.4)
  const [isAddIdentifierOpen, setIsAddIdentifierOpen] = useState(false);
  const [identifierInput, setIdentifierInput] = useState('');
  const [autoDownloadPdfCheckbox, setAutoDownloadPdfCheckbox] = useState(true);
  const [isAddingIdentifier, setIsAddingIdentifier] = useState(false);
  const [addError, setAddError] = useState(null);
  const [enrichingDocIds, setEnrichingDocIds] = useState(new Set());
  const [downloadingPdfDocIds, setDownloadingPdfDocIds] = useState(new Set());

  // Duplicate Detection & Merger State (FR-17.6)
  const [duplicateData, setDuplicateData] = useState({ groups: [], total_groups: 0, total_duplicate_items: 0 });
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);
  const [selectedDuplicateGroup, setSelectedDuplicateGroup] = useState(null);

  // New Item Menu & Manual Form State (FR-17.5)
  const pdfUploadInputRef = useRef(null);
  const newItemMenuRef = useRef(null);
  const [isNewItemMenuOpen, setIsNewItemMenuOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isCreatingManualItem, setIsCreatingManualItem] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [manualForm, setManualForm] = useState({
    item_type: 'book',
    title: '',
    authors: '',
    year: '',
    venue: '',
    doi: '',
    url: '',
    notes: '',
  });

  // Close New Item dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (newItemMenuRef.current && !newItemMenuRef.current.contains(e.target)) {
        setIsNewItemMenuOpen(false);
      }
    };
    if (isNewItemMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isNewItemMenuOpen]);

  const handleOpenManualModal = (type = 'book') => {
    setManualForm({
      item_type: type,
      title: '',
      authors: '',
      year: new Date().getFullYear().toString(),
      venue: '',
      doi: '',
      url: '',
      notes: '',
    });
    setManualError(null);
    setIsNewItemMenuOpen(false);
    setIsManualModalOpen(true);
  };

  const handleCreateManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualForm.title.trim()) return;
    setIsCreatingManualItem(true);
    setManualError(null);
    try {
      const targetWorkspace =
        activeWorkspaceFilter && activeWorkspaceFilter !== '__unfiled__' ? activeWorkspaceFilter : null;
      const createdItem = await createManualLibraryItemAPI({
        ...manualForm,
        workspace_id: targetWorkspace,
      });
      setIsManualModalOpen(false);
      await fetchLibrary();
      setSelectedDoc(createdItem);
      setImportNotification({
        type: 'success',
        message: `Created new ${manualForm.item_type.replace('_', ' ')}: "${createdItem.title || 'Untitled'}"`,
      });
    } catch (err) {
      setManualError(err.response?.data?.detail || 'Failed to create manual library item.');
    } finally {
      setIsCreatingManualItem(false);
    }
  };

  // BibTeX / RIS Bulk Import State (FR-17.1)
  const bibFileInputRef = useRef(null);
  const [isImportingBib, setIsImportingBib] = useState(false);
  const [importNotification, setImportNotification] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Auto-dismiss notification after 4.5 seconds
  useEffect(() => {
    if (!importNotification) return;
    const timer = setTimeout(() => {
      setImportNotification(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [importNotification]);

  const handleBibImportFile = async (file) => {
    if (!file) return;
    setIsImportingBib(true);
    setImportNotification(null);
    try {
      const targetWorkspace =
        activeWorkspaceFilter && activeWorkspaceFilter !== '__unfiled__' ? activeWorkspaceFilter : null;
      const res = await importLibraryFileAPI(file, targetWorkspace);
      setImportNotification({
        type: 'success',
        message: `Imported ${res.imported_count} reference${res.imported_count === 1 ? '' : 's'}${
          res.skipped_count > 0 ? ` (${res.skipped_count} skipped duplicates)` : ''
        }`,
      });
      await fetchLibrary();
    } catch (err) {
      console.error('Failed to import bibliographic file:', err);
      setImportNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to parse or import bibliographic file.',
      });
    } finally {
      setIsImportingBib(false);
    }
  };

  const handleBibFileInputChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleBibImportFile(file);
    }
    e.target.value = '';
  };

  // Drag and Drop support for bulk import & files
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;

    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      if (
        lowerName.endsWith('.bib') ||
        lowerName.endsWith('.bibtex') ||
        lowerName.endsWith('.ris') ||
        lowerName.endsWith('.txt')
      ) {
        await handleBibImportFile(file);
      } else if (lowerName.endsWith('.pdf')) {
        setIsUploading(true);
        try {
          await uploadFile(file);
          await fetchLibrary();
        } catch (err) {
          console.error('Failed to upload dropped PDF:', err);
        } finally {
          setIsUploading(false);
        }
      }
    }
  };

  // Escape key returns to chat or closes inspector/modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isNewItemMenuOpen) {
          setIsNewItemMenuOpen(false);
        } else if (isManualModalOpen) {
          setIsManualModalOpen(false);
        } else if (isAddIdentifierOpen) {
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
  }, [selectedDoc, isAddIdentifierOpen, isManualModalOpen, isNewItemMenuOpen, onClose]);

  // Fetch Duplicates (FR-17.6)
  const fetchDuplicates = async () => {
    setIsLoadingDuplicates(true);
    try {
      const res = await getLibraryDuplicatesAPI();
      setDuplicateData(res || { groups: [], total_groups: 0, total_duplicate_items: 0 });
      if (res?.groups && res.groups.length > 0) {
        setSelectedDuplicateGroup((prev) => {
          if (!prev) return res.groups[0];
          const stillExists = res.groups.find((g) => g.group_id === prev.group_id);
          return stillExists || res.groups[0];
        });
      } else {
        setSelectedDuplicateGroup(null);
      }
    } catch (err) {
      console.error('Failed to load duplicates:', err);
    } finally {
      setIsLoadingDuplicates(false);
    }
  };

  // Handle successful merge completion
  const handleMergeComplete = async (mergedItem, deletedIds) => {
    setImportNotification({
      type: 'success',
      message: `Successfully merged duplicate records into master item "${mergedItem?.title || mergedItem?.doc_name || ''}".`,
    });
    await fetchDuplicates();
    await fetchLibrary();
  };

  // Fetch Library Items
  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const data = await getLibraryAPI({
        tag: activeTag,
        workspace_id: activeWorkspaceFilter === '__duplicates__' ? null : activeWorkspaceFilter,
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
    if (activeWorkspaceFilter === '__duplicates__') {
      fetchDuplicates();
    } else {
      fetchLibrary();
      fetchDuplicates();
    }
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

  // Manual Open-Access PDF Download Trigger (FR-17.4)
  const handleDownloadPdf = async (docId, e) => {
    e?.stopPropagation();
    setDownloadingPdfDocIds((prev) => new Set(prev).add(docId));
    try {
      const res = await downloadItemPdfAPI(docId);
      if (res.success && res.item) {
        setItems((prev) => prev.map((item) => (item.id === docId ? res.item : item)));
        if (selectedDoc && selectedDoc.id === docId) setSelectedDoc(res.item);
        setImportNotification({
          type: 'success',
          message: res.message || 'Full-text PDF downloaded and attached successfully.',
        });
      } else {
        setImportNotification({
          type: 'error',
          message: res.message || 'Could not find an open-access PDF for this reference.',
        });
      }
    } catch (err) {
      console.error('Failed to download OA PDF:', err);
      setImportNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to download open-access PDF.',
      });
    } finally {
      setDownloadingPdfDocIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  // Add paper reference directly by DOI or arXiv ID (FR-17.3 & FR-17.4)
  const handleAddIdentifierSubmit = async (e) => {
    e.preventDefault();
    if (!identifierInput.trim()) return;
    setIsAddingIdentifier(true);
    setAddError(null);
    try {
      const newDoc = await addLibraryReferenceAPI(identifierInput.trim(), autoDownloadPdfCheckbox);
      setIsAddIdentifierOpen(false);
      setIdentifierInput('');
      await fetchLibrary();
      setSelectedDoc(newDoc);
      setImportNotification({
        type: 'success',
        message: newDoc.has_pdf
          ? `Added reference & downloaded OA full-text PDF: "${newDoc.title || newDoc.doc_name}"`
          : `Added reference metadata: "${newDoc.title || newDoc.doc_name}"`,
      });
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
            {/* New Item Dropdown (Zotero Style - FR-17.5) */}
            <div className="relative" ref={newItemMenuRef}>
              <button
                type="button"
                onClick={() => setIsNewItemMenuOpen(!isNewItemMenuOpen)}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 rounded text-[11.5px] font-medium transition-colors cursor-pointer select-none"
                title="Create New Item or Upload Document"
              >
                <Plus className="h-3.5 w-3.5 text-blue-400" />
                <span>New Item</span>
                <ChevronDown className="h-2.5 w-2.5 text-zinc-400" />
              </button>

              {/* New Item Dropdown Menu */}
              {isNewItemMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-750 rounded-md shadow-2xl py-1 z-50 text-[11.5px] select-none backdrop-blur-sm">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                    New Blank Item
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenManualModal('book')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors text-left cursor-pointer"
                  >
                    <Book className="h-3.5 w-3.5 text-purple-400" />
                    <span>Book</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenManualModal('journal_article')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors text-left cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5 text-blue-400" />
                    <span>Journal Article</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenManualModal('conference_paper')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors text-left cursor-pointer"
                  >
                    <Layers className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Conference Paper</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenManualModal('preprint')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors text-left cursor-pointer"
                  >
                    <FileCode className="h-3.5 w-3.5 text-rose-400" />
                    <span>Preprint / Working Paper</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenManualModal('book_chapter')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors text-left cursor-pointer"
                  >
                    <Book className="h-3.5 w-3.5 text-amber-400" />
                    <span>Book Section / Chapter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenManualModal('thesis')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors text-left cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Thesis / Dissertation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenManualModal('report')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors text-left cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Report</span>
                  </button>

                  <div className="my-1 border-t border-zinc-800" />

                  {/* Upload PDF */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewItemMenuOpen(false);
                      pdfUploadInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors text-left cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5 text-zinc-400" />
                    <span>{isUploading ? 'Indexing PDF...' : 'Store Copy of File (PDF)...'}</span>
                  </button>
                </div>
              )}
            </div>

            <input
              ref={pdfUploadInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="hidden"
            />

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

            {/* Import BibTeX / RIS (FR-17.1) */}
            <button
              type="button"
              onClick={() => bibFileInputRef.current?.click()}
              disabled={isImportingBib}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 rounded text-[11.5px] font-medium transition-colors cursor-pointer disabled:opacity-50"
              title="Bulk import references from BibTeX (.bib) or RIS (.ris) file"
            >
              <FileUp className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden md:inline">{isImportingBib ? 'Importing...' : 'Import (.bib / .ris)'}</span>
            </button>
            <input
              ref={bibFileInputRef}
              type="file"
              accept=".bib,.bibtex,.ris,.txt"
              onChange={handleBibFileInputChange}
              disabled={isImportingBib}
              className="hidden"
            />

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

              {/* Duplicate Items (FR-17.6) */}
              <button
                type="button"
                onClick={() => {
                  setActiveWorkspaceFilter('__duplicates__');
                  setActiveTag(null);
                  setSelectedDoc(null);
                  if (duplicateData.groups && duplicateData.groups.length > 0) {
                    setSelectedDuplicateGroup(duplicateData.groups[0]);
                  }
                }}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11.5px] transition-colors cursor-pointer ${
                  activeWorkspaceFilter === '__duplicates__'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                }`}
                title="Scan and merge duplicate bibliographic entries"
              >
                <Copy className={`h-3.5 w-3.5 shrink-0 ${activeWorkspaceFilter === '__duplicates__' ? 'text-white' : 'text-zinc-400'}`} />
                <span className="truncate flex-1 text-left">Duplicate Items</span>
                {duplicateData.total_groups > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-semibold ${
                      activeWorkspaceFilter === '__duplicates__'
                        ? 'bg-blue-800 text-white'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {duplicateData.total_groups}
                  </span>
                )}
              </button>

              {/* Unfiled Items */}
              <button
                type="button"
                onClick={() => {
                  // Filter items not in any workspace
                  setActiveWorkspaceFilter('__unfiled__');
                  setActiveTag(null);
                  setSelectedDoc(null);
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
        <div
          className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag & Drop Visual Indicator Overlay */}
          {isDraggingOver && (
            <div className="absolute inset-0 z-30 bg-blue-950/85 border-2 border-dashed border-blue-500/80 flex flex-col items-center justify-center pointer-events-none backdrop-blur-[2px]">
              <FileUp className="h-10 w-10 text-blue-400 mb-2 animate-bounce" />
              <p className="text-sm font-semibold text-white">Drop .bib, .ris, or .pdf files to import</p>
              <p className="text-xs text-blue-200 mt-1">Bibliographic metadata will be automatically parsed and added</p>
            </div>
          )}

          {/* Import Notification Banner / Toast */}
          {importNotification && (
            <div
              className={`px-3 py-1.5 border-b text-xs flex items-center justify-between shrink-0 select-none z-20 ${
                importNotification.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200'
                  : 'bg-rose-950/70 border-rose-800/80 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {importNotification.type === 'success' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                )}
                <span>{importNotification.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setImportNotification(null)}
                className="text-zinc-400 hover:text-zinc-200 p-0.5 rounded cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {activeWorkspaceFilter === '__duplicates__' ? (
              isLoadingDuplicates ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                  <p className="text-xs">Scanning library for duplicate items...</p>
                </div>
              ) : duplicateData.groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-72 text-zinc-500 space-y-2.5 p-6">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400">
                    <CheckCircle2 className="h-8 w-8 stroke-[1.7]" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-200">No Duplicate Items Found</p>
                  <p className="text-[11.5px] text-zinc-500 max-w-md text-center leading-relaxed">
                    There are currently no duplicate references in your library. When items with identical DOIs, arXiv IDs, titles, or file hashes are imported, they will be clustered here for merging.
                  </p>
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <Copy className="h-4 w-4 text-blue-400" />
                      <span className="text-xs font-semibold text-zinc-200">
                        {duplicateData.total_groups} Duplicate Set{duplicateData.total_groups === 1 ? '' : 's'} ({duplicateData.total_duplicate_items} Items Total)
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 hidden sm:inline">
                      Click any set below to open the Zotero Duplicate Merger in the right pane.
                    </span>
                  </div>

                  <div className="space-y-3">
                    {duplicateData.groups.map((group, gIdx) => {
                      const isGroupSelected = selectedDuplicateGroup?.group_id === group.group_id;
                      return (
                        <div
                          key={group.group_id}
                          onClick={() => {
                            setSelectedDuplicateGroup(group);
                            setSelectedDoc(null);
                          }}
                          className={`rounded-lg border transition-all cursor-pointer p-3 select-none ${
                            isGroupSelected
                              ? 'bg-blue-950/25 border-blue-500/80 shadow-md ring-1 ring-blue-500/20'
                              : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/90'
                          }`}
                        >
                          {/* Group Header */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 truncate">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 font-mono">
                                Set #{gIdx + 1}
                              </span>
                              <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5 truncate">
                                <GitMerge className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                <span className="truncate">{group.items[0]?.title || group.items[0]?.doc_name || 'Duplicate Entry'}</span>
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                                {group.match_reason}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-medium bg-blue-600/90 text-white">
                                {group.total_items} items
                              </span>
                            </div>
                          </div>

                          {/* Items preview list in this set */}
                          <div className="space-y-1.5 pl-3 border-l-2 border-zinc-800">
                            {group.items.map((item, iIdx) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-2 rounded bg-zinc-950/60 border border-zinc-850 text-xs text-zinc-300"
                              >
                                <div className="flex items-center gap-2 truncate flex-1 pr-3">
                                  <span className="text-[10px] font-mono text-zinc-500 font-bold shrink-0">
                                    v{iIdx + 1}
                                  </span>
                                  {getItemIcon(item, false)}
                                  <span className="font-medium text-zinc-200 truncate text-[12px]">
                                    {item.title || item.doc_name}
                                  </span>
                                  {item.authors && (
                                    <span className="text-zinc-400 text-[11px] truncate shrink-0 max-w-[220px]">
                                      — {item.authors}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-[10.5px]">
                                  {item.year && (
                                    <span className="font-mono text-zinc-400 bg-zinc-800 px-1 rounded">
                                      {item.year}
                                    </span>
                                  )}
                                  {item.has_pdf ? (
                                    <span className="text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.2 rounded flex items-center gap-1 font-medium text-[10px]">
                                      <FileText className="h-2.5 w-2.5" />
                                      PDF
                                    </span>
                                  ) : (
                                    <span className="text-zinc-500 bg-zinc-850 px-1.5 py-0.2 rounded text-[10px]">
                                      Metadata
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ) : loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                <p className="text-xs">Loading library items...</p>
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
                <FileText className="h-8 w-8 text-zinc-700 stroke-[1.5]" />
                <p className="text-xs font-medium text-zinc-400">No items found in this collection.</p>
                <p className="text-[11px] text-zinc-600 max-w-sm text-center">
                  Use "New Item" to import PDF papers, "Add by Identifier" for DOI / arXiv lookups, or drag-and-drop / "Import (.bib / .ris)" for bulk imports.
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
                          <td className="px-1 text-center" onClick={(e) => e.stopPropagation()}>
                            {item.has_pdf ? (
                              <FileText
                                className={`h-3.5 w-3.5 mx-auto ${
                                  isInspecting ? 'text-white' : 'text-red-400'
                                }`}
                                title={`Full Text PDF: ${item.doc_name}`}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleDownloadPdf(item.id, e)}
                                disabled={downloadingPdfDocIds.has(item.id)}
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isInspecting
                                    ? 'text-blue-200 hover:text-white'
                                    : 'text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800'
                                }`}
                                title="Download Open-Access Full-Text PDF (arXiv / Unpaywall)"
                              >
                                <Download
                                  className={`h-3 w-3 mx-auto ${
                                    downloadingPdfDocIds.has(item.id) ? 'animate-bounce text-blue-400' : ''
                                  }`}
                                />
                              </button>
                            )}
                          </td>

                          {/* Quick Row Actions */}
                          <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {/* Download OA PDF if missing */}
                              {!item.has_pdf && (
                                <button
                                  type="button"
                                  onClick={(e) => handleDownloadPdf(item.id, e)}
                                  disabled={downloadingPdfDocIds.has(item.id)}
                                  className={`p-0.5 rounded transition-colors cursor-pointer ${
                                    isInspecting
                                      ? 'text-white hover:bg-blue-700'
                                      : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800'
                                  }`}
                                  title="Download Open-Access PDF (arXiv / Unpaywall)"
                                >
                                  <Download className={`h-3 w-3 ${downloadingPdfDocIds.has(item.id) ? 'animate-bounce text-emerald-400' : ''}`} />
                                </button>
                              )}

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
                                onClick={(e) => {
                                  if (item.has_pdf) {
                                    if (onOpenPdfViewer) onOpenPdfViewer(item.doc_name, 1);
                                  } else {
                                    handleDownloadPdf(item.id, e);
                                  }
                                }}
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isInspecting
                                    ? 'text-white hover:bg-blue-700'
                                    : item.has_pdf
                                    ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                                    : 'text-zinc-600 hover:text-blue-400 hover:bg-zinc-800'
                                }`}
                                title={item.has_pdf ? "Read PDF" : "Download Full-Text PDF"}
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
                          <tr className="bg-zinc-900/60 border-b border-zinc-855/60 text-xs">
                            <td colSpan={2}></td>
                            <td className="text-center">
                              {item.has_pdf ? (
                                <FileText className="h-3.5 w-3.5 mx-auto text-red-400" />
                              ) : (
                                <Download className="h-3.5 w-3.5 mx-auto text-zinc-500" />
                              )}
                            </td>
                            <td colSpan={6} className="py-1.5 px-2">
                              {item.has_pdf ? (
                                <div className="flex items-center justify-between text-[11.5px]">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="font-medium text-zinc-300">Full Text PDF:</span>
                                    <span className="text-zinc-400 font-mono text-[11px] truncate">{item.doc_name}</span>
                                    {item.file_size_bytes > 0 && (
                                      <span className="text-[10px] text-zinc-500 font-mono">
                                        ({(item.file_size_bytes / (1024 * 1024)).toFixed(1)} MB)
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => onOpenPdfViewer && onOpenPdfViewer(item.doc_name, 1)}
                                      className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10.5px] font-medium transition-colors cursor-pointer"
                                    >
                                      Read PDF
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onStartChatWithPaper && onStartChatWithPaper(item.doc_name)}
                                      className="px-2 py-0.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded text-[10.5px] font-medium transition-colors cursor-pointer"
                                    >
                                      Chat
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between text-[11.5px]">
                                  <div className="flex items-center gap-2">
                                    <span className="text-zinc-400">No PDF attached to this reference yet.</span>
                                    {(item.doi || item.arxiv_id) && (
                                      <span className="text-[10.5px] text-blue-400 font-mono">
                                        (Open access via {item.arxiv_id ? 'arXiv' : 'Unpaywall'})
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => handleDownloadPdf(item.id, e)}
                                    disabled={downloadingPdfDocIds.has(item.id)}
                                    className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-600/85 hover:bg-blue-600 text-white rounded text-[10.5px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    <Download className={`h-3 w-3 ${downloadingPdfDocIds.has(item.id) ? 'animate-bounce' : ''}`} />
                                    <span>{downloadingPdfDocIds.has(item.id) ? 'Downloading OA PDF...' : 'Download Open-Access PDF'}</span>
                                  </button>
                                </div>
                              )}
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
        {/* PANE 3: ZOTERO 7-STYLE METADATA INSPECTOR / DUPLICATE MERGER (Right Pane) */}
        {/* ========================================================================= */}
        {activeWorkspaceFilter === '__duplicates__' && selectedDuplicateGroup ? (
          <DuplicateMerger
            group={selectedDuplicateGroup}
            onClose={() => setSelectedDuplicateGroup(null)}
            onMergeComplete={handleMergeComplete}
          />
        ) : selectedDoc ? (
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
        ) : null}
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

              {/* Auto-download Open-Access full-text PDF checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11.5px] text-zinc-300 hover:text-white pt-0.5">
                <input
                  type="checkbox"
                  checked={autoDownloadPdfCheckbox}
                  onChange={(e) => setAutoDownloadPdfCheckbox(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5"
                />
                <span>Auto-download Open-Access PDF if available (arXiv / Unpaywall)</span>
              </label>

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
                  <span>
                    {isAddingIdentifier
                      ? autoDownloadPdfCheckbox
                        ? 'Resolving & Downloading...'
                        : 'Resolving...'
                      : 'Lookup & Add'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NEW ITEM FROM SCRATCH (BLANK FORM - FR-17.5) */}
      {/* ========================================================================= */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-lg w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2 text-zinc-100 font-semibold text-xs">
                <Plus className="h-4 w-4 text-blue-400" />
                <span>New Item from Scratch (Blank Form)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-200 rounded cursor-pointer transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualSubmit} className="space-y-2.5 text-xs">
              {/* Item Type */}
              <div className="flex items-center gap-2">
                <label className="w-24 text-right text-zinc-400 font-medium select-none text-[11px]">
                  Item Type
                </label>
                <select
                  value={manualForm.item_type}
                  onChange={(e) => setManualForm({ ...manualForm, item_type: e.target.value })}
                  className="flex-1 bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="book">Book</option>
                  <option value="journal_article">Journal Article</option>
                  <option value="conference_paper">Conference Paper</option>
                  <option value="preprint">Preprint / Working Paper</option>
                  <option value="book_chapter">Book Section / Chapter</option>
                  <option value="thesis">Thesis / Dissertation</option>
                  <option value="report">Report</option>
                </select>
              </div>

              {/* Title */}
              <div className="flex items-start gap-2">
                <label className="w-24 text-right text-zinc-400 font-medium select-none text-[11px] pt-1.5">
                  Title *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={manualForm.title}
                  onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                  placeholder="e.g. Design Patterns: Elements of Reusable Object-Oriented Software"
                  className="flex-1 bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              {/* Authors */}
              <div className="flex items-center gap-2">
                <label className="w-24 text-right text-zinc-400 font-medium select-none text-[11px]">
                  Author(s)
                </label>
                <input
                  type="text"
                  value={manualForm.authors}
                  onChange={(e) => setManualForm({ ...manualForm, authors: e.target.value })}
                  placeholder="e.g. Gamma, Erich; Helm, Richard"
                  className="flex-1 bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              {/* Year & Venue Row */}
              <div className="flex items-center gap-2">
                <label className="w-24 text-right text-zinc-400 font-medium select-none text-[11px]">
                  Year & Venue
                </label>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={manualForm.year}
                    onChange={(e) => setManualForm({ ...manualForm, year: e.target.value })}
                    placeholder="Year (e.g. 1994)"
                    className="w-24 bg-zinc-950 border border-zinc-750 rounded px-2 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono text-xs"
                  />
                  <input
                    type="text"
                    value={manualForm.venue}
                    onChange={(e) => setManualForm({ ...manualForm, venue: e.target.value })}
                    placeholder="Publisher / Journal / Conference"
                    className="flex-1 bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-xs"
                  />
                </div>
              </div>

              {/* DOI or URL Row */}
              <div className="flex items-center gap-2">
                <label className="w-24 text-right text-zinc-400 font-medium select-none text-[11px]">
                  DOI / URL
                </label>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={manualForm.doi}
                    onChange={(e) => setManualForm({ ...manualForm, doi: e.target.value })}
                    placeholder="DOI (optional)"
                    className="flex-1 bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono text-xs"
                  />
                  <input
                    type="text"
                    value={manualForm.url}
                    onChange={(e) => setManualForm({ ...manualForm, url: e.target.value })}
                    placeholder="https://... (optional)"
                    className="flex-1 bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-xs"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="flex items-start gap-2">
                <label className="w-24 text-right text-zinc-400 font-medium select-none text-[11px] pt-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={manualForm.notes}
                  onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                  placeholder="Optional personal research notes..."
                  className="flex-1 bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none text-xs"
                />
              </div>

              {manualError && (
                <div className="text-[11px] bg-red-500/10 border border-red-500/30 text-red-400 px-2 py-1 rounded flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{manualError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-2.5 py-1 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingManualItem || !manualForm.title.trim()}
                  className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-medium shadow transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{isCreatingManualItem ? 'Creating...' : 'Create Item'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
