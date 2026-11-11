import React, { useState, useEffect } from 'react';
import {
  FileText,
  Sparkles,
  Quote,
  StickyNote,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
  MessageSquare,
  Save,
  Tag,
  Calendar,
  User,
  Building,
  Hash,
  X,
  Search,
  RefreshCw,
  AlertCircle,
  Zap,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Wand2,
  Download,
} from 'lucide-react';
import {
  updateLibraryItemAPI,
  getItemCitationsAPI,
  autoEnrichDocumentAPI,
  lookupAcademicIdentifierAPI,
  downloadItemPdfAPI,
} from '../../services/api';

export default function LibraryInspector({
  document,
  onClose,
  onUpdateDocument,
  onOpenPdf,
  onChatWithPaper,
}) {
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'abstract' | 'cite' | 'notes' | 'ai_summary'
  
  // Editable form state
  const [formData, setFormData] = useState({
    title: '',
    authors: '',
    year: '',
    venue: '',
    doi: '',
    arxiv_id: '',
    url: '',
    item_type: 'journal_article',
    notes: '',
    tags: [],
  });

  const [citations, setCitations] = useState(null);
  const [loadingCitations, setLoadingCitations] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState(null);
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(true);
  const [isAttachmentsExpanded, setIsAttachmentsExpanded] = useState(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [downloadPdfError, setDownloadPdfError] = useState(null);
  const [downloadPdfSuccess, setDownloadPdfSuccess] = useState(null);

  // Sync state when selected document changes
  useEffect(() => {
    if (document) {
      setFormData({
        title: document.title || '',
        authors: document.authors || '',
        year: document.year || '',
        venue: document.venue || '',
        doi: document.doi || '',
        arxiv_id: document.arxiv_id || '',
        url: document.url || '',
        item_type: document.item_type || 'journal_article',
        notes: document.notes || '',
        tags: Array.isArray(document.tags) ? document.tags : [],
      });

      // Fetch citation styles
      setLoadingCitations(true);
      getItemCitationsAPI(document.id)
        .then((data) => setCitations(data))
        .catch((err) => console.error('Failed to load citations:', err))
        .finally(() => setLoadingCitations(false));
    }
  }, [document]);

  if (!document) return null;

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveMetadata = async () => {
    setIsSaving(true);
    try {
      const updated = await updateLibraryItemAPI(document.id, formData);
      if (onUpdateDocument) {
        onUpdateDocument(updated);
      }
    } catch (err) {
      console.error('Failed to save metadata:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoEnrich = async () => {
    setIsEnriching(true);
    setEnrichMessage(null);
    try {
      const enriched = await autoEnrichDocumentAPI(document.id);
      if (enriched) {
        setFormData({
          title: enriched.title || '',
          authors: enriched.authors || '',
          year: enriched.year || '',
          venue: enriched.venue || '',
          doi: enriched.doi || '',
          arxiv_id: enriched.arxiv_id || '',
          url: enriched.url || '',
          item_type: enriched.item_type || 'journal_article',
          notes: enriched.notes || '',
          tags: Array.isArray(enriched.tags) ? enriched.tags : [],
        });
        if (onUpdateDocument) {
          onUpdateDocument(enriched);
        }
        getItemCitationsAPI(document.id)
          .then((c) => setCitations(c))
          .catch((e) => console.error(e));
        setEnrichMessage({ type: 'success', text: 'Verified and enriched via CrossRef/arXiv!' });
        setTimeout(() => setEnrichMessage(null), 4000);
      }
    } catch (err) {
      console.error('Auto-enrichment error:', err);
      setEnrichMessage({
        type: 'error',
        text: err.response?.data?.detail || 'No DOI or arXiv ID could be resolved.',
      });
      setTimeout(() => setEnrichMessage(null), 4000);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleLookupIdentifier = async (identifier) => {
    if (!identifier || !identifier.trim()) return;
    setIsEnriching(true);
    setEnrichMessage(null);
    try {
      const res = await lookupAcademicIdentifierAPI(identifier.trim());
      if (res?.success && res.metadata) {
        const m = res.metadata;
        const nextData = {
          ...formData,
          title: m.title || formData.title,
          authors: m.authors || formData.authors,
          year: m.year || formData.year,
          venue: m.venue || formData.venue,
          doi: m.doi || formData.doi,
          arxiv_id: m.arxiv_id || formData.arxiv_id,
          url: m.url || formData.url,
          item_type: m.item_type || formData.item_type,
          tags: Array.from(new Set([...formData.tags, ...(m.tags || [])])),
        };
        setFormData(nextData);
        const updated = await updateLibraryItemAPI(document.id, nextData);
        if (onUpdateDocument) onUpdateDocument(updated);
        getItemCitationsAPI(document.id)
          .then((c) => setCitations(c))
          .catch((e) => console.error(e));
        setEnrichMessage({ type: 'success', text: `Resolved from ${res.source?.toUpperCase() || 'Academic API'}!` });
        setTimeout(() => setEnrichMessage(null), 4000);
      } else {
        setEnrichMessage({ type: 'error', text: res?.message || 'Could not find metadata.' });
        setTimeout(() => setEnrichMessage(null), 4000);
      }
    } catch (err) {
      setEnrichMessage({ type: 'error', text: err.response?.data?.detail || 'Lookup failed.' });
      setTimeout(() => setEnrichMessage(null), 4000);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const cleanTag = newTagInput.trim().startsWith('#') ? newTagInput.trim() : `#${newTagInput.trim()}`;
      if (!formData.tags.includes(cleanTag)) {
        const nextTags = [...formData.tags, cleanTag];
        handleInputChange('tags', nextTags);
        updateLibraryItemAPI(document.id, { tags: nextTags })
          .then((updated) => onUpdateDocument && onUpdateDocument(updated))
          .catch((err) => console.error('Failed to save tag:', err));
      }
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    const nextTags = formData.tags.filter((t) => t !== tagToRemove);
    handleInputChange('tags', nextTags);
    updateLibraryItemAPI(document.id, { tags: nextTags })
      .then((updated) => onUpdateDocument && onUpdateDocument(updated))
      .catch((err) => console.error('Failed to remove tag:', err));
  };

  const handleCopyCitation = (format, text) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleDownloadOaPdf = async () => {
    setIsDownloadingPdf(true);
    setDownloadPdfError(null);
    setDownloadPdfSuccess(null);
    try {
      const res = await downloadItemPdfAPI(document.id);
      if (res.success && res.item) {
        setDownloadPdfSuccess(res.message || 'Full-text PDF downloaded and attached.');
        if (onUpdateDocument) {
          onUpdateDocument(res.item);
        }
      } else {
        setDownloadPdfError(res.message || 'No open-access full-text PDF found (may be paywalled).');
      }
    } catch (err) {
      setDownloadPdfError(err.response?.data?.detail || 'Failed to download open-access PDF.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800 text-zinc-200 w-96 shadow-xl relative select-text z-20 font-sans">
      {/* ========================================================================= */}
      {/* TOP HEADER: TITLE & CLOSE (Zotero 7 Style) */}
      {/* ========================================================================= */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/95 flex items-start justify-between gap-2">
        <h2 className="font-semibold text-xs text-zinc-100 leading-snug line-clamp-3 select-text">
          {formData.title || document.doc_name}
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          title="Close Inspector (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* QUICK ACTIONS BAR: READ PDF / GET OA PDF | CHAT | AUTO-ENRICH */}
      {/* ========================================================================= */}
      <div className="px-3 py-1.5 bg-zinc-950/70 border-b border-zinc-800 flex items-center gap-1.5 select-none">
        {document.has_pdf ? (
          <button
            type="button"
            onClick={() => onOpenPdf && onOpenPdf(document.doc_name, 1)}
            className="flex-1 flex items-center justify-center gap-1 py-1 px-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700/60 rounded text-[11px] font-medium transition-colors cursor-pointer"
            title="Open PDF in integrated viewer"
          >
            <FileText className="h-3 w-3 text-red-400" />
            <span>Read PDF</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDownloadOaPdf}
            disabled={isDownloadingPdf}
            className="flex-1 flex items-center justify-center gap-1 py-1 px-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Download Open-Access Full-Text PDF from arXiv or Unpaywall"
          >
            <Download className={`h-3 w-3 text-emerald-400 ${isDownloadingPdf ? 'animate-bounce' : ''}`} />
            <span>{isDownloadingPdf ? 'Downloading...' : 'Get OA PDF'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onChatWithPaper && onChatWithPaper(document.doc_name)}
          className="flex-1 flex items-center justify-center gap-1 py-1 px-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700/60 rounded text-[11px] font-medium transition-colors cursor-pointer"
          title="Chat with paper in AI assistant"
        >
          <MessageSquare className="h-3 w-3 text-blue-400" />
          <span>Chat</span>
        </button>

        <button
          type="button"
          onClick={handleAutoEnrich}
          disabled={isEnriching}
          className="flex items-center justify-center gap-1 py-1 px-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded text-[11px] font-medium transition-colors cursor-pointer"
          title="Auto-enrich metadata via CrossRef / arXiv"
        >
          <Wand2 className={`h-3 w-3 text-blue-400 ${isEnriching ? 'animate-spin' : ''}`} />
          <span>{isEnriching ? '...' : 'Enrich'}</span>
        </button>
      </div>

      {/* Auto-enrich status message toast */}
      {enrichMessage && (
        <div
          className={`mx-3 my-1 px-2 py-1 rounded text-[10.5px] font-medium flex items-center gap-1.5 ${
            enrichMessage.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/15 text-red-400 border border-red-500/30'
          }`}
        >
          {enrichMessage.type === 'success' ? <Check className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
          <span>{enrichMessage.text}</span>
        </div>
      )}

      {/* Download PDF status message toast */}
      {downloadPdfSuccess && (
        <div className="mx-3 my-1 px-2 py-1 rounded text-[10.5px] font-medium flex items-center justify-between bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <div className="flex items-center gap-1.5">
            <Check className="h-3 w-3 shrink-0" />
            <span>{downloadPdfSuccess}</span>
          </div>
          <button type="button" onClick={() => setDownloadPdfSuccess(null)} className="text-zinc-400 hover:text-zinc-200">
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
      {downloadPdfError && (
        <div className="mx-3 my-1 px-2 py-1 rounded text-[10.5px] font-medium flex items-center justify-between bg-red-500/15 text-red-400 border border-red-500/30">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{downloadPdfError}</span>
          </div>
          <button type="button" onClick={() => setDownloadPdfError(null)} className="text-zinc-400 hover:text-zinc-200">
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TABS SWITCHER (Zotero Info / Abstract / Cite / Notes / Summary) */}
      {/* ========================================================================= */}
      <div className="flex border-b border-zinc-800 bg-zinc-950/40 text-[11px] font-medium text-zinc-400 select-none">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-1.5 text-center border-b-2 transition-colors cursor-pointer ${
            activeTab === 'info'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/60 font-semibold'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          Info
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('abstract')}
          className={`flex-1 py-1.5 text-center border-b-2 transition-colors cursor-pointer ${
            activeTab === 'abstract'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/60 font-semibold'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          Abstract
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cite')}
          className={`flex-1 py-1.5 text-center border-b-2 transition-colors cursor-pointer ${
            activeTab === 'cite'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/60 font-semibold'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          Cite
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-1.5 text-center border-b-2 transition-colors cursor-pointer ${
            activeTab === 'notes'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/60 font-semibold'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          Notes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ai_summary')}
          className={`flex-1 py-1.5 text-center border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ai_summary'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/60 font-semibold'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          TL;DR
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB CONTENT CONTAINER */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        {/* ======================================================================= */}
        {/* TAB 1: ZOTERO TWO-COLUMN KEY-VALUE INFO FORM */}
        {/* ======================================================================= */}
        {activeTab === 'info' && (
          <div className="space-y-2 text-[11.5px]">
            {/* Item Type */}
            <div className="flex items-center gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px]">
                Item Type
              </span>
              <select
                value={formData.item_type}
                onChange={(e) => handleInputChange('item_type', e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="journal_article">Journal Article</option>
                <option value="conference_paper">Conference Paper</option>
                <option value="preprint">Preprint (arXiv)</option>
                <option value="book_chapter">Book Section / Chapter</option>
                <option value="thesis">Thesis / Dissertation</option>
                <option value="report">Report</option>
              </select>
            </div>

            {/* Title */}
            <div className="flex items-start gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px] pt-1">
                Title
              </span>
              <textarea
                rows={2}
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Full paper title..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 resize-none leading-snug"
              />
            </div>

            {/* Author */}
            <div className="flex items-start gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px] pt-1">
                Author
              </span>
              <textarea
                rows={2}
                value={formData.authors}
                onChange={(e) => handleInputChange('authors', e.target.value)}
                placeholder="Last, First and Last, First"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 resize-none leading-snug"
              />
            </div>

            {/* Publication / Venue */}
            <div className="flex items-center gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px]">
                Publication
              </span>
              <input
                type="text"
                value={formData.venue}
                onChange={(e) => handleInputChange('venue', e.target.value)}
                placeholder="NeurIPS, ICML, Nature..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 truncate"
              />
            </div>

            {/* Date / Year */}
            <div className="flex items-center gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px]">
                Date
              </span>
              <input
                type="text"
                value={formData.year}
                onChange={(e) => handleInputChange('year', e.target.value)}
                placeholder="YYYY (e.g. 2024)"
                className="w-28 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {/* DOI */}
            <div className="flex items-center gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px]">
                DOI
              </span>
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={formData.doi}
                  onChange={(e) => handleInputChange('doi', e.target.value)}
                  placeholder="10.xxxx/..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                />
                {formData.doi && (
                  <a
                    href={`https://doi.org/${formData.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-zinc-400 hover:text-blue-400 cursor-pointer"
                    title={`Open https://doi.org/${formData.doi}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* arXiv ID */}
            <div className="flex items-center gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px]">
                arXiv ID
              </span>
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={formData.arxiv_id}
                  onChange={(e) => handleInputChange('arxiv_id', e.target.value)}
                  placeholder="2305.18290"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                />
                {formData.arxiv_id && (
                  <a
                    href={`https://arxiv.org/abs/${formData.arxiv_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-zinc-400 hover:text-rose-400 cursor-pointer"
                    title={`Open https://arxiv.org/abs/${formData.arxiv_id}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* URL */}
            <div className="flex items-center gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px]">
                URL
              </span>
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={formData.url}
                  onChange={(e) => handleInputChange('url', e.target.value)}
                  placeholder="https://..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 truncate"
                />
                {formData.url && (
                  <a
                    href={formData.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-zinc-400 hover:text-blue-400 cursor-pointer"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Date Added */}
            <div className="flex items-center gap-2">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px]">
                Date Added
              </span>
              <span className="text-zinc-400 font-mono text-[11px] px-1">
                {document.created_at ? new Date(document.created_at).toLocaleDateString() : '—'}
              </span>
            </div>

            {/* Workspaces */}
            <div className="flex items-start gap-2 pt-1 border-t border-zinc-850">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px] pt-0.5">
                Workspaces
              </span>
              <div className="flex-1 flex flex-wrap gap-1">
                {document.workspaces && document.workspaces.length > 0 ? (
                  document.workspaces.map((ws) => (
                    <span
                      key={ws.id}
                      className="inline-flex items-center gap-1 text-[10.5px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700/60"
                    >
                      <Building className="h-2.5 w-2.5 text-zinc-500" />
                      <span>{ws.name}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-zinc-500 italic text-[11px]">Unfiled</span>
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="flex items-start gap-2 pt-1 border-t border-zinc-850">
              <span className="w-20 text-right text-zinc-400 font-medium select-none shrink-0 text-[11px] pt-1">
                Tags
              </span>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap gap-1">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-[10.5px] bg-zinc-800 text-zinc-200 border border-zinc-700/80 px-1.5 py-0.2 rounded"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="text-zinc-400 hover:text-zinc-100 cursor-pointer text-xs leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Add #tag and press Enter..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-zinc-200 placeholder-zinc-500 text-[11px] focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSaveMetadata}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-1.5 py-1 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700/60 rounded text-xs font-medium transition-colors cursor-pointer shadow-sm"
              >
                <Save className="h-3.5 w-3.5 text-blue-400" />
                <span>{isSaving ? 'Saving...' : 'Save Metadata Changes'}</span>
              </button>
            </div>

            {/* Collapsible Attachment Box (Look at Image 1 Zotero!) */}
            <div className="mt-3 pt-2 border-t border-zinc-850">
              <button
                type="button"
                onClick={() => setIsAttachmentsExpanded(!isAttachmentsExpanded)}
                className="w-full flex items-center justify-between text-zinc-400 hover:text-zinc-200 font-medium text-[11px] select-none py-1 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Paperclip className="h-3 w-3 text-zinc-400" />
                  <span>{document.has_pdf ? '1 Attachment' : '0 Attachments'}</span>
                </div>
                {isAttachmentsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>

              {isAttachmentsExpanded && (
                document.has_pdf ? (
                  <div className="mt-1 p-2 bg-zinc-950/80 border border-zinc-800 rounded flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="h-4 w-4 text-red-400 shrink-0" />
                      <div className="truncate">
                        <p className="text-[11.5px] font-medium text-zinc-200 truncate">
                          Full Text PDF
                        </p>
                        <p className="text-[10px] text-zinc-500 font-mono truncate">
                          {document.doc_name}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenPdf && onOpenPdf(document.doc_name, 1)}
                      className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 rounded text-[10.5px] font-medium transition-colors shrink-0"
                    >
                      View
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 p-2.5 bg-zinc-950/60 border border-dashed border-zinc-800 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">No PDF attached</span>
                      {(document.doi || document.arxiv_id) && (
                        <span className="text-[10px] text-blue-400 font-mono">
                          {document.arxiv_id ? 'arXiv' : 'Unpaywall'} OA
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadOaPdf}
                      disabled={isDownloadingPdf}
                      className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Download className={`h-3 w-3 text-blue-400 ${isDownloadingPdf ? 'animate-bounce' : ''}`} />
                      <span>{isDownloadingPdf ? 'Downloading OA Full-Text...' : 'Download Open-Access PDF'}</span>
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* TAB 2: ABSTRACT */}
        {/* ======================================================================= */}
        {activeTab === 'abstract' && (
          <div className="space-y-2 text-[11.5px]">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Paper Abstract
            </span>
            {document.summary_cache ? (
              <div className="bg-zinc-950/80 border border-zinc-800 rounded p-2.5 text-zinc-300 leading-relaxed whitespace-pre-line text-[11.5px]">
                {document.summary_cache}
              </div>
            ) : (
              <div className="bg-zinc-950/40 border border-dashed border-zinc-800 rounded p-4 text-center text-zinc-500">
                <FileText className="h-5 w-5 text-zinc-600 mx-auto mb-1 stroke-[1.5]" />
                <p>No abstract indexed yet.</p>
                <button
                  type="button"
                  onClick={handleAutoEnrich}
                  className="mt-2 text-[10.5px] text-blue-400 hover:underline"
                >
                  Lookup via CrossRef / arXiv
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================================= */}
        {/* TAB 3: CITE (APA, IEEE, BibTeX) */}
        {/* ======================================================================= */}
        {activeTab === 'cite' && (
          <div className="space-y-3 text-[11.5px]">
            <p className="text-zinc-400 text-[11px]">
              One-click citation formats for publications and Overleaf:
            </p>

            {loadingCitations ? (
              <div className="text-center py-6 text-zinc-500 text-xs">Loading citation styles...</div>
            ) : citations ? (
              <div className="space-y-2.5">
                {/* APA 7th */}
                <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-blue-400 text-[10.5px]">APA 7th</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCitation('apa', citations.apa)}
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      {copiedFormat === 'apa' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedFormat === 'apa' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-zinc-300 text-[11px] leading-relaxed font-mono bg-zinc-900/60 p-1.5 rounded">
                    {citations.apa}
                  </p>
                </div>

                {/* IEEE */}
                <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-blue-400 text-[10.5px]">IEEE</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCitation('ieee', citations.ieee)}
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      {copiedFormat === 'ieee' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedFormat === 'ieee' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-zinc-300 text-[11px] leading-relaxed font-mono bg-zinc-900/60 p-1.5 rounded">
                    {citations.ieee}
                  </p>
                </div>

                {/* BibTeX */}
                <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-blue-400 text-[10.5px]">BibTeX (Overleaf)</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCitation('bibtex', citations.bibtex)}
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      {copiedFormat === 'bibtex' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedFormat === 'bibtex' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-zinc-300 text-[10px] font-mono bg-zinc-900/60 p-1.5 rounded overflow-x-auto whitespace-pre">
                    {citations.bibtex}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ======================================================================= */}
        {/* TAB 4: NOTES */}
        {/* ======================================================================= */}
        {activeTab === 'notes' && (
          <div className="space-y-2 text-[11.5px]">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Research Notes
            </span>
            <textarea
              rows={8}
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Record your observations, takeaways, and methodology notes for this paper..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-blue-500 text-xs resize-none leading-relaxed"
            />
            <button
              type="button"
              onClick={handleSaveMetadata}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-1.5 py-1 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700/60 rounded text-xs font-medium transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 text-blue-400" />
              <span>{isSaving ? 'Saving...' : 'Save Notes'}</span>
            </button>
          </div>
        )}

        {/* ======================================================================= */}
        {/* TAB 5: AI SUMMARY (TL;DR) */}
        {/* ======================================================================= */}
        {activeTab === 'ai_summary' && (
          <div className="space-y-2 text-[11.5px]">
            <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Instant AI Executive Summary</span>
            </div>

            {document.summary_cache ? (
              <div className="bg-zinc-950/80 border border-zinc-800 rounded p-2.5 leading-relaxed text-zinc-300 whitespace-pre-line text-[11.5px]">
                {document.summary_cache}
              </div>
            ) : (
              <div className="bg-zinc-950/40 border border-dashed border-zinc-800 rounded p-4 text-center text-zinc-500">
                <Sparkles className="h-5 w-5 text-zinc-600 mx-auto mb-1 animate-pulse" />
                <p>Summary is being synthesized in the background...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
