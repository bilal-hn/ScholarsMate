import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  Brain, 
  Trash2, 
  BookOpen, 
  PenTool, 
  Palette, 
  PanelLeftClose, 
  PanelLeftOpen, 
  SquarePen, 
  History, 
  ChevronDown, 
  ChevronRight, 
  MessageSquare, 
  Plus,
  Folder,
  FolderOpen,
  MoreVertical,
  FileUp,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import AppLogo from '../common/AppLogo';
import { AuthProfile } from '../layout/AuthProfile';
import { APP_CONFIG } from '../../theme/constants';

export default function DocumentSidebar({
  currentUser,
  workspaces = [],
  standaloneChats = [],
  activeWorkspaceId,
  activeSessionId,
  onSelectWorkspaceChat,
  onSelectStandaloneChat,
  onAddWorkspaceChat,
  onDeleteWorkspace,
  onDeleteChat,
  onRenameWorkspace,
  onRenameChat,
  onAddPapersToWorkspace,
  onOpenCreateModal,
  onNewChat,
  onOpenLitReview,
  onOpenBrainModal,
  onToggleWriter,
  isWriterActive = false,
  onAuthChange,
  onOpenAuth,
  onOpenSettings,
  onOpenProfileSettings,
  onOpenThemeModal,
  onOpenSearchModal,
  isCollapsed = false,
  onToggleCollapse,
}) {
  const [isRecentOpen, setIsRecentOpen] = useState(true);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(() => new Set());

  // Inline rename state
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editWorkspaceName, setEditWorkspaceName] = useState('');
  const [editingChatId, setEditingChatId] = useState(null);
  const [editChatTitle, setEditChatTitle] = useState('');

  // Floating Context Menu state: { type: 'workspace' | 'chat', id, parentId, x, y }
  const [menuState, setMenuState] = useState(null);
  const [targetWorkspaceForUpload, setTargetWorkspaceForUpload] = useState(null);

  const fileInputRef = useRef(null);
  const renameInputRef = useRef(null);

  // Auto-expand all workspaces on load and when new workspaces are added
  useEffect(() => {
    if (workspaces && workspaces.length > 0) {
      setExpandedWorkspaces((prev) => {
        const next = new Set(prev);
        workspaces.forEach((w) => next.add(w.id));
        return next;
      });
    }
  }, [workspaces]);

  // Aggregate top 3–5 most active chats across all workspaces and standalone chats
  const recentActivityChats = useMemo(() => {
    const all = [];
    (workspaces || []).forEach((ws) => {
      (ws.chats || []).forEach((chat) => {
        all.push({
          ...chat,
          workspaceId: ws.id,
          workspaceName: ws.name,
        });
      });
    });
    (standaloneChats || []).forEach((s) => {
      all.push({
        ...s,
        workspaceId: null,
        workspaceName: null,
      });
    });
    return all
      .sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [workspaces, standaloneChats]);

  const handleSelectRecentChat = (chat) => {
    if (chat.workspaceId) {
      setExpandedWorkspaces((prev) => {
        const next = new Set(prev);
        next.add(chat.workspaceId);
        return next;
      });
      onSelectWorkspaceChat?.(chat.workspaceId, chat.id);
    } else {
      onSelectStandaloneChat?.(chat.id);
    }
  };

  // Close floating context menu on click outside or escape key
  useEffect(() => {
    if (!menuState) return;

    const handleClickOutside = () => setMenuState(null);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMenuState(null);
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState]);

  // Focus rename input on start
  useEffect(() => {
    if (editingWorkspaceId || editingChatId) {
      setTimeout(() => renameInputRef.current?.select(), 40);
    }
  }, [editingWorkspaceId, editingChatId]);

  const toggleWorkspaceExpanded = (wsId) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(wsId)) {
        next.delete(wsId);
      } else {
        next.add(wsId);
      }
      return next;
    });
  };

  // Open 3-dots menu
  const handleOpenThreeDots = (e, type, id, parentId = null) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuState({
      type,
      id,
      parentId,
      x: Math.max(10, Math.min(rect.right - 160, window.innerWidth - 175)),
      y: Math.min(rect.bottom + 4, window.innerHeight - 150),
    });
  };

  // Open right-click context menu
  const handleContextMenu = (e, type, id, parentId = null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({
      type,
      id,
      parentId,
      x: Math.max(10, Math.min(e.clientX, window.innerWidth - 175)),
      y: Math.min(e.clientY, window.innerHeight - 150),
    });
  };

  // Trigger file upload for workspace
  const handleTriggerAddPaper = (wsId) => {
    setTargetWorkspaceForUpload(wsId);
    setMenuState(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFilesSelected = (e) => {
    if (e.target.files && e.target.files.length > 0 && targetWorkspaceForUpload) {
      onAddPapersToWorkspace?.(targetWorkspaceForUpload, e.target.files);
    }
    setTargetWorkspaceForUpload(null);
  };

  // Start inline rename
  const startWorkspaceRename = (ws) => {
    setMenuState(null);
    setEditingChatId(null);
    setEditingWorkspaceId(ws.id);
    setEditWorkspaceName(ws.name);
  };

  const handleSaveWorkspaceRename = (wsId) => {
    const trimmed = editWorkspaceName.trim();
    if (trimmed && trimmed !== workspaces.find((w) => w.id === wsId)?.name) {
      onRenameWorkspace?.(wsId, trimmed);
    }
    setEditingWorkspaceId(null);
  };

  const startChatRename = (chat, workspaceId = null) => {
    setMenuState(null);
    setEditingWorkspaceId(null);
    setEditingChatId(chat.id);
    setEditChatTitle(chat.title || 'Chat');
  };

  const handleSaveChatRename = (chatId, workspaceId = null) => {
    const trimmed = editChatTitle.trim();
    if (trimmed) {
      onRenameChat?.(chatId, trimmed, workspaceId);
    }
    setEditingChatId(null);
  };

  return (
    <aside className={`bg-zinc-900/90 border-r border-zinc-800/80 flex flex-col h-full shrink-0 select-none text-zinc-300 font-sans transition-[width] duration-200 relative z-40 overflow-visible ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Hidden File Input for Workspace Paper Addition */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf"
        className="hidden"
        onChange={handleFilesSelected}
      />

      {/* Floating Three-Dots & Right-Click Context Menu (Fixed to avoid overflow clipping) */}
      {menuState && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ top: menuState.y, left: menuState.x }}
          className="fixed z-50 w-44 bg-zinc-900/95 border border-zinc-800 rounded-xl shadow-2xl p-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 text-xs font-medium text-zinc-300"
        >
          {menuState.type === 'workspace' && (
            <>
              <button
                type="button"
                onClick={() => handleTriggerAddPaper(menuState.id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-amber-300 hover:bg-zinc-800/70 transition-colors cursor-pointer text-left"
              >
                <FileUp className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>Add Papers</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const ws = workspaces.find((w) => w.id === menuState.id);
                  if (ws) startWorkspaceRename(ws);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer text-left"
              >
                <Edit3 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span>Rename Workspace</span>
              </button>

              <div className="h-px bg-zinc-800/80 my-1" />

              <button
                type="button"
                onClick={() => {
                  const wsId = menuState.id;
                  setMenuState(null);
                  onDeleteWorkspace?.(wsId);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>Delete Workspace</span>
              </button>
            </>
          )}

          {menuState.type === 'chat' && (
            <>
              <button
                type="button"
                onClick={() => {
                  let foundChat = null;
                  if (menuState.parentId) {
                    const ws = workspaces.find((w) => w.id === menuState.parentId);
                    foundChat = (ws?.chats || []).find((c) => c.id === menuState.id);
                  } else {
                    foundChat = standaloneChats.find((s) => s.id === menuState.id);
                  }
                  if (!foundChat) {
                    foundChat = recentActivityChats.find((c) => c.id === menuState.id);
                  }
                  if (foundChat) startChatRename(foundChat, menuState.parentId || foundChat.workspaceId);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer text-left"
              >
                <Edit3 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span>Rename Chat</span>
              </button>

              <div className="h-px bg-zinc-800/80 my-1" />

              <button
                type="button"
                onClick={() => {
                  const chatId = menuState.id;
                  const parentId = menuState.parentId || recentActivityChats.find((c) => c.id === chatId)?.workspaceId || null;
                  setMenuState(null);
                  onDeleteChat?.(chatId, parentId);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>Delete Chat</span>
              </button>
            </>
          )}
        </div>
      )}

      {isCollapsed ? (
        /* Collapsed Rail View */
        <div className="flex flex-col items-center justify-between h-full py-3.5 w-full">
          {/* Top Section: System Logo + Feature Navigation Icons */}
          <div className="flex flex-col items-center w-full">
            {/* Top Brand / Sidebar Toggle: Logo changes to PanelLeftOpen on hover */}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="relative group p-2 rounded-xl text-amber-500 hover:bg-zinc-800/80 transition-all cursor-pointer flex items-center justify-center"
              aria-label="Open sidebar"
            >
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 group-hover:border-amber-500/40 transition-all">
                <AppLogo className="h-4.5 w-4.5 block group-hover:hidden transition-all text-amber-500" />
                <PanelLeftOpen className="h-4.5 w-4.5 hidden group-hover:block transition-all text-zinc-200" />
              </div>
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[12.5px] font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                Open sidebar
              </span>
            </button>

            {/* Feature Navigation Icons */}
            <div className="flex flex-col items-center gap-1.5 w-full px-2 mt-4">
              {/* New Chat */}
              <button
                type="button"
                onClick={onNewChat}
                className="relative group p-2.5 rounded-xl text-amber-400 hover:text-amber-300 hover:bg-zinc-800/70 transition-all cursor-pointer flex items-center justify-center"
                aria-label="New chat"
              >
                <SquarePen className="h-4.5 w-4.5 stroke-[2.2]" />
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[12.5px] font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  New chat
                </span>
              </button>

              {/* Search */}
              <button
                type="button"
                onClick={onOpenSearchModal}
                className="relative group p-2.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-all cursor-pointer flex items-center justify-center"
                aria-label="Search"
              >
                <Search className="h-4.5 w-4.5" />
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[12.5px] font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  Search
                </span>
              </button>

              {/* Brain */}
              {onOpenBrainModal && (
                <button
                  type="button"
                  onClick={onOpenBrainModal}
                  className="relative group p-2.5 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/70 transition-all cursor-pointer flex items-center justify-center"
                  aria-label="Brain"
                >
                  <Brain className="h-4.5 w-4.5" />
                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[12.5px] font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                    Brain
                  </span>
                </button>
              )}

              {/* Literature Review Studio */}
              <button
                type="button"
                onClick={onOpenLitReview}
                className="relative group p-2.5 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/70 transition-all cursor-pointer flex items-center justify-center"
                aria-label="Literature Review Studio"
              >
                <BookOpen className="h-4.5 w-4.5" />
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[12.5px] font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  Literature Review Studio
                </span>
              </button>

              {/* Academic Document Writer */}
              {onToggleWriter && (
                <button
                  type="button"
                  onClick={onToggleWriter}
                  className={`relative group p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                    isWriterActive
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/70'
                  }`}
                  aria-label="Academic Writer"
                >
                  <PenTool className="h-4.5 w-4.5" />
                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[12.5px] font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                    Academic Writer
                  </span>
                </button>
              )}

              {/* Theme */}
              <button
                type="button"
                onClick={onOpenThemeModal}
                className="relative group p-2.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-all cursor-pointer flex items-center justify-center"
                aria-label="Theme"
              >
                <Palette className="h-4.5 w-4.5" />
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[12.5px] font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  Theme
                </span>
              </button>

              {/* History shortcut */}
              {recentActivityChats.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleCollapse();
                    setIsRecentOpen(true);
                  }}
                  className="relative group p-2.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-all cursor-pointer flex items-center justify-center"
                  aria-label="Recent Activity"
                >
                  <History className="h-4.5 w-4.5" />
                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[12.5px] font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                    Recent Activity
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Bottom Section: User Profile Avatar */}
          <div className="flex flex-col items-center w-full px-2 pt-3 border-t border-zinc-800/50 relative">
            <AuthProfile
              isCollapsed={true}
              currentUser={currentUser}
              onAuthChange={onAuthChange}
              onOpenAuth={onOpenAuth}
              onOpenSettings={onOpenSettings}
              onOpenProfileSettings={onOpenProfileSettings}
            />
          </div>
        </div>
      ) : (
        /* Full Sidebar View */
        <>
          {/* Top Brand Header */}
          <div className="px-4 pt-4 pb-3 flex items-center justify-between">
            <div 
              onClick={onToggleCollapse}
              title="Collapse Sidebar"
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <div className="h-6 w-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover:bg-amber-500/20 transition-colors">
                <AppLogo className="h-4 w-4 block group-hover:hidden transition-all text-amber-500" />
                <PanelLeftClose className="h-4 w-4 hidden group-hover:block transition-all text-zinc-200" />
              </div>
              <span className="font-semibold text-zinc-100 text-sm tracking-tight group-hover:text-amber-400 transition-colors">
                {APP_CONFIG.name}
              </span>
            </div>

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse Sidebar"
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Primary Navigation Actions */}
          <div className="px-2 py-2 space-y-0.5 border-b border-zinc-800/40">
            {/* "+ New Chat" Action */}
            <button
              type="button"
              onClick={onNewChat}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-semibold text-amber-400 hover:text-amber-300 hover:bg-zinc-800/50 transition-colors cursor-pointer group text-left"
            >
              <SquarePen className="h-4 w-4 stroke-[2.2] group-hover:scale-110 transition-transform" />
              <span>New Chat</span>
            </button>

            {/* Global Search Modal Navigation Item */}
            <button
              type="button"
              onClick={onOpenSearchModal}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13.5px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition-colors cursor-pointer text-left group"
            >
              <Search className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              <span>Search</span>
            </button>

            {/* Brain Memory Studio Navigation Item */}
            {onOpenBrainModal && (
              <button
                type="button"
                onClick={onOpenBrainModal}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13.5px] text-zinc-400 hover:text-red-400 hover:bg-zinc-800/30 transition-colors cursor-pointer group text-left"
              >
                <Brain className="h-3.5 w-3.5 text-zinc-500 group-hover:text-red-400 transition-colors" />
                <span>Brain</span>
              </button>
            )}

            {/* Literature Review Studio Navigation Item */}
            <button
              type="button"
              onClick={onOpenLitReview}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13.5px] text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/30 transition-colors cursor-pointer group text-left"
            >
              <BookOpen className="h-3.5 w-3.5 text-zinc-500 group-hover:text-amber-400 transition-colors" />
              <span>Literature Review Studio</span>
            </button>

            {/* Academic Document Writer Navigation Item */}
            {onToggleWriter && (
              <button
                type="button"
                onClick={onToggleWriter}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13.5px] transition-colors cursor-pointer group text-left ${
                  isWriterActive
                    ? 'bg-amber-500/15 text-amber-300 font-medium border border-amber-500/30'
                    : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/30'
                }`}
              >
                <PenTool className={`h-3.5 w-3.5 ${isWriterActive ? 'text-amber-400' : 'text-zinc-500 group-hover:text-amber-400'} transition-colors`} />
                <span>Academic Writer</span>
              </button>
            )}

            {/* Theme Selector Navigation Item */}
            <button
              type="button"
              onClick={onOpenThemeModal}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13.5px] transition-colors cursor-pointer text-left text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
            >
              <Palette className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              <span>Theme</span>
            </button>
          </div>

          {/* Workspaces & Recent Activity Tree */}
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
            {/* RECENT ACTIVITY SECTION (Top 3-5 Active Chats Across All Workspaces) */}
            {recentActivityChats.length > 0 && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setIsRecentOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors uppercase cursor-pointer text-left"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <History className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">Recent Activity</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-zinc-500">
                    <span className="text-[10px] font-mono font-normal text-zinc-400 bg-zinc-800/70 px-1.5 py-0.5 rounded-full">
                      {recentActivityChats.length}
                    </span>
                    {isRecentOpen ? (
                      <ChevronDown className="h-3 w-3 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-zinc-400" />
                    )}
                  </div>
                </button>

                {isRecentOpen && (
                  <div className="space-y-0.5">
                    {recentActivityChats.map((chat) => {
                      const isActive = activeSessionId === chat.id;
                      const isEditingThisChat = editingChatId === chat.id;

                      return (
                        <div
                          key={chat.id}
                          onClick={() => handleSelectRecentChat(chat)}
                          onContextMenu={(e) => handleContextMenu(e, 'chat', chat.id, chat.workspaceId)}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors relative border-l-2 ${
                            isActive
                              ? 'bg-amber-500/15 text-amber-300 font-medium border-amber-400'
                              : 'border-transparent hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate min-w-0 pr-1 flex-1">
                            <MessageSquare
                              className={`h-3.5 w-3.5 shrink-0 ${
                                isActive ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-100'
                              }`}
                            />

                            {isEditingThisChat ? (
                              <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                                <input
                                  ref={renameInputRef}
                                  type="text"
                                  value={editChatTitle}
                                  onChange={(e) => setEditChatTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveChatRename(chat.id, chat.workspaceId);
                                    if (e.key === 'Escape') setEditingChatId(null);
                                  }}
                                  onBlur={() => handleSaveChatRename(chat.id, chat.workspaceId)}
                                  className="w-full bg-zinc-950 border border-amber-500/80 rounded px-1.5 py-0.5 text-xs text-zinc-100 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveChatRename(chat.id, chat.workspaceId)}
                                  className="p-0.5 text-emerald-400 hover:text-emerald-300"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col min-w-0 flex-1 truncate">
                                <span
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    startChatRename(chat, chat.workspaceId);
                                  }}
                                  className="truncate text-[12.5px] select-none"
                                  title={chat.title || 'Chat'}
                                >
                                  {chat.title || 'Chat'}
                                </span>
                                {chat.workspaceName && (
                                  <span className="text-[10px] text-zinc-500 truncate leading-tight mt-0.5 flex items-center gap-1">
                                    <Folder className="h-2.5 w-2.5 text-amber-400/60 shrink-0" />
                                    <span className="truncate">{chat.workspaceName}</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Chat Row Actions: Three Dots Menu */}
                          <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleOpenThreeDots(e, 'chat', chat.id, chat.workspaceId)}
                              title="Chat options"
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-opacity cursor-pointer"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* WORKSPACES SECTION */}
            <div className="space-y-1.5">
              <div className="px-2 py-1 text-xs font-semibold tracking-wider text-zinc-500 flex items-center justify-between uppercase">
                <span>Workspaces</span>
                {onOpenCreateModal && (
                  <button
                    type="button"
                    onClick={onOpenCreateModal}
                    title="Create New Workspace"
                    className="text-zinc-400 hover:text-amber-400 px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>New</span>
                  </button>
                )}
              </div>

              {workspaces.length === 0 ? (
                <div className="px-3 py-6 rounded-xl border border-dashed border-zinc-800/80 text-center flex flex-col items-center justify-center bg-zinc-950/20">
                  <p className="text-xs text-zinc-400 mb-2.5">No workspaces yet</p>
                  {onOpenCreateModal && (
                    <button
                      type="button"
                      onClick={onOpenCreateModal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs shadow-md shadow-amber-950/30 transition-all cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                      <span>Create Workspace</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {workspaces.map((ws) => {
                    const isExpanded = expandedWorkspaces.has(ws.id);
                    const chats = ws.chats || [];
                    const chatCount = chats.length;
                    const isCurrentWorkspace = ws.id === activeWorkspaceId;
                    const isEditingThisWs = editingWorkspaceId === ws.id;

                    return (
                      <div key={ws.id} className="rounded-xl overflow-hidden bg-zinc-950/40 border border-zinc-800/60">
                        {/* Workspace Root Header Row */}
                        <div
                          onClick={() => toggleWorkspaceExpanded(ws.id)}
                          onContextMenu={(e) => handleContextMenu(e, 'workspace', ws.id)}
                          className={`group flex items-center justify-between px-2.5 py-2 cursor-pointer transition-colors relative ${
                            isCurrentWorkspace
                              ? 'bg-zinc-800/50 text-zinc-100 font-medium'
                              : 'text-zinc-300 hover:bg-zinc-800/30 hover:text-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate min-w-0 pr-1 flex-1">
                            <span className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </span>
                            {isExpanded ? (
                              <FolderOpen className="h-4 w-4 text-amber-400/90 shrink-0" />
                            ) : (
                              <Folder className="h-4 w-4 text-amber-400/70 shrink-0" />
                            )}

                            {/* Workspace Title: Inline Edit or Text */}
                            {isEditingThisWs ? (
                              <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                                <input
                                  ref={renameInputRef}
                                  type="text"
                                  value={editWorkspaceName}
                                  onChange={(e) => setEditWorkspaceName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveWorkspaceRename(ws.id);
                                    if (e.key === 'Escape') setEditingWorkspaceId(null);
                                  }}
                                  onBlur={() => handleSaveWorkspaceRename(ws.id)}
                                  className="w-full bg-zinc-950 border border-amber-500/80 rounded px-1.5 py-0.5 text-xs text-zinc-100 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveWorkspaceRename(ws.id)}
                                  className="p-1 text-emerald-400 hover:text-emerald-300"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <span
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  startWorkspaceRename(ws);
                                }}
                                className="truncate text-[13px] font-medium select-none"
                                title={ws.name}
                              >
                                {ws.name}
                              </span>
                            )}
                          </div>

                          {/* Workspace Actions: Add Chat (if <3) + Three Dots Menu */}
                          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {/* Add Chat to Workspace (hidden if 3/3 reached) */}
                            {chatCount < 3 && onAddWorkspaceChat && (
                              <button
                                type="button"
                                onClick={() => onAddWorkspaceChat(ws.id)}
                                title={`Add Chat (${chatCount}/3)`}
                                className="p-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5 stroke-[2.2]" />
                              </button>
                            )}

                            {/* Three Dots Menu Button */}
                            <button
                              type="button"
                              onClick={(e) => handleOpenThreeDots(e, 'workspace', ws.id)}
                              title="Workspace options"
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all cursor-pointer"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Indented Child Chats List */}
                        {isExpanded && (
                          <div className="pl-3 pr-1.5 pb-1 pt-0.5 space-y-0.5">
                            {chats.length === 0 ? (
                              <div className="text-[11.5px] text-zinc-500 italic py-1 px-3">
                                No chats yet. Click + to add.
                              </div>
                            ) : (
                              chats.map((chat) => {
                                const isActive = activeSessionId === chat.id;
                                const isEditingThisChat = editingChatId === chat.id;

                                return (
                                  <div
                                    key={chat.id}
                                    onClick={() => onSelectWorkspaceChat(ws.id, chat.id)}
                                    onContextMenu={(e) => handleContextMenu(e, 'chat', chat.id, ws.id)}
                                    className={`group/chat flex items-center justify-between pl-3 pr-1.5 py-1.5 rounded-lg text-[12.5px] cursor-pointer transition-colors relative border-l-2 ${
                                      isActive
                                        ? 'bg-amber-500/15 text-amber-300 font-medium border-amber-400'
                                        : 'border-transparent hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate min-w-0 pr-1 flex-1">
                                      <span className="text-zinc-600 font-mono text-[11px] select-none">|_</span>
                                      <MessageSquare
                                        className={`h-3 w-3 shrink-0 ${
                                          isActive ? 'text-amber-400' : 'text-zinc-500 group-hover/chat:text-zinc-100'
                                        }`}
                                      />

                                      {/* Chat Title: Inline Edit or Text */}
                                      {isEditingThisChat ? (
                                        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                                          <input
                                            ref={renameInputRef}
                                            type="text"
                                            value={editChatTitle}
                                            onChange={(e) => setEditChatTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleSaveChatRename(chat.id, ws.id);
                                              if (e.key === 'Escape') setEditingChatId(null);
                                            }}
                                            onBlur={() => handleSaveChatRename(chat.id, ws.id)}
                                            className="w-full bg-zinc-950 border border-amber-500/80 rounded px-1.5 py-0.5 text-xs text-zinc-100 focus:outline-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleSaveChatRename(chat.id, ws.id)}
                                            className="p-0.5 text-emerald-400 hover:text-emerald-300"
                                          >
                                            <Check className="h-3 w-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <span
                                          onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            startChatRename(chat, ws.id);
                                          }}
                                          className="truncate select-none"
                                          title={chat.title || 'Chat'}
                                        >
                                          {chat.title || 'Chat'}
                                        </span>
                                      )}
                                    </div>

                                    {/* Chat Row Actions: Three Dots Menu */}
                                    <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={(e) => handleOpenThreeDots(e, 'chat', chat.id, ws.id)}
                                        title="Chat options"
                                        className="opacity-0 group-hover/chat:opacity-100 p-0.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-opacity cursor-pointer"
                                      >
                                        <MoreVertical className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer: User Profile & Actions */}
          <div className="border-t border-zinc-800/80 bg-zinc-950/60 py-3.5 px-3 relative">
            <AuthProfile 
              currentUser={currentUser}
              onAuthChange={onAuthChange}
              onOpenAuth={onOpenAuth}
              onOpenSettings={onOpenSettings}
              onOpenProfileSettings={onOpenProfileSettings}
            />
          </div>
        </>
      )}
    </aside>
  );
}