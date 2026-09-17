import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Brain, 
  Trash2, 
  BookOpen, 
  PenTool, 
  Compass, 
  Palette, 
  Check, 
  Sparkles, 
  X, 
  PanelLeftClose, 
  PanelLeftOpen, 
  SquarePen, 
  History, 
  ChevronDown, 
  ChevronRight, 
  MessageSquare, 
} from 'lucide-react';
import { AuthProfile } from '../layout/AuthProfile';
import { APP_CONFIG, THEMES } from '../../theme/constants';

export default function DocumentSidebar({
  currentUser,
  workspaces = [],
  activeWorkspaceId,
  onSelectWorkspace,
  onDeleteWorkspace,
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const workspaceList = useMemo(() => {
    return (workspaces || []).filter((ws) => Array.isArray(ws.documents) && ws.documents.length > 0);
  }, [workspaces]);

  const conversationList = useMemo(() => {
    return (workspaces || []).filter((ws) => !ws.documents || ws.documents.length === 0);
  }, [workspaces]);

  return (
    <aside className={`bg-zinc-900/90 border-r border-zinc-800/80 flex flex-col h-full shrink-0 select-none text-zinc-300 font-sans transition-[width] duration-200 relative z-40 overflow-visible ${
      isCollapsed ? 'w-16' : 'w-60'
    }`}>
      {isCollapsed ? (
        /* Collapsed Rail View */
        <div className="flex flex-col items-center justify-between h-full py-3.5 w-full">
          {/* Top Section: System Logo + Feature Navigation Icons */}
          <div className="flex flex-col items-center w-full">
            {/* Top Brand / Sidebar Toggle: Compass changes to PanelLeftOpen on hover */}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="relative group p-2 rounded-xl text-amber-500 hover:bg-zinc-800/80 transition-all cursor-pointer flex items-center justify-center"
              aria-label="Open sidebar"
            >
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 group-hover:border-amber-500/40 transition-all">
                <Compass className="h-4.5 w-4.5 block group-hover:hidden transition-all text-amber-500" />
                <PanelLeftOpen className="h-4.5 w-4.5 hidden group-hover:block transition-all text-zinc-200" />
              </div>
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
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
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
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
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
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
                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
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
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
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
                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
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
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  Theme
                </span>
              </button>

              {/* Conversation History */}
              <button
                type="button"
                onClick={() => {
                  onToggleCollapse();
                  setIsHistoryOpen(true);
                }}
                className="relative group p-2.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-all cursor-pointer flex items-center justify-center"
                aria-label="Conversation History"
              >
                <History className="h-4.5 w-4.5" />
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs font-medium rounded-lg shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  Conversation History
                </span>
              </button>
            </div>
          </div>

          {/* Bottom Section: User Profile Avatar (Shares exact same AuthProfile pop-up) */}
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
                <Compass className="h-4 w-4 block group-hover:hidden transition-all" />
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
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-zinc-800/50 transition-colors cursor-pointer group text-left"
            >
              <SquarePen className="h-4 w-4 stroke-[2.2] group-hover:scale-110 transition-transform" />
              <span>New Chat</span>
            </button>

            {/* Global Search Modal Navigation Item */}
            <button
              type="button"
              onClick={onOpenSearchModal}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition-colors cursor-pointer text-left group"
            >
              <Search className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              <span>Search</span>
            </button>

            {/* Brain Memory Studio Navigation Item */}
            {onOpenBrainModal && (
              <button
                type="button"
                onClick={onOpenBrainModal}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-800/30 transition-colors cursor-pointer group text-left"
              >
                <Brain className="h-3.5 w-3.5 text-zinc-500 group-hover:text-red-400 transition-colors" />
                <span>Brain</span>
              </button>
            )}

            {/* Literature Review Studio Navigation Item */}
            <button
              type="button"
              onClick={onOpenLitReview}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/30 transition-colors cursor-pointer group text-left"
            >
              <BookOpen className="h-3.5 w-3.5 text-zinc-500 group-hover:text-amber-400 transition-colors" />
              <span>Literature Review Studio</span>
            </button>

            {/* Academic Document Writer Navigation Item */}
            {onToggleWriter && (
              <button
                type="button"
                onClick={onToggleWriter}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer group text-left ${
                  isWriterActive
                    ? 'bg-amber-500/15 text-amber-300 font-medium border border-amber-500/30'
                    : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/30'
                }`}
              >
                <PenTool className={`h-3.5 w-3.5 ${isWriterActive ? 'text-amber-400' : 'text-zinc-500 group-hover:text-amber-400'} transition-colors`} />
                <span>Academic Writer</span>
              </button>
            )}

            {/* Theme Selector Navigation Item (Opens Theme Window Modal) */}
            <button
              type="button"
              onClick={onOpenThemeModal}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
            >
              <Palette className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              <span>Theme</span>
            </button>
          </div>

          {/* Workspaces & Conversation History */}
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
            {/* Workspaces Section */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-500 flex items-center justify-between uppercase">
                <span>Workspaces</span>
                <span className="text-[10px] text-zinc-600 font-mono">{workspaceList.length}</span>
              </div>

              {/* "+ New Workspace" Action Button moved below Workspaces heading */}
              <button
                type="button"
                onClick={onOpenCreateModal}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/40 transition-colors cursor-pointer group text-left mb-1"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2] group-hover:scale-110 transition-transform" />
                <span>New Workspace</span>
              </button>

              {workspaceList.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-zinc-500 font-mono">
                  No workspaces yet
                </div>
              ) : (
                workspaceList.map((ws) => (
                  <div
                    key={ws.id}
                    className="group flex items-center justify-between px-3 py-2 rounded-lg text-xs text-zinc-300 transition-colors hover:bg-zinc-800/30 select-none"
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-amber-400/80" />
                      <span className="truncate text-zinc-300">{ws.name}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteWorkspace(ws.id);
                      }}
                      title="Delete Workspace"
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 rounded transition-opacity cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Conversation History Collapsible Section */}
            <div className="pt-3 border-t border-zinc-800/50 space-y-1">
              <button
                type="button"
                onClick={() => setIsHistoryOpen((prev) => !prev)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors cursor-pointer group text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <History className="h-4 w-4 text-amber-400 group-hover:scale-105 transition-transform shrink-0" />
                  <span className="truncate">Conversation History</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 text-zinc-500">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400">
                    {conversationList.length}
                  </span>
                  {isHistoryOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-200" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-200" />
                  )}
                </div>
              </button>

              {/* History List: Shown when open, hidden when closed */}
              {isHistoryOpen && (
                <div className="space-y-0.5">
                  {conversationList.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-zinc-500 font-mono">
                      No conversation history yet
                    </div>
                  ) : (
                    conversationList.map((chat) => {
                      const isActive = chat.id === activeWorkspaceId;
                      return (
                        <div
                          key={chat.id}
                          onClick={() => onSelectWorkspace(chat)}
                          className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-zinc-800 text-zinc-100 font-medium'
                              : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                            <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                            <span className="truncate">{chat.name || 'Chat Session'}</span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteWorkspace(chat.id);
                            }}
                            title="Delete Conversation"
                            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 p-1 rounded transition-opacity cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer: User Profile & Actions */}
          <div className="border-t border-zinc-800/80 bg-zinc-950/60 py-4 px-3.5 relative">
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