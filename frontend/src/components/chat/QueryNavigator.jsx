import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AlignLeft, ArrowUp, ArrowDown, Sparkles, MessageSquare, X } from 'lucide-react';

export default function QueryNavigator({ messages = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  // Extract all user prompts with their index in the conversation
  const userQueries = useMemo(() => {
    return messages
      .map((m, idx) => ({ ...m, originalIndex: idx }))
      .filter((m) => m.sender === 'user');
  }, [messages]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (userQueries.length === 0) return null;

  const scrollToMessage = (index) => {
    const el = document.getElementById(`chat-msg-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Add a subtle brief highlight
      el.classList.add('ring-2', 'ring-amber-400/40', 'rounded-2xl');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-amber-400/40', 'rounded-2xl');
      }, 1500);
    }
    setIsOpen(false);
  };

  const scrollToTop = () => {
    const el = document.getElementById('chat-msg-0');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setIsOpen(false);
  };

  const scrollToBottom = () => {
    const el = document.getElementById(`chat-msg-${messages.length - 1}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* 3-Bars Query Navigator Trigger Button (Icon Only) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Jump between queries"
        className={`p-2.5 rounded-xl border transition-all cursor-pointer shadow-xl backdrop-blur-md flex items-center justify-center hover:scale-105 ${
          isOpen
            ? 'bg-zinc-800 border-zinc-600 text-zinc-100 ring-2 ring-zinc-700/60'
            : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <AlignLeft className="h-4 w-4 stroke-[2.2]" />
      </button>

      {/* Popover Menu (Opens to the left of the right edge bar) */}
      {isOpen && (
        <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 w-72 sm:w-80 bg-zinc-900/95 border border-zinc-800 rounded-2xl shadow-2xl z-50 p-2 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800/80 mb-1.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-200 text-xs">Jump to Query</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                {userQueries.length} {userQueries.length === 1 ? 'topic' : 'topics'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={scrollToTop}
                title="Scroll to Top"
                className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={scrollToBottom}
                title="Scroll to Latest"
                className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Queries List */}
          <div className="max-h-64 overflow-y-auto space-y-1 p-0.5 pr-1">
            {userQueries.map((q, qIdx) => (
              <button
                key={q.id || q.originalIndex}
                type="button"
                onClick={() => scrollToMessage(q.originalIndex)}
                className="w-full flex items-start gap-2.5 p-2 rounded-xl text-left hover:bg-zinc-800/70 transition-all cursor-pointer group text-zinc-300 hover:text-zinc-100"
              >
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-zinc-950/80 text-zinc-500 group-hover:text-amber-400 border border-zinc-800 shrink-0 mt-0.5">
                  #{qIdx + 1}
                </span>
                <p className="text-[11.5px] leading-snug line-clamp-2 select-none flex-1">
                  {q.text}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
