import React, { useState, useEffect } from 'react';
import { checkHealth, sendQuery } from './services/api';
import { Activity, Send, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [status, setStatus] = useState('checking...');
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check backend connection on mount
    checkHealth().then((res) => setStatus(res.status));
  }, []);

  const handleTestQuery = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const data = await sendQuery(query);
      setResponse(data);
    } catch (err) {
      alert('Query failed! Make sure your FastAPI backend is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100 p-8">
      {/* Header Bar */}
      <header className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-sky-400" />
          <h1 className="text-2xl font-bold tracking-tight">ScholarsMate UI Test</h1>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-sm">
          <Activity className={`h-4 w-4 ${status === 'ok' || status === 'online' ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className="capitalize text-slate-300">
              Backend: {status === 'ok' || status === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
      </header>

      {/* Main Testing Area */}
      <main className="mt-8 max-w-3xl mx-auto w-full space-y-6">
        <form onSubmit={handleTestQuery} className="flex gap-2">
          <input
            type="text"
            placeholder="Ask a question (e.g. How many papers have I uploaded so far?)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            {loading ? 'Processing...' : <><Send className="h-4 w-4" /> Send</>}
          </button>
        </form>

        {/* Response Card */}
        {response && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-sky-400">Response:</h2>
            <div className="prose prose-invert max-w-none text-slate-200">
              <ReactMarkdown>{response.answer}</ReactMarkdown>
            </div>
            
            {response.sources_used?.length > 0 && (
              <div className="pt-4 border-t border-slate-700/60">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Sources Referenced</h3>
                <div className="flex flex-wrap gap-2">
                  {response.sources_used.map((s, idx) => (
                    <span key={idx} className="bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg text-xs font-mono text-sky-300">
                      📄 {s.doc_name} (p.{s.page_number})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}