import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Compass,
  User,
  FileText,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Copy,
  Check,
  Layers,
  Sparkles,
  Zap,
  ExternalLink,
} from 'lucide-react';

/**
 * Interactive inline citation badge matching ChatGPT style with hover card popover and click-to-open split PDF viewer.
 */
function InlineCitationBadge({ docName, pageNumber, sources = [], onSelectCitation }) {
  const [isHovered, setIsHovered] = useState(false);

  // Resolve matching source document name from message sources if available
  const resolvedDoc = (() => {
    if (!docName) return 'sample.pdf';
    let target = docName.trim();

    if (sources && sources.length > 0) {
      const cleanLower = target.toLowerCase().replace(/\.pdf$/i, '');
      const found = sources.find((s) => {
        const sName = s.doc_name.toLowerCase();
        const sStem = sName.replace(/\.pdf$/i, '');
        return (
          sName === target.toLowerCase() ||
          sStem === cleanLower ||
          sName.includes(cleanLower) ||
          cleanLower.includes(sStem)
        );
      });
      if (found) return found.doc_name;
    }

    if (!target.includes('.')) {
      return `${target}.pdf`;
    }
    return target;
  })();

  const displayName = resolvedDoc.replace(/\.pdf$/i, '');

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onSelectCitation) {
      onSelectCitation(resolvedDoc, pageNumber || 1);
    }
  };

  return (
    <span
      data-citation-badge="true"
      data-doc={resolvedDoc}
      data-page={pageNumber || 1}
      className="relative inline-block align-baseline mx-1 select-none not-prose"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Inline Pill matching ChatGPT reference */}
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-300 hover:text-zinc-100 border border-zinc-700/60 hover:border-zinc-500/60 text-xs font-sans font-medium leading-normal transition-all cursor-pointer shadow-xs hover:scale-105 active:scale-95 group"
        title={`View ${resolvedDoc} (Page ${pageNumber || 1})`}
      >
        <FileText className="h-3 w-3 text-zinc-400 group-hover:text-amber-400 transition-colors shrink-0" />
        <span className="truncate max-w-[120px]">{displayName}</span>
        {pageNumber && (
          <span className="text-amber-400/90 text-[10.5px] font-mono">p.{pageNumber}</span>
        )}
      </button>

      {/* Floating Hover Card (matching ChatGPT reference: clean name + page) */}
      {isHovered && (
        <div
          onClick={handleClick}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2.5 bg-zinc-900/98 border border-zinc-700/90 rounded-xl shadow-2xl backdrop-blur-xl z-50 text-left min-w-[180px] max-w-xs animate-in fade-in zoom-in-95 duration-150 cursor-pointer hover:border-amber-500/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0">
              <FileText className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-zinc-100 text-xs leading-snug truncate" title={resolvedDoc}>
                {resolvedDoc}
              </div>
              <div className="text-[11px] font-mono text-amber-400 mt-0.5">
                Page {pageNumber || 1}
              </div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Transforms raw citation patterns in text into internal hash citation anchors (#cite:doc:page).
 * Accurately supports multi-page citations (e.g. [sample2.pdf, p.2, p.22]) while ignoring
 * academic author-year literature citations like [Su et al., 2022].
 */
const safeEncodeDoc = (doc) => {
  return encodeURIComponent(doc || '').replace(/\(/g, '%28').replace(/\)/g, '%29');
};

const transformCitations = (rawText) => {
  if (!rawText) return '';

  let formatted = rawText;

  // Step 0: Strip any accidental backticks around citation brackets e.g. `[sample.pdf, p.3]` -> [sample.pdf, p.3]
  formatted = formatted.replace(/`(\s*(?:\[|\(|<).*?(?:\]|\)|>)\s*)`/g, '$1');

  // Step 1: Raw citation:filename:page or citation:filename (legacy or edge cases)
  const rawCitationPrefixRegex = /citation:\s*([^\s:]+?\.(?:pdf|docx|txt|epub|md|PDF|DOCX))(?::(\d+))?/gi;
  formatted = formatted.replace(rawCitationPrefixRegex, (match, docName, pageNum) => {
    const cleanDoc = docName.trim();
    const cleanPage = pageNum ? pageNum.trim() : '1';
    return `[cite](#cite:${safeEncodeDoc(cleanDoc)}:${cleanPage})`;
  });

  // Step 2: Square bracket citation with explicit file extension and page list: e.g. [sample2.pdf, p.2, p.22] or [Build_a_Large_Language_Model_(From_Scrat (3).pdf, p.14]
  const squareWithPagesRegex = /\[\s*([^\]]+?\.(?:pdf|docx|txt|epub|md|PDF|DOCX))\s*(?:,\s*|\s+)(?:p\.?|page|pp\.)?\s*([\d\s,p\.]+?)\s*\]/gi;
  formatted = formatted.replace(squareWithPagesRegex, (match, docName, pagesRaw) => {
    const cleanDoc = docName.trim();
    if (cleanDoc.startsWith('http://') || cleanDoc.startsWith('https://') || cleanDoc.startsWith('#') || cleanDoc.startsWith('cite')) {
      return match;
    }
    const pageNums = pagesRaw.match(/\d+/g);
    if (!pageNums || pageNums.length === 0) {
      return `[cite](#cite:${safeEncodeDoc(cleanDoc)}:1)`;
    }
    return pageNums.map(p => `[cite](#cite:${safeEncodeDoc(cleanDoc)}:${p})`).join(' ');
  });

  // Step 2b: Parenthesis citation: (sample2.pdf, p.2) or (sample.pdf, page 14)
  const parenWithPagesRegex = /\(\s*([^)]+?\.(?:pdf|docx|txt|epub|md|PDF|DOCX))\s*(?:,\s*|\s+)(?:p\.?|page|pp\.)?\s*([\d\s,p\.]+?)\s*\)/gi;
  formatted = formatted.replace(parenWithPagesRegex, (match, docName, pagesRaw) => {
    const cleanDoc = docName.trim();
    if (cleanDoc.startsWith('http://') || cleanDoc.startsWith('https://') || cleanDoc.startsWith('#') || cleanDoc.startsWith('cite')) {
      return match;
    }
    const pageNums = pagesRaw.match(/\d+/g);
    if (!pageNums || pageNums.length === 0) {
      return `[cite](#cite:${safeEncodeDoc(cleanDoc)}:1)`;
    }
    return pageNums.map(p => `[cite](#cite:${safeEncodeDoc(cleanDoc)}:${p})`).join(' ');
  });

  // Step 3: Square bracket citation without file extension but with explicit p./page prefix: e.g. [sample2, p.1] or [sample2, p.2, p.22]
  const squareStemWithPageRegex = /\[\s*([^\]]+?)(?:,\s*|\s+)(?:p\.?|page|pp\.)\s*([\d\s,p\.]+?)\s*\]/gi;
  formatted = formatted.replace(squareStemWithPageRegex, (match, docName, pagesRaw) => {
    const cleanDoc = docName.trim();
    if (cleanDoc.startsWith('http://') || cleanDoc.startsWith('https://') || cleanDoc.startsWith('#') || cleanDoc.startsWith('cite')) {
      return match;
    }
    const pageNums = pagesRaw.match(/\d+/g);
    if (!pageNums || pageNums.length === 0) {
      return match;
    }
    return pageNums.map(p => `[cite](#cite:${safeEncodeDoc(cleanDoc)}:${p})`).join(' ');
  });

  // Step 4: Standalone file citations in brackets: [sample.pdf] or [Build_a_Large_Language_Model_(From_Scrat (3).pdf]
  const squareWithoutPageRegex = /\[\s*([^\]]+?\.(?:pdf|docx|txt|epub|md|PDF|DOCX))\s*\]/gi;
  formatted = formatted.replace(squareWithoutPageRegex, (match, docName) => {
    const cleanDoc = docName.trim();
    if (cleanDoc.startsWith('http://') || cleanDoc.startsWith('https://') || cleanDoc.startsWith('#') || cleanDoc.startsWith('cite')) {
      return match;
    }
    return `[cite](#cite:${safeEncodeDoc(cleanDoc)}:1)`;
  });

  return formatted;
};

export default function ChatMessage({ message, index, onSelectCitation }) {
  const [showThinking, setShowThinking] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState(false);
  const messageBodyRef = useRef(null);

  const isBot = message.sender === 'bot';

  // Format timestamp (e.g. "09:04 PM")
  const formatTime = (ts) => {
    if (!ts) return '';
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const timeString = formatTime(message.timestamp);

  // Clean model ID display (e.g. "gemini-3.7-flash", "gpt-4o-mini", etc.)
  const modelIdentifier =
    message.model_name ||
    message.meta?.model ||
    (isBot ? 'scholarsmate' : null);

  const cleanModelTag = modelIdentifier
    ? modelIdentifier
        .replace(/^models\//i, '')
        .replace(/^openai\//i, '')
        .replace(/^anthropic\//i, '')
        .replace(/^groq\//i, '')
        .replace(/^gemini\//i, '')
    : 'scholarsmate';

  // Extract telemetry metrics
  const responseTime = message.meta?.responseTime || null;
  const tokenCount = message.meta?.tokens !== undefined ? message.meta.tokens : null;

  // Calculate approximate token generation speed
  const calculateSpeed = () => {
    if (!tokenCount || !responseTime) return null;
    const sec = parseFloat(responseTime.replace('s', ''));
    if (isNaN(sec) || sec <= 0) return null;
    return Math.round(tokenCount / sec);
  };

  const speed = calculateSpeed();

  const MODE_NAMES = {
    assistant: 'Paper Assistant',
    research: 'Deep Research',
    teacher: 'Masterclass Teacher',
    // Aliases for backwards compatibility
    student: 'Paper Assistant',
    socratic: 'Masterclass Teacher',
    reviewer: 'Deep Research',
    executive: 'Paper Assistant',
    survey: 'Deep Research',
  };

  const appliedMode = message.mode_applied || (message.meta && message.meta.mode) || null;
  const appliedModeName = appliedMode ? (MODE_NAMES[appliedMode] || appliedMode) : null;

  /**
   * Enterprise-Grade Multi-MIME Clipboard Copy
   * Writes both rich HTML (for Microsoft Word, Google Docs, Apple Notes) and Markdown (for code editors).
   */
  const handleCopy = async () => {
    if (!message.text) return;

    try {
      if (messageBodyRef.current && typeof ClipboardItem !== 'undefined') {
        const clone = messageBodyRef.current.cloneNode(true);

        // Replace citation buttons with clean citation text for Word export
        const citationBadges = clone.querySelectorAll('[data-citation-badge="true"]');
        citationBadges.forEach((badge) => {
          const doc = badge.getAttribute('data-doc') || '';
          const page = badge.getAttribute('data-page') || '';
          const citeSpan = document.createElement('span');
          citeSpan.textContent = ` [${doc}${page ? `, p.${page}` : ''}] `;
          badge.parentNode.replaceChild(citeSpan, badge);
        });

        // Apply clean inline styles to tables for Word / Google Docs
        const tables = clone.querySelectorAll('table');
        tables.forEach((tbl) => {
          tbl.setAttribute('style', 'border-collapse: collapse; width: 100%; margin: 12px 0; font-family: sans-serif; font-size: 13px;');
          const ths = tbl.querySelectorAll('th');
          ths.forEach((th) => {
            th.setAttribute('style', 'border: 1px solid #cbd5e1; background-color: #f1f5f9; color: #0f172a; padding: 8px 12px; text-align: left; font-weight: 600;');
          });
          const tds = tbl.querySelectorAll('td');
          tds.forEach((td) => {
            td.setAttribute('style', 'border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; vertical-align: top; color: #1e293b;');
          });
        });

        // Style headings, paragraphs, lists
        const headings = clone.querySelectorAll('h1, h2, h3, h4');
        headings.forEach((h) => {
          h.setAttribute('style', 'margin-top: 14px; margin-bottom: 6px; font-weight: bold; color: #0f172a;');
        });
        const paragraphs = clone.querySelectorAll('p');
        paragraphs.forEach((p) => {
          p.setAttribute('style', 'margin-top: 6px; margin-bottom: 6px; line-height: 1.6; color: #1e293b;');
        });
        const lists = clone.querySelectorAll('ul, ol');
        lists.forEach((l) => {
          l.setAttribute('style', 'margin-top: 6px; margin-bottom: 6px; padding-left: 20px;');
        });

        const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">
              ${clone.innerHTML}
            </body>
          </html>
        `;

        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([message.text], { type: 'text/plain' });

        const item = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        });

        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(message.text);
      }
    } catch (err) {
      console.warn('Rich copy fallback to plain text:', err);
      await navigator.clipboard.writeText(message.text);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Pre-process text to replace inline citations with interactive citation links
  const processedMessageText = isBot ? transformCitations(message.text) : message.text;

  return (
    <div 
      id={index !== undefined ? `chat-msg-${index}` : undefined} 
      className="w-full flex flex-col items-center justify-center my-3 animate-in fade-in duration-200 scroll-mt-6 transition-all"
    >
      {isBot ? (
        /* ===================================================================
           BOT RESPONSE CARD (Centralized, Odysseus / OpenWebUI Inspired)
           =================================================================== */
        <div className="w-full max-w-2xl bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl transition-all relative backdrop-blur-sm">
          {/* Header: Model Badge + Timestamp */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/60 select-none">
            <div className="flex items-center gap-2">
              {/* Sleek Model Tag with @ prefix */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-zinc-300 font-mono text-[11.5px] font-medium shadow-2xs">
                <span className="text-amber-400 font-semibold text-xs">@</span>
                <span className="text-zinc-200 tracking-tight">{cleanModelTag}</span>
              </div>
            </div>

            {timeString && (
              <span className="text-[11px] font-mono text-zinc-500 font-normal">
                {timeString}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* Status Pill 1: Sources / Referenced Papers Accordion */}
            {message.sources && message.sources.length > 0 && (
              <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40 shadow-xs">
                <button
                  type="button"
                  onClick={() => setShowSources((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-950/60 hover:bg-zinc-950/90 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-mono text-[11.5px] text-zinc-300">
                      {message.sources.length} Referenced {message.sources.length === 1 ? 'Source' : 'Sources'}
                    </span>
                  </div>
                  {showSources ? (
                    <ChevronDown className="h-3 w-3 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-zinc-500" />
                  )}
                </button>

                {showSources && (
                  <div className="p-2.5 border-t border-zinc-800/60 bg-zinc-950/80 flex flex-wrap gap-1.5 animate-in fade-in duration-150">
                    {message.sources.map((src, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => onSelectCitation && onSelectCitation(src.doc_name, src.page_number)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 text-amber-300 hover:text-amber-200 px-2 py-1 rounded-lg transition-colors cursor-pointer group"
                        title={`Jump to page ${src.page_number} of ${src.doc_name}`}
                      >
                        <FileText className="h-3 w-3 text-amber-400 shrink-0 group-hover:scale-105 transition-transform" />
                        <span className="truncate max-w-[180px]">{src.doc_name}</span>
                        <span className="text-zinc-500 text-[10px]">p.{src.page_number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Status Pill 2: Thinking / Reasoning Trace Accordion */}
            {message.thinking_process && (
              <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40 shadow-xs">
                <button
                  type="button"
                  onClick={() => setShowThinking((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-950/60 hover:bg-zinc-950/90 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                    <span className="font-sans text-[11.5px] font-medium text-zinc-300">
                      View thinking process
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {responseTime && (
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800">
                        {responseTime}
                      </span>
                    )}
                    {showThinking ? (
                      <ChevronDown className="h-3 w-3 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-zinc-500" />
                    )}
                  </div>
                </button>

                {showThinking && (
                  <div className="px-3.5 pb-3 pt-2 text-xs text-zinc-400 font-mono whitespace-pre-wrap border-t border-zinc-800/60 bg-zinc-950/90 max-h-56 overflow-y-auto leading-relaxed">
                    {message.thinking_process}
                  </div>
                )}
              </div>
            )}

            {/* Synthesized Response Body */}
            <div ref={messageBodyRef} className="prose prose-invert max-w-none text-zinc-200 text-[13.5px] leading-relaxed tracking-normal font-sans pt-1 select-text">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  a: ({ href, children, ...props }) => {
                    if (href && href.startsWith('#cite:')) {
                      const raw = href.slice(6);
                      const colonIdx = raw.lastIndexOf(':');
                      let docName = raw;
                      let pageNum = 1;
                      if (colonIdx !== -1) {
                        docName = decodeURIComponent(raw.slice(0, colonIdx));
                        pageNum = parseInt(raw.slice(colonIdx + 1), 10) || 1;
                      } else {
                        docName = decodeURIComponent(raw);
                      }

                      return (
                        <InlineCitationBadge
                          docName={docName}
                          pageNumber={pageNum}
                          sources={message.sources}
                          onSelectCitation={onSelectCitation}
                        />
                      );
                    }

                    if (href && href.startsWith('citation://')) {
                      const queryIndex = href.indexOf('?');
                      const rawDoc = queryIndex !== -1 ? href.slice(11, queryIndex) : href.slice(11);
                      const docName = decodeURIComponent(rawDoc);
                      let pageNum = 1;
                      if (queryIndex !== -1) {
                        const searchParams = new URLSearchParams(href.slice(queryIndex));
                        pageNum = parseInt(searchParams.get('page') || '1', 10);
                      }
                      return (
                        <InlineCitationBadge
                          docName={docName}
                          pageNumber={pageNum}
                          sources={message.sources}
                          onSelectCitation={onSelectCitation}
                        />
                      );
                    }

                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                  h1: ({ children }) => (
                    <h1 className="text-base font-bold text-zinc-100 mt-4 mb-2 tracking-tight border-b border-zinc-800 pb-1.5">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-zinc-100 mt-3 mb-1.5 tracking-tight border-b border-zinc-800/50 pb-1">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xs font-semibold text-amber-400 mt-2.5 mb-1 uppercase tracking-wider">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="my-2 text-zinc-300 leading-relaxed font-normal">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-2 space-y-1 pl-4 list-disc marker:text-amber-400/80">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-2 space-y-1 pl-4 list-decimal marker:text-amber-400/80">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-zinc-300 leading-relaxed pl-0.5">
                      {children}
                    </li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-zinc-100">{children}</strong>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-amber-500/80 pl-3 py-0.5 my-3 bg-amber-500/5 rounded-r-lg italic text-zinc-400 text-xs">
                      {children}
                    </blockquote>
                  ),

                  /* --- Native GFM Table Renderers --- */
                  table: ({ children }) => (
                    <div className="my-4 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-md">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          {children}
                        </table>
                      </div>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-zinc-800 border-b border-zinc-700/60 text-[10.5px] uppercase tracking-wider text-amber-400 font-semibold">
                      {children}
                    </thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-zinc-800/60 font-normal text-zinc-300">
                      {children}
                    </tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="hover:bg-zinc-800/40 transition-colors">
                      {children}
                    </tr>
                  ),
                  th: ({ children }) => (
                    <th className="py-2.5 px-3 font-semibold text-amber-400 text-left">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="py-2.5 px-3 leading-relaxed align-top">
                      {children}
                    </td>
                  ),

                  /* --- Code & Pre Blocks --- */
                  code: ({ inline, className, children, ...props }) => {
                    if (inline && typeof children === 'string' && children.includes('#cite:')) {
                      const citeMatch = children.match(/#cite:([^:]+)(?::(\d+))?/);
                      if (citeMatch) {
                        const docName = decodeURIComponent(citeMatch[1]);
                        const pageNum = parseInt(citeMatch[2] || '1', 10);
                        return (
                          <InlineCitationBadge
                            docName={docName}
                            pageNumber={pageNum}
                            sources={message.sources}
                            onSelectCitation={onSelectCitation}
                          />
                        );
                      }
                    }
                    return inline ? (
                      <code className="bg-zinc-800/80 text-amber-300 font-mono text-[11.5px] px-1 py-0.5 rounded border border-zinc-700/60" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="font-mono text-xs text-zinc-200 block overflow-x-auto whitespace-pre-wrap" {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <div className="my-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 overflow-x-auto font-mono text-xs leading-relaxed text-zinc-200">
                      {children}
                    </div>
                  )
                }}
              >
                {processedMessageText}
              </ReactMarkdown>
            </div>

            {/* Bottom Telemetry & Actions Footer Toolbar */}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-800/60 text-[11px] text-zinc-500 font-mono select-none">
              {/* Left: Telemetry Data (Tokens, Latency, Speed) */}
              <div className="flex items-center gap-2 flex-wrap">
                {tokenCount !== null && tokenCount > 0 && (
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Cpu className="h-3 w-3 text-zinc-500" />
                    <span>{tokenCount} tok</span>
                  </span>
                )}
                {responseTime && (
                  <>
                    <span className="text-zinc-700">|</span>
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Clock className="h-3 w-3 text-zinc-500" />
                      <span>{responseTime}</span>
                    </span>
                  </>
                )}
                {speed && (
                  <>
                    <span className="text-zinc-700">|</span>
                    <span className="text-zinc-500 flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5 text-amber-400/80" />
                      <span>{speed} tok/s</span>
                    </span>
                  </>
                )}
                {appliedModeName && (
                  <>
                    <span className="text-zinc-700">|</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-sans border font-medium text-zinc-400 border-zinc-800 bg-zinc-900/90">
                      {appliedModeName}
                    </span>
                  </>
                )}
              </div>

              {/* Right: Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Copy formatted response to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400 text-[10px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span className="text-[10px]">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ===================================================================
           USER PROMPT BUBBLE (Right-Aligned, Odysseus Style with Header)
           =================================================================== */
        <div className="w-full max-w-2xl flex flex-col items-end">
          <div className="w-full max-w-lg">
            {/* User Message Header */}
            <div className="flex items-center justify-between px-2 pb-1.5 text-[11px] font-mono text-zinc-500 select-none">
              <div className="flex items-center gap-1 text-zinc-400 font-medium">
                <span className="text-amber-400">•</span>
                <span>You</span>
              </div>
              {timeString && (
                <span>{timeString}</span>
              )}
            </div>

            {/* Bubble Content */}
            <div className="bg-zinc-900 hover:bg-zinc-900/95 text-zinc-100 border border-zinc-800 font-normal px-4 py-3 rounded-2xl shadow-md text-[13.5px] whitespace-pre-wrap leading-relaxed select-text">
              {message.text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}