import React, { useState, useEffect } from 'react';
import Header from './components/layout/Header';
import DocumentSidebar from './components/document/DocumentSidebar';
import ChatInterface from './components/chat/ChatInterface';
import CreateWorkspaceModal from './components/document/CreateWorkspaceModal';
import { getDocuments, checkHealth } from './services/api';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Workspaces state synced with localStorage
  const [workspaces, setWorkspaces] = useState(() => {
    const saved = localStorage.getItem('scholarsmate_workspaces');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => {
    return localStorage.getItem('scholarsmate_active_id') || null;
  });

  useEffect(() => {
    localStorage.setItem('scholarsmate_workspaces', JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem('scholarsmate_active_id', activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  const fetchDocs = async () => {
    try {
      const data = await getDocuments();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  useEffect(() => {
    checkHealth().then((res) => setBackendStatus(res.status));
    fetchDocs();
  }, []);

  const handleWorkspaceCreated = async (newWorkspace) => {
    setWorkspaces((prev) => [newWorkspace, ...prev]);
    setActiveWorkspaceId(newWorkspace.id);
    await fetchDocs();
  };

  const handleSelectWorkspace = (workspace) => {
    setActiveWorkspaceId(workspace.id);
    // Scope filters to documents from this selected workspace
    if (workspace.documents && workspace.documents.length > 0) {
      setSelectedDocs(workspace.documents);
    } else {
      setSelectedDocs([]);
    }
  };

  const handleDeleteWorkspace = (id) => {
    const updated = workspaces.filter((ws) => ws.id !== id);
    setWorkspaces(updated);
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(updated.length > 0 ? updated[0].id : null);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 overflow-hidden font-sans">
      <Header backendStatus={backendStatus} />

      <div className="flex-1 flex overflow-hidden">
        <DocumentSidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
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
        onWorkspaceCreated={handleWorkspaceCreated}
      />
    </div>
  );
}