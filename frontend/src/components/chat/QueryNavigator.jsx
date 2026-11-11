import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MoreHorizontal, ArrowUp, ArrowDown, X, Trash2 } from 'lucide-react';

export default function QueryNavigator({ messages = [], onDeleteChat }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  // Extract all user prompts with their index in the conversation
  const userQueries = useMemo(() => {
    return messages
      .map((m, idx) => ({ ...m, originalIndex: idx }))
      .filter((m) => m.sender === 'user');
  }, [messages]);

  // Close on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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
    <div className="relative inline-flex" ref={popoverRef}>
      {/* 3-Dots Query Navigator Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Previous questions & navigation"
        className={`inline-flex items-center justify-center px-2.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-full text-xs text-zinc-300 hover:text-zinc-100 shadow-md transition-all cursor-pointer select-none group ${
          isOpen
            ? 'bg-zinc-800/90 border-zinc-700 text-amber-400 ring-1 ring-amber-400/40'
            : ''
        }`}
      >
        <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400 group-hover:text-amber-400 transition-colors" />
      </button>

      {/* Popover Menu (Opens upward above the button, aligned to the right) */}
      {isOpen && (
        <div className="absolute bottom-full mb-1.5 right-0 w-72 sm:w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-150">
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
              {onDeleteChat && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onDeleteChat();
                  }}
                  title="Delete Chat Thread"
                  className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Queries List or Empty State */}
          {userQueries.length === 0 ? (
            <div className="py-6 px-3 text-center text-zinc-500 italic text-[11.5px] select-none">
              No previous questions in this chat yet.
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
