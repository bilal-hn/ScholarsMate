import React, { useState, useEffect, useMemo, useCallback } from 'react';
import 'katex/dist/katex.min.css';
import DocumentSidebar from './components/document/DocumentSidebar';
import ChatInterface from './components/chat/ChatInterface';
import DocumentWriter from './components/writer/DocumentWriter';
import CreateWorkspaceModal from './components/document/CreateWorkspaceModal';
import SettingsModal from './components/layout/SettingsModal';
import TopNavbar from './components/layout/TopNavbar';
import LiteratureReviewModal from './components/modals/LiteratureReviewModal';
import ThemeModal from './components/modals/ThemeModal';
import GlobalSearchModal from './components/modals/GlobalSearchModal';
import BrainModal from './components/modals/BrainModal';
import AuthModal from './components/modals/AuthModal';
import PdfViewer from './components/viewer/PdfViewer';
import ProfileSettingsModal from './components/layout/ProfileSettingsModal';
import { 
  getDocuments, 
  checkHealth, 
  generateLiteratureReviewAPI, 
  getChatSessions, 
  deleteChatSession,
  getWorkspacesAPI,
  createWorkspaceChatAPI,
  deleteWorkspaceAPI,
  renameWorkspaceAPI,
  renameChatSessionAPI,
  addPapersToWorkspace,
  getCurrentUser,
  getSavedBYOKConfig,
  saveBYOKConfig
} from './services/api';
import { getSavedTheme, saveTheme } from './theme/constants';
import AnimatedThemeCanvas from './components/theme/AnimatedThemeCanvas';
import { AlertCircle, RefreshCw, ChevronLeft } from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isLitReviewOpen, setIsLitReviewOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isBrainModalOpen, setIsBrainModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');

  const handleOpenAuth = (mode = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

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

  // Workspaces & Sessions state
  const [workspaces, setWorkspaces] = useState([]);
  const [standaloneChats, setStandaloneChats] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);

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
      if (activeSessionId) {
        setOpenedWriterSessions((prev) => new Set(prev).add(activeSessionId));
      }
    } else {
      setIsWriterOpen(false);
      setIsWriterFullscreen(false);
    }
  };

  const handleDismissWriterBadge = () => {
    if (activeSessionId) {
      setOpenedWriterSessions((prev) => {
        const next = new Set(prev);
        next.delete(activeSessionId);
        return next;
      });
    }
  };

  // --------------------------------------------------------------------------
  // USER IDENTITY & WORKSPACE SYNC
  // --------------------------------------------------------------------------
  const syncUserData = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);

      const [fetchedWorkspaces, fetchedStandalone] = await Promise.all([
        getWorkspacesAPI(),
        getChatSessions(true),
      ]);

      const wsList = fetchedWorkspaces || [];
      const standList = fetchedStandalone || [];

      setWorkspaces(wsList);
      setStandaloneChats(standList);

      // Reconcile saved active workspace & chat session
      const savedWsId = localStorage.getItem('scholarsmate_active_workspace_id');
      const savedSessionId = localStorage.getItem('scholarsmate_active_session_id');

      const matchedWs = wsList.find((w) => w.id === savedWsId);
      if (matchedWs) {
        setActiveWorkspaceId(matchedWs.id);
        const matchedChat = (matchedWs.chats || []).find((c) => c.id === savedSessionId);
        if (matchedChat) {
          setActiveSessionId(matchedChat.id);
        } else if (matchedWs.chats && matchedWs.chats.length > 0) {
          setActiveSessionId(matchedWs.chats[0].id);
        } else {
          setActiveSessionId(null);
        }
      } else {
        const matchedStandalone = standList.find((s) => s.id === savedSessionId);
        if (matchedStandalone) {
          setActiveWorkspaceId(null);
          setActiveSessionId(matchedStandalone.id);
        } else if (wsList.length > 0) {
          const firstWs = wsList[0];
          setActiveWorkspaceId(firstWs.id);
          setActiveSessionId(firstWs.chats?.[0]?.id || null);
        } else if (standList.length > 0) {
          setActiveWorkspaceId(null);
          setActiveSessionId(standList[0].id);
        } else {
          setActiveWorkspaceId(null);
          setActiveSessionId(null);
        }
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
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem('scholarsmate_active_workspace_id', activeWorkspaceId);
    } else {
      localStorage.removeItem('scholarsmate_active_workspace_id');
    }
    if (activeSessionId) {
      localStorage.setItem('scholarsmate_active_session_id', activeSessionId);
    } else {
      localStorage.removeItem('scholarsmate_active_session_id');
    }
  }, [activeWorkspaceId, activeSessionId]);

  // Handle Google OAuth login or logout
  const handleAuthChange = async () => {
    setActiveWorkspaceId(null);
    setActiveSessionId(null);
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

  // Scoped documents: Workspace documents + any actively attached selectedDocs
  const scopedDocuments = useMemo(() => {
    const activeDocNames = activeWorkspace?.doc_names || [];
    const combinedSet = new Set([...activeDocNames, ...selectedDocs]);
    if (combinedSet.size === 0) return [];

    const docMap = new Map(documents.map((d) => [d.doc_name, d]));
    return Array.from(combinedSet).map((name) => 
      docMap.get(name) || { doc_name: name, chunk_count: 0 }
    );
  }, [documents, activeWorkspace, selectedDocs]);

  // Strict Selection: Sync selected docs with active workspace documents
  useEffect(() => {
    if (activeWorkspace && activeWorkspace.doc_names) {
      setSelectedDocs(activeWorkspace.doc_names);
    } else {
      setSelectedDocs([]);
    }
  }, [activeWorkspace]);

  const handleDocumentUploaded = async (newDocNames) => {
    await fetchDocs();
    const namesArray = Array.isArray(newDocNames) ? newDocNames : [newDocNames];
    if (activeWorkspaceId) {
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === activeWorkspaceId
            ? {
                ...ws,
                doc_names: Array.from(new Set([...(ws.doc_names || []), ...namesArray])),
              }
            : ws
        )
      );
    }
  };

  const [targetMessageIndex, setTargetMessageIndex] = useState(null);

  const handleWorkspaceCreated = async (newWsData) => {
    await syncUserData();
    if (newWsData?.workspace_id) {
      setActiveWorkspaceId(newWsData.workspace_id);
      setActiveSessionId(newWsData.session_id || null);
    }
    await fetchDocs();
  };

  const handleSelectWorkspaceChat = (workspaceId, sessionId, messageIndex = null) => {
    if (messageIndex !== null && messageIndex !== undefined) {
      setTargetMessageIndex(messageIndex);
    } else {
      setTargetMessageIndex(null);
    }

    setActiveWorkspaceId(workspaceId);
    setActiveSessionId(sessionId);

    const wsObj = workspaces.find((w) => w.id === workspaceId);
    if (wsObj?.doc_names && wsObj.doc_names.length > 0) {
      setSelectedDocs(wsObj.doc_names);
    } else {
      setSelectedDocs([]);
    }
  };

  const handleSelectStandaloneChat = (sessionId, messageIndex = null) => {
    if (messageIndex !== null && messageIndex !== undefined) {
      setTargetMessageIndex(messageIndex);
    } else {
      setTargetMessageIndex(null);
    }

    setActiveWorkspaceId(null);
    setActiveSessionId(sessionId);
    setSelectedDocs([]);
  };

  const handleAddWorkspaceChat = async (workspaceId) => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    const currentChats = ws.chats || [];
    if (currentChats.length >= 3) {
      alert('Maximum 3 chats allowed per workspace.');
      return;
    }

    try {
      const nextChatNum = currentChats.length + 1;
      const newChat = await createWorkspaceChatAPI(workspaceId, `Chat ${nextChatNum}`);
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === workspaceId
            ? { ...w, chats: [...(w.chats || []), newChat] }
            : w
        )
      );
      setActiveWorkspaceId(workspaceId);
      setActiveSessionId(newChat.id);
    } catch (err) {
      console.error('Failed to add chat to workspace:', err);
      alert(err.response?.data?.detail || 'Failed to create chat in workspace.');
    }
  };

  const handleDeleteWorkspace = async (workspaceId) => {
    if (!window.confirm('Delete this workspace and all its chats?')) return;
    try {
      await deleteWorkspaceAPI(workspaceId);
      const updated = workspaces.filter((ws) => ws.id !== workspaceId);
      setWorkspaces(updated);
      if (activeWorkspaceId === workspaceId) {
        if (updated.length > 0) {
          setActiveWorkspaceId(updated[0].id);
          setActiveSessionId(updated[0].chats?.[0]?.id || null);
        } else if (standaloneChats.length > 0) {
          setActiveWorkspaceId(null);
          setActiveSessionId(standaloneChats[0].id);
        } else {
          setActiveWorkspaceId(null);
          setActiveSessionId(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

  const handleDeleteChat = async (sessionId, workspaceId = null) => {
    if (!window.confirm('Delete this chat thread?')) return;
    try {
      await deleteChatSession(sessionId);
      if (workspaceId) {
        setWorkspaces((prev) =>
          prev.map((w) => {
            if (w.id === workspaceId) {
              const remaining = (w.chats || []).filter((c) => c.id !== sessionId);
              return { ...w, chats: remaining };
            }
            return w;
          })
        );
        if (activeSessionId === sessionId) {
          const currentWs = workspaces.find((w) => w.id === workspaceId);
          const otherChat = (currentWs?.chats || []).find((c) => c.id !== sessionId);
          if (otherChat) {
            setActiveSessionId(otherChat.id);
          } else {
            setActiveSessionId(null);
          }
        }
      } else {
        const updated = standaloneChats.filter((s) => s.id !== sessionId);
        setStandaloneChats(updated);
        if (activeSessionId === sessionId) {
          setActiveSessionId(updated.length > 0 ? updated[0].id : null);
        }
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleRenameWorkspace = async (workspaceId, newName) => {
    if (!newName || !newName.trim()) return;
    try {
      await renameWorkspaceAPI(workspaceId, newName.trim());
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === workspaceId ? { ...w, name: newName.trim() } : w))
      );
    } catch (err) {
      console.error('Failed to rename workspace:', err);
    }
  };

  const handleRenameChat = async (sessionId, newTitle, workspaceId = null) => {
    if (!newTitle || !newTitle.trim()) return;
    try {
      await renameChatSessionAPI(sessionId, newTitle.trim());
      if (workspaceId) {
        setWorkspaces((prev) =>
          prev.map((w) => {
            if (w.id === workspaceId) {
              return {
                ...w,
                chats: (w.chats || []).map((c) =>
                  c.id === sessionId ? { ...c, title: newTitle.trim() } : c
                ),
              };
            }
            return w;
          })
        );
      } else {
        setStandaloneChats((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, title: newTitle.trim() } : s
          )
        );
      }
    } catch (err) {
      console.error('Failed to rename chat:', err);
    }
  };

  const handleAddPapersToWorkspace = async (workspaceId, files) => {
    if (!files || files.length === 0) return;
    try {
      const res = await addPapersToWorkspace(workspaceId, files);
      await fetchDocs();
      if (res && res.doc_names) {
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === workspaceId ? { ...w, doc_names: res.doc_names } : w))
        );
        if (activeWorkspaceId === workspaceId) {
          setSelectedDocs(res.doc_names);
        }
      } else {
        await syncUserData();
      }
    } catch (err) {
      console.error('Failed to add papers to workspace:', err);
      alert(err.response?.data?.detail || 'Failed to upload papers.');
    }
  };

  const handleDeleteCurrentChat = async () => {
    if (activeSessionId) {
      await handleDeleteChat(activeSessionId, activeWorkspaceId);
      window.dispatchEvent(new CustomEvent('scholarsmate:clear-chat'));
    } else {
      if (window.confirm('Clear all messages in this chat?')) {
        window.dispatchEvent(new CustomEvent('scholarsmate:clear-chat'));
      }
    }
  };

  const handleNewChat = () => {
    setActiveWorkspaceId(null);
    setActiveSessionId(null);
    setSelectedDocs([]);
    setActivePdf(null);
    setIsWriterOpen(false);
    window.dispatchEvent(new CustomEvent('scholarsmate:clear-chat'));
  };

  const handleSessionCreated = async (newSessionId) => {
    setActiveSessionId(newSessionId);
    await syncUserData();
  };

  const handleSelectCitation = useCallback((docName, pageNum) => {
    setActivePdf(docName);
    setTargetPage(pageNum || 1);
  }, []);

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
          sessionId={activeSessionId}
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

      {/* 1. Left Sidebar with Nested Workspaces (Max 3 Chats) and Standalone History */}
      <DocumentSidebar
        currentUser={currentUser}
        workspaces={workspaces}
        standaloneChats={standaloneChats}
        activeWorkspaceId={activeWorkspaceId}
        activeSessionId={activeSessionId}
        onSelectWorkspaceChat={handleSelectWorkspaceChat}
        onSelectStandaloneChat={handleSelectStandaloneChat}
        onAddWorkspaceChat={handleAddWorkspaceChat}
        onDeleteWorkspace={handleDeleteWorkspace}
        onDeleteChat={handleDeleteChat}
        onRenameWorkspace={handleRenameWorkspace}
        onRenameChat={handleRenameChat}
        onAddPapersToWorkspace={handleAddPapersToWorkspace}
        onOpenCreateModal={() => setIsModalOpen(true)}
        onNewChat={handleNewChat}
        onOpenLitReview={() => setIsLitReviewOpen(true)}
        onOpenBrainModal={() => setIsBrainModalOpen(true)}
        onToggleWriter={handleToggleWriter}
        isWriterActive={isWriterOpen}
        onAuthChange={handleAuthChange}
        onOpenAuth={handleOpenAuth}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenProfileSettings={() => setIsProfileSettingsOpen(true)}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      {/* 2. Main Question / Research Interface Canvas */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
        {/* Top Navigation Bar */}
        <TopNavbar
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
          currentUser={currentUser}
          onOpenAuth={handleOpenAuth}
          onDeleteChat={handleDeleteCurrentChat}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

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
              sessionId={activeSessionId}
              workspaceId={activeWorkspaceId}
              availableModels={discoveredModels}
              currentModel={currentModel}
              onModelChange={handleModelChange}
              onOpenSettings={() => setIsSettingsOpen(true)}
              hasWriterButton={activeSessionId ? openedWriterSessions.has(activeSessionId) && !isWriterOpen : false}
              onToggleWriter={handleToggleWriter}
              onDismissWriterBadge={handleDismissWriterBadge}
              isSplitScreen={Boolean(activePdf || isWriterOpen)}
              targetMessageIndex={targetMessageIndex}
              onTargetMessageScrolled={() => setTargetMessageIndex(null)}
              onSessionCreated={handleSessionCreated}
              onDocumentUploaded={handleDocumentUploaded}
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
                {/* Floating Expand Arrow positioned cleanly over the chat window boundary */}
                <button
                  type="button"
                  onClick={() => setIsWriterFullscreen(true)}
                  className="absolute top-1/2 -translate-y-1/2 -left-4 z-50 p-2 bg-[#18191c] hover:bg-[#282a2e] border border-zinc-700/90 rounded-full shadow-2xl text-zinc-300 hover:text-amber-300 transition-all cursor-pointer flex items-center justify-center hover:scale-110"
                  title="Expand to Fullscreen"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <DocumentWriter
                  key={activeSessionId || 'global-writer'}
                  sessionId={activeSessionId}
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

      <ProfileSettingsModal
        isOpen={isProfileSettingsOpen}
        onClose={() => setIsProfileSettingsOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={handleAuthChange}
        onLogout={handleAuthChange}
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
        standaloneChats={standaloneChats}
        onSelectWorkspace={handleSelectWorkspaceChat}
        onSelectStandaloneChat={handleSelectStandaloneChat}
      />

      <BrainModal
        isOpen={isBrainModalOpen}
        onClose={() => setIsBrainModalOpen(false)}
        activeWorkspaceId={activeWorkspaceId}
        workspaces={workspaces}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthChange}
      />
    </div>
  );
}