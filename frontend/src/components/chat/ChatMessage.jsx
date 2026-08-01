import React from 'react';
import ReactMarkdown from 'react-markdown';
import { GraduationCap, User } from 'lucide-react';

export default function ChatMessage({ message }) {
  const isBot = message.sender === 'bot';

  return (
    <div className={`flex gap-4 ${isBot ? 'justify-start' : 'justify-end'}`}>
      {isBot && (
        <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
          <GraduationCap className="h-4 w-4" />
        </div>
      )}

      <div
        className={`rounded-2xl px-5 py-4 space-y-3 ${
          isBot
            ? 'bg-zinc-900/80 border border-zinc-800 text-zinc-200 w-full'
            : 'bg-amber-400 text-zinc-950 font-medium max-w-xl shadow-md'
        }`}
      >
        <div className="prose prose-invert max-w-none text-sm leading-relaxed">
          <ReactMarkdown>{message.text}</ReactMarkdown>
        </div>

        {/* Source Badges */}
        {message.sources && message.sources.length > 0 && (
          <div className="pt-3 border-t border-zinc-800 flex flex-wrap gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-full">
              Referenced Evidence:
            </span>
            {message.sources.map((src, sIdx) => (
              <span
                key={sIdx}
                className="inline-flex items-center gap-1 text-[11px] font-mono bg-zinc-950 border border-zinc-700/80 text-amber-300 px-2.5 py-1 rounded-md"
              >
                📄 {src.doc_name} (p.{src.page_number})
              </span>
            ))}
          </div>
        )}
      </div>

      {!isBot && (
        <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}