import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, FileCode, Loader2 } from 'lucide-react';
import { sendQuery } from '../services/api';

export default function ChatInterface({ selectedDocs }) {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello! Ask me questions about your indexed research papers.',
      sources: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto scroll to bottom of chat
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
    <main className="flex-1 flex flex-col bg-slate-900 h-full">
      {/* Active Target Banner */}
      <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-sky-400" />
          Target Scope: {selectedDocs.length > 0 ? `${selectedDocs.length} selected doc(s)` : 'Full Workspace Library'}
        </span>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-4 max-w-4xl ${msg.sender === 'user' ? 'ml-auto justify-end' : ''}`}
          >
            {msg.sender === 'bot' && (
              <div className="h-8 w-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={`rounded-2xl p-5 space-y-3 ${
                msg.sender === 'user'
                  ? 'bg-sky-600 text-slate-100 max-w-lg'
                  : 'bg-slate-800/90 border border-slate-700/80 text-slate-200 w-full'
              }`}
            >
              <div className="prose prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>

              {/* Source Badges */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="pt-3 border-t border-slate-700/60 flex flex-wrap gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-full">
                    Referenced Sources:
                  </span>
                  {msg.sources.map((src, sIdx) => (
                    <span
                      key={sIdx}
                      className="inline-flex items-center gap-1 text-[11px] font-mono bg-slate-900/80 border border-slate-700 text-sky-300 px-2.5 py-1 rounded-md"
                    >
                      📄 {src.doc_name} (p.{src.page_number})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {msg.sender === 'user' && (
              <div className="h-8 w-8 rounded-xl bg-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-4">
            <div className="h-8 w-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl px-5 py-4 flex items-center gap-3 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
              <span>Synthesizing answer from library...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-slate-800 bg-slate-950">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            placeholder="Ask a question about your research documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-semibold px-5 rounded-xl flex items-center justify-center transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </main>
  );
}