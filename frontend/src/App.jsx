import React, { useState, useEffect } from 'react';
import DocumentSidebar from './components/DocumentSidebar';
import ChatInterface from './components/ChatInterface';
import { getDocuments, checkHealth } from './services/api';
import { GraduationCap, Activity } from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');

  const fetchDocs = async () => {
    setLoadingDocs(true);
    try {
      const data = await getDocuments();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    checkHealth().then((res) => setBackendStatus(res.status));
    fetchDocs();
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 overflow-hidden font-sans">
      {/* App Top Navbar */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-base leading-none">ScholarsMate</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">Source-Locked Research Intelligence Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
          <Activity className={`h-3.5 w-3.5 ${backendStatus === 'ok' || backendStatus === 'online' ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className="capitalize text-slate-300">
            {backendStatus === 'ok' || backendStatus === 'online' ? 'System Ready' : 'Backend Offline'}
          </span>
        </div>
      </header>

      {/* Main Split Screen Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <DocumentSidebar
          documents={documents}
          selectedDocs={selectedDocs}
          setSelectedDocs={setSelectedDocs}
          refreshDocs={fetchDocs}
          loadingDocs={loadingDocs}
        />
        <ChatInterface selectedDocs={selectedDocs} />
      </div>
    </div>
  );
}