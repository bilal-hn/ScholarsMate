import React, { useState } from 'react';
import {
  GitMerge,
  X,
  FileText,
  Check,
  AlertCircle,
  Paperclip,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  Folder,
} from 'lucide-react';
import { mergeLibraryDuplicatesAPI } from '../../services/api';

/**
 * Zotero-Style Duplicate Merger Inspector (Pane 3).
 * Allows users to choose the master/canonical record, inspect field-by-field differences,
 * and merge duplicate entries into one unified record.
 */
export default function DuplicateMerger({
  group,
  onClose,
  onMergeComplete,
}) {
  if (!group || !group.items || group.items.length === 0) return null;

  // Default master to the first item (duplicate_detector pre-sorts by PDF presence / completeness)
  const [canonicalId, setCanonicalId] = useState(group.items[0]?.id);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState(null);

  const masterItem = group.items.find((i) => i.id === canonicalId) || group.items[0];
  const duplicateItems = group.items.filter((i) => i.id !== canonicalId);

  const handleMerge = async () => {
    if (!canonicalId || duplicateItems.length === 0) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      const duplicateIds = duplicateItems.map((d) => d.id);
      const res = await mergeLibraryDuplicatesAPI(canonicalId, duplicateIds);
      if (res.success) {
        if (onMergeComplete) {
          onMergeComplete(res.merged_item, duplicateIds);
        }
      } else {
        setMergeError(res.message || 'Failed to merge duplicate items.');
      }
    } catch (err) {
      console.error('Failed to merge duplicate items:', err);
      setMergeError(err.response?.data?.detail || 'Failed to merge duplicate records.');
    } finally {
      setIsMerging(false);
    }
  };

  // Helper to compare fields
  const fields = [
    { label: 'Item Type', key: 'item_type' },
    { label: 'Title', key: 'title' },
    { label: 'Authors', key: 'authors' },
    { label: 'Year', key: 'year' },
    { label: 'Venue / Journal', key: 'venue' },
    { label: 'DOI', key: 'doi' },
    { label: 'arXiv ID', key: 'arxiv_id' },
    { label: 'URL', key: 'url' },
  ];

  return (
    <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800 text-zinc-200 w-96 lg:w-[420px] shadow-2xl relative select-text z-20 font-sans">
      {/* ========================================================================= */}
      {/* HEADER: ZOTERO 7 MERGE INSPECTOR */}
      {/* ========================================================================= */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/95 flex items-start justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400">
            <GitMerge className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-xs text-zinc-100 flex items-center gap-1.5">
              <span>Merge {group.items.length} Duplicate Items</span>
            </h2>
            <p className="text-[10.5px] text-zinc-400 font-mono mt-0.5 truncate max-w-[280px]">
              {group.match_reason}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          title="Close Merger (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Info Notice */}
      <div className="px-3 py-2 bg-blue-950/20 border-b border-zinc-800 text-[11px] text-zinc-300 leading-snug">
        Select which record to retain as <span className="text-blue-300 font-semibold">Master</span>. Missing metadata fields, PDF attachments, workspaces, and chat histories from other versions will be automatically consolidated into it.
      </div>

      {/* Error Alert */}
      {mergeError && (
        <div className="mx-3 my-2 p-2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span className="flex-1">{mergeError}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* ========================================================================= */}
        {/* STEP 1: SELECT MASTER VERSION */}
        {/* ========================================================================= */}
        <div>
          <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider block mb-2">
            1. Select Master Version:
          </label>
          <div className="space-y-2">
            {group.items.map((item, idx) => {
              const isMaster = item.id === canonicalId;
              return (
                <div
                  key={item.id}
                  onClick={() => setCanonicalId(item.id)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer relative ${
                    isMaster
                      ? 'bg-blue-950/40 border-blue-500/80 ring-1 ring-blue-500/30'
                      : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                          isMaster
                            ? 'border-blue-400 bg-blue-500 text-white'
                            : 'border-zinc-600 bg-zinc-900'
                        }`}
                      >
                        {isMaster && <div className="h-1.5 w-1.5 bg-white rounded-full" />}
                      </div>
                      <span className="font-semibold text-xs text-zinc-100">
                        Version {idx + 1}
                      </span>
                    </div>

                    {isMaster ? (
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase bg-blue-600 text-white tracking-wide">
                        Master Record
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 italic">
                        Will be merged into master
                      </span>
                    )}
                  </div>

                  {/* Title & Filename */}
                  <p className="text-[11.5px] font-medium text-zinc-200 line-clamp-2 pl-6 mb-1.5">
                    {item.title || item.doc_name}
                  </p>

                  {/* Attributes Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pl-6 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                      {item.item_type || 'document'}
                    </span>
                    {item.year && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                        {item.year}
                      </span>
                    )}
                    {item.has_pdf ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 flex items-center gap-1 font-medium">
                        <FileText className="h-2.5 w-2.5" />
                        PDF Attached
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500">
                        Metadata only
                      </span>
                    )}
                    {item.workspaces?.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 flex items-center gap-1">
                        <Folder className="h-2.5 w-2.5" />
                        {item.workspaces.length} collection{item.workspaces.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STEP 2: FIELD-BY-FIELD COMPARISON */}
        {/* ========================================================================= */}
        <div>
          <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider block mb-2">
            2. Field-by-Field Comparison:
          </label>
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/40 text-[11px]">
            {fields.map(({ label, key }) => {
              const masterVal = masterItem[key];
              const otherVals = duplicateItems.map((d) => d[key]).filter(Boolean);
              const willBackfill = !masterVal && otherVals.length > 0;

              return (
                <div
                  key={key}
                  className="p-2 border-b border-zinc-850/60 last:border-b-0 space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-zinc-400">{label}</span>
                    {willBackfill && (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <Check className="h-2.5 w-2.5" />
                        Will inherit from duplicate
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {/* Master Column */}
                    <div
                      className={`p-1.5 rounded border ${
                        masterVal
                          ? 'bg-blue-950/20 border-blue-900/40 text-zinc-200'
                          : 'bg-zinc-900/30 border-zinc-800/40 text-zinc-600 italic'
                      }`}
                    >
                      <span className="text-[9.5px] uppercase font-mono block text-blue-400 mb-0.5 font-bold">
                        Master
                      </span>
                      <p className="line-clamp-2 truncate">{masterVal || '(blank)'}</p>
                    </div>

                    {/* Duplicate Column(s) */}
                    <div
                      className={`p-1.5 rounded border ${
                        otherVals.length > 0
                          ? willBackfill
                            ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200'
                            : 'bg-zinc-900/40 border-zinc-800 text-zinc-400'
                          : 'bg-zinc-900/30 border-zinc-800/40 text-zinc-600 italic'
                      }`}
                    >
                      <span className="text-[9.5px] uppercase font-mono block text-zinc-500 mb-0.5 font-bold">
                        Duplicate(s)
                      </span>
                      <p className="line-clamp-2 truncate">
                        {otherVals.join(' | ') || '(blank)'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Attachments & PDF Merge Row */}
            <div className="p-2 border-b border-zinc-850/60 space-y-1">
              <span className="font-semibold text-zinc-400 text-[10px] block">
                PDF Attachment & Files
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-1.5 rounded bg-zinc-900/40 border border-zinc-800">
                  <span className="text-[9.5px] uppercase font-mono block text-blue-400 mb-0.5 font-bold">
                    Master
                  </span>
                  <p className="text-zinc-300 truncate">
                    {masterItem.has_pdf ? masterItem.doc_name : '(no file attached)'}
                  </p>
                </div>
                <div className="p-1.5 rounded bg-zinc-900/40 border border-zinc-800">
                  <span className="text-[9.5px] uppercase font-mono block text-zinc-500 mb-0.5 font-bold">
                    Duplicates
                  </span>
                  <p className="text-zinc-300 truncate">
                    {duplicateItems.some((d) => d.has_pdf)
                      ? duplicateItems.find((d) => d.has_pdf)?.doc_name
                      : '(no files)'}
                  </p>
                </div>
              </div>
              {!masterItem.has_pdf && duplicateItems.some((d) => d.has_pdf) && (
                <p className="text-[10px] text-emerald-400 flex items-center gap-1 pt-1">
                  <Check className="h-3 w-3" />
                  The PDF attachment will be transferred to the master record.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FOOTER ACTIONS: MERGE BUTTON */}
      {/* ========================================================================= */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-900/95 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleMerge}
          disabled={isMerging}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded text-xs font-semibold shadow-lg shadow-blue-900/20 transition-all cursor-pointer disabled:opacity-50"
        >
          {isMerging ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Merging Records...</span>
            </>
          ) : (
            <>
              <GitMerge className="h-3.5 w-3.5" />
              <span>Merge {group.items.length} Items</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
