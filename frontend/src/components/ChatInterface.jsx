import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, User, Loader2, BookOpen } from 'lucide-react';
import { sendQuery } from '../services/api';

export default function ChatInterface({ selectedDocs }) {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: "Hello! I'm ScholarsMate. Ask me questions about your uploaded research papers.",
      sources: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userMessage }]);
    setLoading(true);

    try {
      const result = await sendQuery(userMessage, selectedDocs);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: result.answer,
          sources: result.sources_used || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: '⚠️ Generation failed. Please check backend connection.',
          sources: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-zinc-950 h-full relative overflow-hidden">
      {/* Target Scope Sub-header */}
      <div className="px-6 py-2.5 bg-zinc-950 border-b border-zinc-800/60 text-xs text-zinc-400 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-amber-400" />
          <span>
            Target Scope:{' '}
            <strong className="text-zinc-200 font-medium">
              {selectedDocs.length > 0 ? `${selectedDocs.length} selected doc(s)` : 'Full Workspace Library'}
            </strong>
          </span>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-4xl mx-auto w-full">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'bot' && (
              <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
            )}

            <div
              className={`rounded-2xl px-5 py-4 space-y-3 ${
                msg.sender === 'user'
                  ? 'bg-amber-400 text-zinc-950 font-medium max-w-xl shadow-md'
                  : 'bg-zinc-900/80 border border-zinc-800 text-zinc-200 w-full'
              }`}
            >
              <div className="prose prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>

              {/* Source Badges */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="pt-3 border-t border-zinc-800 flex flex-wrap gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-full">
                    Referenced Evidence:
                  </span>
                  {msg.sources.map((src, sIdx) => (
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

            {msg.sender === 'user' && (
              <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-4">
            <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl px-5 py-4 flex items-center gap-3 text-zinc-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span>Synthesizing source-locked evidence...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Prompt Input Box */}
      <div className="p-4 bg-zinc-950 border-t border-zinc-800/80 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center gap-3 bg-zinc-900 border border-zinc-800 focus-within:border-amber-400/80 rounded-2xl px-4 py-2 transition-all shadow-lg">
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
    </main>
  );
}