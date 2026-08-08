import React, { useState, useEffect } from 'react';
import Header from './components/layout/Header';
import DocumentSidebar from './components/document/DocumentSidebar';
import ChatInterface from './components/chat/ChatInterface';
import CreateWorkspaceModal from './components/document/CreateWorkspaceModal';
import PdfViewer from './components/viewer/PdfViewer';
import { getDocuments, checkHealth } from './services/api';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // PDF Viewer split-screen state
  const [activePdf, setActivePdf] = useState(null);
  const [targetPage, setTargetPage] = useState(1);

  // Literature review loading state & generated content handler
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const [reviewTriggerMessage, setReviewTriggerMessage] = useState(null);

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

  // Callback triggered when a user clicks a citation badge in ChatMessage
  const handleSelectCitation = (docName, pageNum) => {
    console.log(`[App.jsx Debug] Citation clicked: ${docName}, Page: ${pageNum}`);
    setActivePdf(docName);
    setTargetPage(pageNum || 1);
  };

  // Trigger handler for generating a workspace literature review
  const handleGenerateReview = async () => {
    setIsGeneratingReview(true);
    try {
      const response = await fetch('http://localhost:8000/api/workspace/literature-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_names: selectedDocs }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }

      const data = await response.json();
      
      // Pass the response to ChatInterface via state trigger
      setReviewTriggerMessage({
        sender: 'bot',
        text: data.content,
        sources: (data.documents_analyzed || []).map((doc) => ({
          doc_name: doc,
          page_number: 1,
        })),
      });
    } catch (err) {
      console.error('Failed to generate literature review:', err);
      setReviewTriggerMessage({
        sender: 'bot',
        text: '⚠️ Failed to generate literature review. Please check backend connection.',
        sources: [],
      });
    } finally {
      setIsGeneratingReview(false);
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
          onGenerateReview={handleGenerateReview}
          isGenerating={isGeneratingReview}
        />

        {/* Main Content Area: Dynamic Split-Screen Layout */}
        <div className="flex-1 flex h-full overflow-hidden">
          {/* Chat Interface Container */}
          <div className={`h-full transition-all duration-300 ${activePdf ? 'w-1/2 border-r border-zinc-800' : 'w-full'}`}>
            <ChatInterface
              documents={documents}
              selectedDocs={selectedDocs}
              setSelectedDocs={setSelectedDocs}
              onSelectCitation={handleSelectCitation}
              incomingMessage={reviewTriggerMessage}
            />
          </div>

          {/* Interactive PDF Viewer Split Screen */}
          {activePdf && (
            <div className="w-1/2 h-full">
              <PdfViewer
                activePdf={activePdf}
                targetPage={targetPage}
                onClose={() => setActivePdf(null)}
              />
            </div>
          )}
        </div>
      </div>

      <CreateWorkspaceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onWorkspaceCreated={handleWorkspaceCreated}
      />
    </div>
  );
}