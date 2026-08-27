import React, { useState, useEffect, useMemo } from 'react';
import 'katex/dist/katex.min.css';
import DocumentSidebar from './components/document/DocumentSidebar';
import ChatInterface from './components/chat/ChatInterface';
import DocumentWriter from './components/writer/DocumentWriter';
import CreateWorkspaceModal from './components/document/CreateWorkspaceModal';
import SettingsModal from './components/layout/SettingsModal';
import LiteratureReviewModal from './components/modals/LiteratureReviewModal';
import PdfViewer from './components/viewer/PdfViewer';
import { 
  getDocuments, 
  checkHealth, 
  generateLiteratureReviewAPI, 
  getChatSessions, 
  deleteChatSession,
  getCurrentUser,
  getSavedBYOKConfig,
  saveBYOKConfig
} from './services/api';
import { getSavedTheme, saveTheme } from './theme/constants';
import { AlertCircle, RefreshCw, MessageSquare, Columns2, PenTool } from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLitReviewOpen, setIsLitReviewOpen] = useState(false);

  // Active UI Theme (Odysseus, Gemini, ChatGPT, Claude, Discord)
  const [currentTheme, setCurrentTheme] = useState(() => getSavedTheme());

  // BYOK Discovered Models & Active Model Selection
  const [discoveredModels, setDiscoveredModels] = useState(() => getSavedBYOKConfig().discoveredModels);
  const [currentModel, setCurrentModel] = useState(() => getSavedBYOKConfig().activeModel);

  // Authentication & Current User State
  const [currentUser, setCurrentUser] = useState(null);

  // PDF Viewer split-screen state
  const [activePdf, setActivePdf] = useState(null);
  const [targetPage, setTargetPage] = useState(1);

  // Literature review generated content handler
  const [reviewTriggerMessage, setReviewTriggerMessage] = useState(null);

  // Workspaces state synced from backend & fallback to localStorage
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);

  // View Mode: 'chat' | 'split' | 'writer' (Odysseus-style assisted authoring canvas)
  const [viewMode, setViewMode] = useState('chat');

  // Apply theme on mount and when theme changes
  useEffect(() => {
    saveTheme(currentTheme);
  }, [currentTheme]);

  const handleThemeChange = (newTheme) => {
    setCurrentTheme(newTheme);
    saveTheme(newTheme);
  };

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
    } catch {
      // Graceful offline fallback
    }
  };

  const fetchDocs = async () => {
    try {
      const data = await getDocuments();
      setDocuments(data.documents || []);
    } catch {
      // Graceful offline fallback
    }
  };

  const checkStatus = async () => {
    const res = await checkHealth();
    setBackendStatus(res.status);
    if (res.status === 'healthy' || res.status === 'ok') {
      fetchDocs();
      syncUserData();
    }
  };

  useEffect(() => {
    checkStatus();
    fetchDocs();
    syncUserData();

    // Prompt user to configure API key on first visit if no models exist
    const cfg = getSavedBYOKConfig();
    if (!cfg.discoveredModels || cfg.discoveredModels.length === 0) {
      setIsSettingsOpen(true);
    }
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
    } catch {
      // Graceful error handling
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

  const handleGenerateLiteratureReview = async (config) => {
    return await generateLiteratureReviewAPI(config);
  };

  return (
    <div 
      data-theme={currentTheme}
      className="flex h-screen w-full bg-zinc-950 text-zinc-200 overflow-hidden font-sans transition-colors"
    >
      {/* 1. Left Sidebar with Theme Switcher */}
      <DocumentSidebar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onOpenCreateModal={() => setIsModalOpen(true)}
        onOpenLitReview={() => setIsLitReviewOpen(true)}
        onToggleWriter={() => setViewMode(viewMode === 'chat' ? 'split' : viewMode === 'split' ? 'writer' : 'chat')}
        onAuthChange={handleAuthChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
        currentTheme={currentTheme}
        onThemeChange={handleThemeChange}
      />

      {/* 2. Main Question / Research Interface Canvas */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Subtle offline alert bar if backend is disconnected */}
        {backendStatus === 'offline' && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between text-xs text-amber-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Backend server is offline (FastAPI port 8000). Start backend with <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-[11px] font-mono text-zinc-200">uvicorn backend.api.main:app --port 8000</code></span>
            </div>
            <button
              onClick={checkStatus}
              className="flex items-center gap-1 hover:text-white font-medium cursor-pointer transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Top Header Bar with Workspace Status & 3-Mode View Switcher */}
        <div className="h-10 border-b border-zinc-800/80 bg-zinc-950 px-4 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200 truncate max-w-xs">
              {activeWorkspace ? activeWorkspace.name : 'Workspace'}
            </span>
            {scopedDocuments.length > 0 && (
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                {scopedDocuments.length} doc{scopedDocuments.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* 3 View Mode Toggle Pills */}
          <div className="flex items-center bg-zinc-900/90 p-0.5 rounded-xl border border-zinc-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('chat');
                setActivePdf(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                viewMode === 'chat' && !activePdf
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Full Chat View"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('split');
                setActivePdf(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                viewMode === 'split' && !activePdf
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Split View: Research Chat + Document Writer"
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>Split View</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('writer');
                setActivePdf(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                viewMode === 'writer' && !activePdf
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Full Academic Writer View"
            >
              <PenTool className="h-3.5 w-3.5" />
              <span>Writer</span>
            </button>
          </div>
        </div>

        {/* Dynamic Workspace Work Canvas */}
        <div className="flex-1 flex h-full overflow-hidden">
          {/* Left Canvas: Chat Interface (in Chat or Split View) */}
          {viewMode !== 'writer' && (
            <div className={`h-full transition-all duration-300 ${
              activePdf || viewMode === 'split' ? 'w-1/2 border-r border-zinc-800' : 'w-full'
            }`}>
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
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </div>
          )}

          {/* Right Canvas: PDF Viewer OR Document Writer */}
          {activePdf ? (
            <div className="w-1/2 h-full bg-zinc-900">
              <PdfViewer
                activePdf={activePdf}
                targetPage={targetPage}
                onClose={() => setActivePdf(null)}
              />
            </div>
          ) : (
            (viewMode === 'split' || viewMode === 'writer') && (
              <div className={`${viewMode === 'writer' ? 'w-full' : 'w-1/2'} h-full transition-all duration-300`}>
                <DocumentWriter
                  sessionId={activeWorkspaceId}
                  documents={scopedDocuments}
                  availableModels={discoveredModels}
                  currentModel={currentModel}
                  onOpenPdfViewer={handleSelectCitation}
                />
              </div>
            )
          )}
        </div>
      </div>

      {/* Modals */}
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

      <LiteratureReviewModal
        isOpen={isLitReviewOpen}
        onClose={() => setIsLitReviewOpen(false)}
        documents={scopedDocuments}
        selectedDocs={selectedDocs}
        currentModel={currentModel}
        onGenerateReview={handleGenerateLiteratureReview}
      />
    </div>
  );
}