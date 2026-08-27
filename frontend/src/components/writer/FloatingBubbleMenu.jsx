import React from 'react';
import { Sparkles, BookmarkPlus, Bold, Italic, Underline, Heading2, Quote } from 'lucide-react';

/**
 * Floating bubble menu that appears above highlighted text selections in the Document Writer.
 */
export default function FloatingBubbleMenu({
  position,
  onCite,
  onAskAI,
  onFormat,
  onClose,
}) {
  if (!position) return null;

  return (
    <div
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      className="fixed -translate-x-1/2 -translate-y-full z-50 mb-2 flex items-center gap-1 p-1 bg-zinc-900/95 border border-zinc-700/80 rounded-xl shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 select-none"
      onMouseDown={(e) => e.preventDefault()} // Prevent losing editor selection
    >
      {/* 1. Semantic Citation Button */}
      <button
        type="button"
        onClick={onCite}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-xs font-medium cursor-pointer transition-all active:scale-95"
        title="Find grounded citations in workspace documents"
      >
        <BookmarkPlus className="h-3.5 w-3.5 text-amber-400" />
        <span>Cite</span>
      </button>

      {/* 2. Ask AI Button */}
      <button
        type="button"
        onClick={onAskAI}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 hover:text-purple-200 border border-purple-500/30 text-xs font-medium cursor-pointer transition-all active:scale-95"
        title="Ask AI to critique, expand, or rewrite this selection"
      >
        <Sparkles className="h-3.5 w-3.5 text-purple-400" />
        <span>Ask AI</span>
      </button>

      <div className="h-4 w-px bg-zinc-700 mx-0.5" />

      {/* 3. Quick Formatting Actions */}
      <button
        type="button"
        onClick={() => onFormat('bold')}
        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => onFormat('italic')}
        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => onFormat('underline')}
        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
        title="Underline (Ctrl+U)"
      >
        <Underline className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => onFormat('h2')}
        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
        title="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => onFormat('quote')}
        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
        title="Blockquote"
      >
        <Quote className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
