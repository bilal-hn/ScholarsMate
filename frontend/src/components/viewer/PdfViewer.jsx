import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

// Configure PDF worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewer({ activePdf, targetPage, onClose }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(targetPage || 1);
  const [scale, setScale] = useState(1.0);

  // Sync page number when user clicks a new citation source
  React.useEffect(() => {
    if (targetPage) setPageNumber(targetPage);
  }, [targetPage]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-l border-zinc-800 text-zinc-200">
      {/* Top Controls Bar */}
      <div className="h-14 px-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <span className="font-mono text-xs text-amber-400 font-medium truncate max-w-[180px]">
          {activePdf}
        </span>

        {/* Page & Zoom Navigation */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
            <button
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((prev) => Math.max(prev - 1, 1))}
              className="hover:text-amber-400 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              {pageNumber} / {numPages || '--'}
            </span>
            <button
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber((prev) => Math.min(prev + 1, numPages))}
              className="hover:text-amber-400 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
            <button onClick={() => setScale((s) => Math.max(s - 0.2, 0.6))} className="hover:text-amber-400">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span>{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((s) => Math.min(s + 0.2, 2.0))} className="hover:text-amber-400">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Close Split View */}
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Document Render Container */}
      <div className="flex-1 overflow-auto p-4 flex justify-center bg-zinc-900/40">
        <Document
          file={`http://localhost:8000/api/documents/${activePdf}`}
          onLoadSuccess={onDocumentLoadSuccess}
          className="shadow-2xl rounded-lg overflow-hidden border border-zinc-800"
        >
          <Page pageNumber={pageNumber} scale={scale} renderTextLayer={true} renderAnnotationLayer={false} />
        </Document>
      </div>
    </div>
  );
}