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
    <div className="flex flex-col h-screen w-full bg-zinc-950 overflow-hidden font-sans">
      {/* Top Navbar */}
      <header className="h-14 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between px-6 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-zinc-100 text-base leading-none">ScholarsMate</h1>
            <p className="text-[10px] text-zinc-500 mt-0.5 font-medium">Source-Locked Research Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
          <Activity className={`h-3.5 w-3.5 ${backendStatus === 'ok' || backendStatus === 'online' ? 'text-amber-400' : 'text-rose-400'}`} />
          <span className="capitalize text-zinc-300 font-medium">
            {backendStatus === 'ok' || backendStatus === 'online' ? 'System Ready' : 'Backend Offline'}
          </span>
        </div>
      </header>

      {/* Main Split-Screen Workspace */}
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