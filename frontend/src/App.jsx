import React, { useState, useEffect } from 'react';
import Header from './components/layout/Header';
import DocumentSidebar from './components/document/DocumentSidebar';
import ChatInterface from './components/chat/ChatInterface';
import CreateWorkspaceModal from './components/document/CreateWorkspaceModal';
import { getDocuments, checkHealth } from './services/api';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      <Header backendStatus={backendStatus} />

      <div className="flex-1 flex overflow-hidden">
        <DocumentSidebar
          documents={documents}
          onOpenCreateModal={() => setIsModalOpen(true)}
        />
        <ChatInterface
          documents={documents}
          selectedDocs={selectedDocs}
          setSelectedDocs={setSelectedDocs}
        />
      </div>

      <CreateWorkspaceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onWorkspaceCreated={fetchDocs}
      />
    </div>
  );
}