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
} from 'lucide-react';
import { updateLibraryItemAPI, getItemCitationsAPI } from '../../services/api';

export default function LibraryInspector({
  document,
  onClose,
  onUpdateDocument,
  onOpenPdf,
  onChatWithPaper,
}) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'ai_summary' | 'citations' | 'notes'
  
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

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const cleanTag = newTagInput.trim().startsWith('#') ? newTagInput.trim() : `#${newTagInput.trim()}`;
      if (!formData.tags.includes(cleanTag)) {
        const nextTags = [...formData.tags, cleanTag];
        handleInputChange('tags', nextTags);
        // Automatically save tags
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

  return (
    <div className="h-full flex flex-col bg-zinc-900/95 border-l border-zinc-800 text-zinc-200 w-96 shadow-2xl relative select-text z-20">
      {/* Top Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-amber-500 shrink-0" />
          <h3 className="font-semibold text-sm truncate text-zinc-100">
            {document.title || document.doc_name}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Close Inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Action Bar (Chat / PDF Viewer) */}
      <div className="px-4 py-2 bg-zinc-950/60 border-b border-zinc-800/80 flex items-center gap-2">
        <button
          onClick={() => onChatWithPaper && onChatWithPaper(document.doc_name)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md text-xs font-medium transition-colors cursor-pointer"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Chat with Paper</span>
        </button>
        <button
          onClick={() => onOpenPdf && onOpenPdf(document.doc_name, 1)}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 rounded-md text-xs font-medium transition-colors cursor-pointer"
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Read PDF</span>
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-zinc-800 bg-zinc-950/40 text-xs font-medium text-zinc-400">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'details'
              ? 'border-amber-500 text-amber-400 bg-zinc-900/40'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Details</span>
        </button>
        <button
          onClick={() => setActiveTab('ai_summary')}
          className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ai_summary'
              ? 'border-amber-500 text-amber-400 bg-zinc-900/40'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Summary</span>
        </button>
        <button
          onClick={() => setActiveTab('citations')}
          className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'citations'
              ? 'border-amber-500 text-amber-400 bg-zinc-900/40'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          <Quote className="h-3.5 w-3.5" />
          <span>Cite</span>
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'notes'
              ? 'border-amber-500 text-amber-400 bg-zinc-900/40'
              : 'border-transparent hover:text-zinc-200'
          }`}
        >
          <StickyNote className="h-3.5 w-3.5" />
          <span>Notes</span>
        </button>
      </div>

      {/* Tab Content Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* TAB 1: DETAILS */}
        {activeTab === 'details' && (
          <div className="space-y-3.5">
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Item Type
              </label>
              <select
                value={formData.item_type}
                onChange={(e) => handleInputChange('item_type', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/70"
              >
                <option value="journal_article">Journal Article</option>
                <option value="conference_paper">Conference Paper</option>
                <option value="preprint">Preprint (arXiv)</option>
                <option value="book_chapter">Book Chapter</option>
                <option value="thesis">Thesis / Dissertation</option>
                <option value="report">Technical Report</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Title
              </label>
              <textarea
                rows={2}
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-zinc-200 focus:outline-none focus:border-amber-500/70 resize-none"
                placeholder="Full paper title..."
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Authors (separated by 'and' or commas)
              </label>
              <input
                type="text"
                value={formData.authors}
                onChange={(e) => handleInputChange('authors', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/70"
                placeholder="Vaswani, Ashish and Shazeer, Noam"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  Year
                </label>
                <input
                  type="text"
                  value={formData.year}
                  onChange={(e) => handleInputChange('year', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/70"
                  placeholder="2024"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  Venue / Journal
                </label>
                <input
                  type="text"
                  value={formData.venue}
                  onChange={(e) => handleInputChange('venue', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/70"
                  placeholder="NeurIPS, ICML, Nature"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  DOI
                </label>
                <input
                  type="text"
                  value={formData.doi}
                  onChange={(e) => handleInputChange('doi', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/70"
                  placeholder="10.1145/..."
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  arXiv ID
                </label>
                <input
                  type="text"
                  value={formData.arxiv_id}
                  onChange={(e) => handleInputChange('arxiv_id', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/70"
                  placeholder="2305.18290"
                />
              </div>
            </div>

            {/* Tags Section */}
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[11px]"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-amber-200 cursor-pointer"
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
                placeholder="Type #tag and press Enter..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/70 text-xs"
              />
            </div>

            {/* Linked Workspaces */}
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Linked Workspaces
              </label>
              <div className="space-y-1">
                {document.workspaces && document.workspaces.length > 0 ? (
                  document.workspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className="flex items-center gap-1.5 text-zinc-300 bg-zinc-950/60 px-2.5 py-1 rounded border border-zinc-800/60"
                    >
                      <Building className="h-3 w-3 text-zinc-500" />
                      <span>{ws.name}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-500 italic">Not assigned to any workspace yet.</p>
                )}
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveMetadata}
              disabled={isSaving}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-md shadow transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Metadata Changes'}</span>
            </button>
          </div>
        )}

        {/* TAB 2: AI SUMMARY */}
        {activeTab === 'ai_summary' && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-amber-400 font-medium text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Instant AI Executive Summary</span>
            </div>

            {document.summary_cache ? (
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3 leading-relaxed text-zinc-300 font-normal whitespace-pre-line text-[11.5px]">
                {document.summary_cache}
              </div>
            ) : (
              <div className="bg-zinc-950/50 border border-dashed border-zinc-800 rounded-lg p-6 text-center text-zinc-500">
                <Sparkles className="h-6 w-6 text-zinc-600 mx-auto mb-2 animate-pulse" />
                <p>Summary is being synthesized in the background...</p>
                <p className="text-[10px] mt-1 text-zinc-600">Will automatically appear once indexed.</p>
              </div>
            )}

            {document.summary_generated_at && (
              <p className="text-[10px] text-zinc-500">
                Generated: {new Date(document.summary_generated_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* TAB 3: CITATIONS */}
        {activeTab === 'citations' && (
          <div className="space-y-4">
            <p className="text-zinc-400 text-[11px]">
              One-click copy formatted citation into your paper or Overleaf bibliography:
            </p>

            {loadingCitations ? (
              <div className="text-center py-8 text-zinc-500">Loading citation formats...</div>
            ) : citations ? (
              <div className="space-y-3">
                {/* APA */}
                <div className="bg-zinc-950 border border-zinc-800/90 rounded-md p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-amber-400 text-[11px]">APA 7th</span>
                    <button
                      onClick={() => handleCopyCitation('apa', citations.apa)}
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      {copiedFormat === 'apa' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedFormat === 'apa' ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-zinc-300 text-[11px] leading-relaxed font-mono bg-zinc-900/50 p-1.5 rounded">
                    {citations.apa}
                  </p>
                </div>

                {/* IEEE */}
                <div className="bg-zinc-950 border border-zinc-800/90 rounded-md p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-amber-400 text-[11px]">IEEE</span>
                    <button
                      onClick={() => handleCopyCitation('ieee', citations.ieee)}
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      {copiedFormat === 'ieee' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedFormat === 'ieee' ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-zinc-300 text-[11px] leading-relaxed font-mono bg-zinc-900/50 p-1.5 rounded">
                    {citations.ieee}
                  </p>
                </div>

                {/* BibTeX */}
                <div className="bg-zinc-950 border border-zinc-800/90 rounded-md p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-amber-400 text-[11px]">BibTeX (Overleaf)</span>
                    <button
                      onClick={() => handleCopyCitation('bibtex', citations.bibtex)}
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      {copiedFormat === 'bibtex' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedFormat === 'bibtex' ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-zinc-300 text-[10px] font-mono bg-zinc-900/60 p-2 rounded overflow-x-auto">
                    {citations.bibtex}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 4: NOTES */}
        {activeTab === 'notes' && (
          <div className="space-y-3">
            <p className="text-zinc-400 text-[11px]">
              Personal notes and observations attached to this paper:
            </p>
            <textarea
              rows={8}
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="e.g. In Section 3.2, their baseline evaluation uses BLEU-4 on CNN/DailyMail. Need to replicate this for FYP Chapter 4..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2.5 text-zinc-200 focus:outline-none focus:border-amber-500/70 text-xs resize-none"
            />
            <button
              onClick={handleSaveMetadata}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md font-medium text-xs transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Notes</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
