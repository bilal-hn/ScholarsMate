import React, { useState, useEffect, useMemo } from 'react';
import 'katex/dist/katex.min.css';
import DocumentSidebar from './components/document/DocumentSidebar';
import ChatInterface from './components/chat/ChatInterface';
import DocumentWriter from './components/writer/DocumentWriter';
import CreateWorkspaceModal from './components/document/CreateWorkspaceModal';
import SettingsModal from './components/layout/SettingsModal';
import LiteratureReviewModal from './components/modals/LiteratureReviewModal';
import ThemeModal from './components/modals/ThemeModal';
import GlobalSearchModal from './components/modals/GlobalSearchModal';
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
import AnimatedThemeCanvas from './components/theme/AnimatedThemeCanvas';
import { AlertCircle, RefreshCw, ChevronLeft, PanelLeftOpen } from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLitReviewOpen, setIsLitReviewOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Active UI Theme
  const [currentTheme, setCurrentTheme] = useState(() => getSavedTheme());

  // Global Cmd+K / Ctrl+K keyboard shortcut for Conversation Search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sidebar collapsed state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('scholarsmate_sidebar_collapsed') === 'true';
  });

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('scholarsmate_sidebar_collapsed', String(next));
      return next;
    });
  };

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

  // Assisted Academic Document Writer State (FR-13)
  const [isWriterOpen, setIsWriterOpen] = useState(false);
  const [isWriterFullscreen, setIsWriterFullscreen] = useState(false);
  const [openedWriterSessions, setOpenedWriterSessions] = useState(() => new Set());

  // Apply theme on mount and when theme changes
  useEffect(() => {
    saveTheme(currentTheme);
  }, [currentTheme]);

  const handleThemeChange = (newTheme) => {
    setCurrentTheme(newTheme);
    saveTheme(newTheme);
  };

  const handleToggleWriter = () => {
    if (!isWriterOpen) {
      setIsWriterOpen(true);
      setIsWriterFullscreen(false);
      setActivePdf(null);
      if (activeWorkspaceId) {
        setOpenedWriterSessions((prev) => new Set(prev).add(activeWorkspaceId));
      }
    } else {
      setIsWriterOpen(false);
      setIsWriterFullscreen(false);
    }
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

  const [targetMessageIndex, setTargetMessageIndex] = useState(null);

  const handleWorkspaceCreated = async (newWorkspace) => {
    await syncUserData();
    if (newWorkspace?.id) {
      setActiveWorkspaceId(newWorkspace.id);
    }
    await fetchDocs();
  };

  const handleSelectWorkspace = (workspaceOrId, messageIndex = null) => {
    const wsObj = typeof workspaceOrId === 'object' && workspaceOrId !== null
      ? workspaceOrId
      : workspaces.find((w) => w.id === workspaceOrId);

    const targetId = wsObj ? wsObj.id : (typeof workspaceOrId === 'string' ? workspaceOrId : null);
    if (!targetId) return;

    if (messageIndex !== null && messageIndex !== undefined) {
      setTargetMessageIndex(messageIndex);
    } else {
      setTargetMessageIndex(null);
    }

    setActiveWorkspaceId(targetId);
    if (wsObj?.documents && wsObj.documents.length > 0) {
      setSelectedDocs(wsObj.documents);
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

  // --------------------------------------------------------------------------
  // FULLSCREEN DOCUMENT WRITER VIEW (Zero sidebar, 100vw x 100vh)
  // --------------------------------------------------------------------------
  if (isWriterOpen && isWriterFullscreen) {
    return (
      <div 
        data-theme={currentTheme}
        className="fixed inset-0 z-50 h-screen w-screen bg-[#121316] text-zinc-100 overflow-hidden font-sans select-text"
      >
        <DocumentWriter
          sessionId={activeWorkspaceId}
          documents={scopedDocuments}
          availableModels={discoveredModels}
          currentModel={currentModel}
          onOpenPdfViewer={handleSelectCitation}
          isFullscreen={true}
          onToggleFullscreen={() => setIsWriterFullscreen(false)}
          onClose={() => {
            setIsWriterOpen(false);
            setIsWriterFullscreen(false);
          }}
        />

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

  return (
    <div 
      data-theme={currentTheme}
      className="flex h-screen w-full bg-zinc-950 text-zinc-200 overflow-hidden font-sans transition-colors relative"
    >
      {/* Background Animated Particles Engine (for Blaze & Aurora themes) */}
      <AnimatedThemeCanvas theme={currentTheme} />

      {/* 1. Left Sidebar with Theme Switcher */}
      <DocumentSidebar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onOpenCreateModal={() => setIsModalOpen(true)}
        onOpenLitReview={() => setIsLitReviewOpen(true)}
        onToggleWriter={handleToggleWriter}
        isWriterActive={isWriterOpen}
        onAuthChange={handleAuthChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      {/* 2. Main Question / Research Interface Canvas */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Floating Expand Sidebar Button when collapsed */}
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={handleToggleSidebar}
            title="Expand Sidebar"
            className="absolute top-3 left-3 z-40 p-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 rounded-xl shadow-xl text-zinc-400 hover:text-zinc-100 transition-all cursor-pointer backdrop-blur-md hover:scale-105"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* Subtle offline alert bar if backend is disconnected */}
        {backendStatus === 'offline' && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between text-xs text-amber-400 shrink-0">
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

        {/* Dynamic Workspace Work Canvas */}
        <div className="flex-1 flex h-full overflow-hidden relative">
          {/* Left Canvas: Chat Interface */}
          <div className={`h-full transition-all duration-300 ${
            activePdf || isWriterOpen ? 'w-1/2 border-r border-zinc-800' : 'w-full'
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
              hasWriterButton={activeWorkspaceId ? openedWriterSessions.has(activeWorkspaceId) && !isWriterOpen : false}
              onToggleWriter={handleToggleWriter}
              isSplitScreen={Boolean(activePdf || isWriterOpen)}
              targetMessageIndex={targetMessageIndex}
              onTargetMessageScrolled={() => setTargetMessageIndex(null)}
            />
          </div>

          {/* Right Canvas: PDF Viewer OR Split Document Writer */}
          {activePdf ? (
            <div className="w-1/2 h-full bg-zinc-900">
              <PdfViewer
                activePdf={activePdf}
                targetPage={targetPage}
                onClose={() => setActivePdf(null)}
              />
            </div>
          ) : (
            isWriterOpen && (
              <div className="w-1/2 h-full transition-all duration-300 relative overflow-visible">
                {/* Floating Expand Arrow positioned cleanly over the chat window boundary without getting cut off */}
                <button
                  type="button"
                  onClick={() => setIsWriterFullscreen(true)}
                  className="absolute top-1/2 -translate-y-1/2 -left-4 z-50 p-2 bg-[#18191c] hover:bg-[#282a2e] border border-zinc-700/90 rounded-full shadow-2xl text-zinc-300 hover:text-amber-300 transition-all cursor-pointer flex items-center justify-center hover:scale-110"
                  title="Expand to Fullscreen"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <DocumentWriter
                  key={activeWorkspaceId || 'global-writer'}
                  sessionId={activeWorkspaceId}
                  documents={scopedDocuments}
                  availableModels={discoveredModels}
                  currentModel={currentModel}
                  onOpenPdfViewer={handleSelectCitation}
                  isFullscreen={false}
                  onToggleFullscreen={() => setIsWriterFullscreen(true)}
                  onClose={() => {
                    setIsWriterOpen(false);
                    setIsWriterFullscreen(false);
                  }}
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

      <ThemeModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentTheme={currentTheme}
        onThemeChange={handleThemeChange}
      />

      <GlobalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        workspaces={workspaces}
        onSelectWorkspace={handleSelectWorkspace}
      />
    </div>
  );
}