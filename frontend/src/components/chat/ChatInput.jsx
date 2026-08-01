import React from 'react';
import { Send } from 'lucide-react';

export default function ChatInput({ input, setInput, onSubmit, loading }) {
  return (
    <div className="p-4 bg-zinc-950 border-t border-zinc-800/80 shrink-0">
      <form
        onSubmit={onSubmit}
        className="max-w-4xl mx-auto flex items-center gap-3 bg-zinc-900 border border-zinc-800 focus-within:border-amber-400/80 rounded-2xl px-4 py-2 transition-all shadow-lg"
      >
        <input
          type="text"
          placeholder="Ask anything about your research papers..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-transparent py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 p-2 rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}