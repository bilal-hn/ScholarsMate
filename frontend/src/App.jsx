import React, { useState, useEffect, useMemo } from 'react';
import Header from './components/layout/Header';
import DocumentSidebar from './components/document/DocumentSidebar';
import ChatInterface from './components/chat/ChatInterface';
import CreateWorkspaceModal from './components/document/CreateWorkspaceModal';
import SettingsModal from './components/layout/SettingsModal';
import PdfViewer from './components/viewer/PdfViewer';
import { 
  getDocuments, 
  checkHealth, 
  generateLiteratureReview, 
  getChatSessions, 
  deleteChatSession,
  getCurrentUser,
  getSavedBYOKConfig,
  saveBYOKConfig
} from './services/api';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // BYOK Discovered Models & Active Model Selection
  const [discoveredModels, setDiscoveredModels] = useState(() => getSavedBYOKConfig().discoveredModels);
  const [currentModel, setCurrentModel] = useState(() => getSavedBYOKConfig().activeModel);

  // Authentication & Current User State
  const [currentUser, setCurrentUser] = useState(null);

  // PDF Viewer split-screen state
  const [activePdf, setActivePdf] = useState(null);
  const [targetPage, setTargetPage] = useState(1);

  // Literature review loading state & generated content handler
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const [reviewTriggerMessage, setReviewTriggerMessage] = useState(null);

  // Workspaces state synced from backend & fallback to localStorage
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);

  // --------------------------------------------------------------------------
  // USER IDENTITY & WORKSPACE SYNC
  // --------------------------------------------------------------------------
 const syncUserData = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);

      const backendSessions = await getChatSessions();
      
      const mappedWorkspaces = (backendSessions || []).map((session) => ({
        id: session.id,
        name: session.title,
        documents: Array.isArray(session.doc_names) ? session.doc_names : [],
        createdAt: session.created_at,
      }));

      setWorkspaces(mappedWorkspaces);

      if (mappedWorkspaces.length > 0) {
        const savedId = localStorage.getItem('scholarsmate_active_id');
        const activeExists = mappedWorkspaces.some((ws) => ws.id === savedId);
        const selectedId = activeExists ? savedId : mappedWorkspaces[0].id;
        setActiveWorkspaceId(selectedId);
      } else {
        setActiveWorkspaceId(null);
      }
    } catch (err) {
      console.error('Failed to sync user data:', err);
    }
  };

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
    syncUserData();
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem('scholarsmate_active_id', activeWorkspaceId);
    } else {
      localStorage.removeItem('scholarsmate_active_id');
    }
  }, [activeWorkspaceId]);

  // Handle Google OAuth login or logout
  const handleAuthChange = async () => {
    setActiveWorkspaceId(null);
    setActivePdf(null);
    await syncUserData();
    await fetchDocs();
  };

  // --------------------------------------------------------------------------
  // WORKSPACE DOCUMENT ISOLATION
  // --------------------------------------------------------------------------
  const activeWorkspace = useMemo(() => {
    return workspaces.find((ws) => ws.id === activeWorkspaceId) || null;
  }, [workspaces, activeWorkspaceId]);

  // Strict Scoping: Return empty if no active workspace is selected
  const scopedDocuments = useMemo(() => {
    if (!activeWorkspace || !activeWorkspace.documents) {
      return [];
    }
    return documents.filter((doc) =>
      activeWorkspace.documents.includes(doc.doc_name)
    );
  }, [documents, activeWorkspace]);

  // Strict Selection: Clear selected docs if no active workspace is selected
  useEffect(() => {
    if (activeWorkspace && activeWorkspace.documents) {
      setSelectedDocs(activeWorkspace.documents);
    } else {
      setSelectedDocs([]);
    }
  }, [activeWorkspace]);

  const handleWorkspaceCreated = async (newWorkspace) => {
    await syncUserData();
    if (newWorkspace?.id) {
      setActiveWorkspaceId(newWorkspace.id);
    }
    await fetchDocs();
  };

  const handleSelectWorkspace = (workspace) => {
    setActiveWorkspaceId(workspace.id);
    if (workspace.documents && workspace.documents.length > 0) {
      setSelectedDocs(workspace.documents);
    } else {
      setSelectedDocs([]);
    }
  };

  const handleDeleteWorkspace = async (id) => {
    try {
      await deleteChatSession(id);
      const updated = workspaces.filter((ws) => ws.id !== id);
      setWorkspaces(updated);
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(updated.length > 0 ? updated[0].id : null);
      }
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

  const handleSelectCitation = (docName, pageNum) => {
    setActivePdf(docName);
    setTargetPage(pageNum || 1);
  };

  // --------------------------------------------------------------------------
  // BYOK & MODEL SELECTION HANDLERS
  // --------------------------------------------------------------------------
  const handleConfigUpdated = (models, active) => {
    setDiscoveredModels(models);
    setCurrentModel(active);
  };

  const handleModelChange = (modelId) => {
    setCurrentModel(modelId);
    saveBYOKConfig(null, null, modelId);
  };

  const handleGenerateReview = async () => {
    setIsGeneratingReview(true);
    try {
      const data = await generateLiteratureReview(selectedDocs);
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
      <Header 
        backendStatus={backendStatus} 
        availableModels={discoveredModels}
        currentModel={currentModel}
        onModelChange={handleModelChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        <DocumentSidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onOpenCreateModal={() => setIsModalOpen(true)}
          onGenerateReview={handleGenerateReview}
          isGenerating={isGeneratingReview}
          onAuthChange={handleAuthChange}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex h-full overflow-hidden">
          <div className={`h-full transition-all duration-300 ${activePdf ? 'w-1/2 border-r border-zinc-800' : 'w-full'}`}>
            <ChatInterface
              documents={scopedDocuments}
              selectedDocs={selectedDocs}
              setSelectedDocs={setSelectedDocs}
              onSelectCitation={handleSelectCitation}
              incomingMessage={reviewTriggerMessage}
              sessionId={activeWorkspaceId}
              availableModels={discoveredModels}
              currentModel={currentModel}
              onModelChange={handleModelChange}
            />
          </div>

          {/* PDF Viewer Split Screen */}
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigUpdated={handleConfigUpdated}
      />
    </div>
  );
}