import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Download, 
  ExternalLink, 
  FileText, 
  RotateCw, 
  AlertCircle,
  Loader2,
  Maximize2
} from 'lucide-react';

// Configure PDF worker locally via Vite asset bundling (eliminates unpkg cross-origin worker errors)
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function PdfViewer({ activePdf, targetPage, onClose }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(targetPage || 1);
  const [scale, setScale] = useState(1.0);
  const [viewMode, setViewMode] = useState('interactive'); // 'interactive' | 'native'
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Sync page number when user clicks a new citation source
  useEffect(() => {
    if (targetPage) setPageNumber(targetPage);
  }, [targetPage]);

  // Reset states when activePdf changes
  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    setNumPages(null);
    setPageNumber(targetPage || 1);
  }, [activePdf, targetPage]);

  const pdfUrl = activePdf 
    ? `http://localhost:8000/api/documents/${encodeURIComponent(activePdf)}`
    : null;

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setLoadError(null);
  };

  const onDocumentLoadError = (err) => {
    console.error('Failed to load PDF in interactive mode:', err);
    setLoadError(err?.message || 'Failed to render PDF in canvas mode.');
    setIsLoading(false);
  };

  if (!activePdf) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 p-6 select-none border-l border-zinc-800">
        <FileText className="h-10 w-10 text-zinc-600 mb-2" />
        <p className="text-xs">No active document selected.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-l border-zinc-800 text-zinc-200 select-none">
      {/* Top Controls Bar */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 gap-2">
        {/* Document Filename Title */}
        <div className="flex items-center gap-2 min-w-0 max-w-[200px]">
          <FileText className="h-4 w-4 text-red-400 shrink-0" />
          <span className="font-mono text-xs text-amber-400 font-medium truncate" title={activePdf}>
            {activePdf}
          </span>
        </div>

        {/* View Mode & Page Navigation */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {/* Mode Switcher */}
          <div className="flex items-center bg-zinc-950 p-0.5 rounded border border-zinc-800 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('interactive')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                viewMode === 'interactive' 
                  ? 'bg-zinc-800 text-amber-400 font-medium' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Interactive Page Canvas"
            >
              Reader
            </button>
            <button
              type="button"
              onClick={() => setViewMode('native')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                viewMode === 'native' 
                  ? 'bg-zinc-800 text-amber-400 font-medium' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Browser Native PDF Viewer (Continuous Scroll)"
            >
              Native
            </button>
          </div>

          {viewMode === 'interactive' && (
            <>
              {/* Page Controls */}
              <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                <button
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber((prev) => Math.max(prev - 1, 1))}
                  className="hover:text-amber-400 disabled:opacity-30 transition-colors cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="tabular-nums">
                  {pageNumber} / {numPages || '--'}
                </span>
                <button
                  disabled={!numPages || pageNumber >= numPages}
                  onClick={() => setPageNumber((prev) => Math.min(prev + 1, numPages))}
                  className="hover:text-amber-400 disabled:opacity-30 transition-colors cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                <button 
                  onClick={() => setScale((s) => Math.max(s - 0.15, 0.5))} 
                  className="hover:text-amber-400 transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setScale(1.0)}
                  className="tabular-nums hover:text-amber-400 transition-colors cursor-pointer"
                  title="Reset Zoom to 100%"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button 
                  onClick={() => setScale((s) => Math.min(s + 0.15, 2.5))} 
                  className="hover:text-amber-400 transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3 w-3" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Action Icons (Open new tab, Download, Close) */}
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Open in new browser tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          <a
            href={pdfUrl}
            download={activePdf}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Download PDF file"
          >
            <Download className="h-4 w-4" />
          </a>

          <button 
            onClick={onClose} 
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer ml-1"
            title="Close Viewer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Document Render Container */}
      <div className="flex-1 overflow-auto bg-zinc-900/40 relative">
        {viewMode === 'native' ? (
          <iframe
            src={`${pdfUrl}#page=${pageNumber}`}
            className="w-full h-full border-none bg-zinc-950"
            title={activePdf}
          />
        ) : (
          <div className="min-h-full flex flex-col items-center justify-start p-4">
            {loadError ? (
              <div className="my-auto max-w-md p-6 bg-zinc-900 border border-zinc-800 rounded-lg text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-200">
                  Interactive Canvas Preview Unavailable
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {loadError}
                </p>
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode('native')}
                    className="w-full sm:w-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Open in Native Viewer</span>
                  </button>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open in New Tab</span>
                  </a>
                </div>
              </div>
            ) : (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="my-20 flex flex-col items-center justify-center gap-2 text-zinc-400 text-xs">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                    <span>Rendering PDF pages...</span>
                  </div>
                }
                error={
                  <div className="my-20 flex flex-col items-center justify-center gap-3 text-zinc-400 text-xs text-center p-6 bg-zinc-900 border border-zinc-800 rounded-lg max-w-sm">
                    <AlertCircle className="h-6 w-6 text-red-400" />
                    <span>Could not render document canvas.</span>
                    <button
                      type="button"
                      onClick={() => setViewMode('native')}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs cursor-pointer font-medium"
                    >
                      Switch to Native Browser Viewer
                    </button>
                  </div>
                }
                className="shadow-2xl rounded-lg overflow-hidden border border-zinc-800"
              >
                {numPages && (
                  <Page 
                    pageNumber={Math.min(Math.max(1, pageNumber), numPages)} 
                    scale={scale} 
                    renderTextLayer={true} 
                    renderAnnotationLayer={false} 
                  />
                )}
              </Document>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
