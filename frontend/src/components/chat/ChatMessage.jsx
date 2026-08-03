import React from 'react';
import ReactMarkdown from 'react-markdown';
import { GraduationCap, User, FileText } from 'lucide-react';

export default function ChatMessage({ message }) {
  const isBot = message.sender === 'bot';

  // Transforms inline string citations like [sample.pdf, p.1] into clean inline badges
  const renderFormattedMarkdown = (content) => {
    if (!content) return '';
    // Regex matches [filename.pdf, p.X] or [filename.pdf, page X]
    const citationRegex = /\[([^\]]+\.pdf),\s*(p(?:age)?\.\s*\d+)\]/gi;

    return content.replace(citationRegex, (match, doc, page) => {
      return `<span class="inline-cite">📄 ${doc} (${page})</span>`;
    });
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
          /* Borderless, Clean Gemini-Style Text Output */
          <div className="space-y-4">
            <div className="prose prose-invert max-w-none text-zinc-200 text-sm sm:text-[15px] leading-relaxed tracking-wide">
              <ReactMarkdown
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
                }}
              >
                {message.text}
              </ReactMarkdown>
            </div>

            {/* Bottom Citation Badges */}
            {message.sources && message.sources.length > 0 && (
              <div className="pt-4 mt-6 border-t border-zinc-800/60 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-full mb-1">
                  Referenced Context Sources:
                </span>
                {message.sources.map((src, sIdx) => (
                  <span
                    key={sIdx}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-amber-300 px-2.5 py-1 rounded-lg"
                  >
                    <FileText className="h-3 w-3 text-amber-400 shrink-0" />
                    <span>{src.doc_name}</span>
                    <span className="text-zinc-500">(p.{src.page_number})</span>
                  </span>
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