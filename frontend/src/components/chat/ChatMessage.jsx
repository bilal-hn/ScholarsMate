import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { GraduationCap, User, FileText, Code2 } from 'lucide-react';

export default function ChatMessage({ message, onSelectCitation }) {
  const isBot = message.sender === 'bot';

  // Converts Markdown table syntax into clean HTML tables
  const preprocessTables = (content) => {
    if (!content || !content.includes('|')) return content;

    const lines = content.split('\n');
    let inTable = false;
    let htmlOutput = [];
    let tableRows = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (/^\|[\s\-:]+(\|[\s\-:]+)*\|$/.test(trimmed)) {
          return;
        }
        inTable = true;
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        tableRows.push(cells);
      } else {
        if (inTable) {
          htmlOutput.push(renderHtmlTable(tableRows));
          tableRows = [];
          inTable = false;
        }
        htmlOutput.push(line);
      }
    });

    if (inTable && tableRows.length > 0) {
      htmlOutput.push(renderHtmlTable(tableRows));
    }

    return htmlOutput.join('\n');
  };

  const renderHtmlTable = (rows) => {
    if (rows.length === 0) return '';
    const header = rows[0];
    const body = rows.slice(1);

    const headerHtml = `<thead><tr>${header
      .map((h) => `<th class="px-4 py-3 font-semibold text-amber-400 border-b border-zinc-800 text-left">${h}</th>`)
      .join('')}</tr></thead>`;

    const bodyHtml = `<tbody>${body
      .map(
        (row) =>
          `<tr class="hover:bg-zinc-900/40 border-b border-zinc-800/50">${row
            .map((c) => `<td class="px-4 py-3 text-zinc-300 leading-snug">${c}</td>`)
            .join('')}</tr>`
      )
      .join('')}</tbody>`;

    return `<div class="overflow-x-auto my-6 rounded-xl border border-zinc-800 bg-zinc-950/60 shadow-lg"><table class="w-full text-xs sm:text-sm border-collapse">${headerHtml}${bodyHtml}</table></div>`;
  };

  return (
    <div className={`flex gap-4 ${isBot ? 'justify-start' : 'justify-end'} w-full`}>
      {/* Avatar Icon */}
      {isBot ? (
        <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-1">
          <GraduationCap className="h-4 w-4" />
        </div>
      ) : null}

      {/* Message Content Container */}
      <div className={`w-full max-w-3xl ${isBot ? 'pr-4' : ''}`}>
        {isBot ? (
          <div className="space-y-4">
            <div className="prose prose-invert max-w-none text-zinc-200 text-sm sm:text-[15px] leading-relaxed tracking-wide overflow-hidden">
              <ReactMarkdown
                rehypePlugins={[rehypeRaw]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-lg font-bold text-zinc-100 mt-6 mb-3 tracking-tight border-b border-zinc-800/80 pb-2">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base font-semibold text-amber-400 mt-6 mb-2 tracking-tight">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-zinc-200 mt-4 mb-2 tracking-wide">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-zinc-300 leading-relaxed mb-4 font-normal">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside space-y-2.5 pl-5 my-4 text-zinc-300">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside space-y-2.5 pl-5 my-4 text-zinc-300">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="pl-1 leading-relaxed">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-zinc-100">{children}</strong>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-amber-400/80 pl-4 py-1 my-4 bg-amber-500/5 rounded-r-xl italic text-zinc-400">
                      {children}
                    </blockquote>
                  ),

                  /* --- CODE BLOCK RENDERERS --- */
                  code: ({ inline, className, children, ...props }) => {
                    return inline ? (
                      <code className="bg-zinc-900 text-amber-300 font-mono text-[13px] px-1.5 py-0.5 rounded border border-zinc-800/80" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="font-mono text-xs sm:text-sm text-amber-200/90" {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <div className="my-5 rounded-xl border border-zinc-800 bg-zinc-950/90 shadow-xl overflow-hidden">
                      <div className="bg-zinc-900/80 px-4 py-2 border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-mono">
                        <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                          <Code2 className="h-3.5 w-3.5" />
                          Snippet / Extraction
                        </span>
                        <span>Code Block</span>
                      </div>
                      <pre className="p-4 overflow-x-auto font-mono text-xs sm:text-sm leading-relaxed text-zinc-200">
                        {children}
                      </pre>
                    </div>
                  )
                }}
              >
                {preprocessTables(message.text)}
              </ReactMarkdown>
            </div>

            {/* Clickable Citation Badges */}
            {message.sources && message.sources.length > 0 && (
              <div className="pt-4 mt-6 border-t border-zinc-800/60 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-full mb-1">
                  Referenced Context Sources:
                </span>
                {message.sources.map((src, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => onSelectCitation && onSelectCitation(src.doc_name, src.page_number)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-amber-300 hover:text-amber-400 px-2.5 py-1 rounded-lg transition-all cursor-pointer group"
                  >
                    <FileText className="h-3 w-3 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                    <span>{src.doc_name}</span>
                    <span className="text-zinc-500">(p.{src.page_number})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* User Prompt Bubble */
          <div className="flex justify-end items-start gap-3">
            <div className="bg-amber-400 text-zinc-950 font-medium px-5 py-3 rounded-2xl shadow-md text-sm max-w-xl">
              {message.text}
            </div>
            <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0">
              <User className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}