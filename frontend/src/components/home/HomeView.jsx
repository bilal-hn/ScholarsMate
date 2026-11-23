import React from 'react';
import { 
  Home, 
  MessageSquare, 
  BookMarked, 
  PenTool, 
  Sparkles, 
  Search, 
  Settings, 
  Sun,
  Moon, 
  Folder, 
  FileText, 
  ArrowRight, 
  Compass, 
  Layers, 
  Clock, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import AppLogo, { BrandName } from '../common/AppLogo';

export default function HomeView({
  onNavigate,
  workspaces = [],
  standaloneChats = [],
  currentUser,
  onOpenAuth,
  onOpenSettings,
  onOpenThemeModal,
  currentTheme = 'original',
  onToggleTheme,
  onOpenSearchModal,
  onSelectWorkspaceChat,
  onSelectStandaloneChat,
  totalLibraryItems = 0,
}) {
  const isAuthenticated = currentUser && !currentUser.is_guest;
  const isLight = currentTheme === 'clarity';

  // Calculate high-level workspace stats
  const totalChats = workspaces.reduce((acc, ws) => acc + (ws.chats?.length || 0), 0) + standaloneChats.length;
  const totalPapers = workspaces.reduce((acc, ws) => acc + (ws.doc_names?.length || 0), 0);

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden font-sans select-text">
      {/* ========================================================================= */}
      {/* TOP APPLICATION BAR (VS Code / AGY Style - Height: 40px) */}
      {/* ========================================================================= */}
      <header className="h-10 border-b border-zinc-800 bg-zinc-900/90 px-3 flex items-center justify-between gap-3 shrink-0 select-none text-xs z-20">
        {/* Left: Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 pr-2">
            <AppLogo className="h-4.5 w-4.5 text-zinc-100" />
            <BrandName className="text-[13px] tracking-tight" />
          </div>
        </div>

        {/* Center: Command Palette Trigger */}
        <button
          type="button"
          onClick={onOpenSearchModal}
          className="hidden md:flex items-center justify-between gap-3 px-3 py-1 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md text-[11px] transition-colors cursor-pointer w-64 lg:w-80 shadow-inner"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3 w-3 text-zinc-500" />
            <span>Search chats, papers, commands...</span>
          </div>
          <kbd className="text-[10px] bg-zinc-900 text-zinc-500 px-1 py-0.2 rounded border border-zinc-800 font-mono">
            Ctrl+K
          </kbd>
        </button>

        {/* Right: Actions, Theme, Settings & Profile */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme || onOpenThemeModal}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
            title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label="Toggle Theme"
          >
            {isLight ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Sun className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
            title="Settings & BYOK Keys"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-0.5" />

          {isAuthenticated ? (
            <div className="flex items-center gap-2 px-2 py-0.5 bg-zinc-800/60 rounded text-[11px] text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="font-medium truncate max-w-[100px]">{currentUser.name || 'User'}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuth && onOpenAuth('login')}
              className="px-2.5 py-1 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded text-[11px] transition-colors cursor-pointer shadow-xs"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN HOME DASHBOARD (Scrollable) */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Hero Welcome Banner */}
          <div className="relative p-6 sm:p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-zinc-700/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-3">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] font-medium">
                <Sparkles className="h-3 w-3 text-zinc-400" />
                <span>ScholarsMate Workspace v2.0</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Academic Research & Citation Engine
              </h1>
              <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Interrogate papers with page-exact grounded citations, organize bibliographic collections via arXiv/DOI auto-pull, and synthesize formal literature reviews with isolated workspace contexts.
              </p>

              {/* Quick Metrics Strip */}
              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5 text-zinc-400" />
                  <span><strong>{workspaces.length}</strong> Workspaces</span>
                </div>
                <div className="h-3 w-px bg-zinc-800" />
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
                  <span><strong>{totalChats}</strong> Chats</span>
                </div>
                <div className="h-3 w-px bg-zinc-800" />
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-zinc-400" />
                  <span><strong>{totalPapers}</strong> Workspace Papers</span>
                </div>
              </div>
            </div>
          </div>

          {/* Primary Quick Launch Hub (3 Windows / Modes) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Your Chats */}
            <div 
              onClick={() => onNavigate?.('chat')}
              className="group p-5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 group-hover:bg-zinc-750 group-hover:text-white transition-colors">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-zinc-100 group-hover:text-white transition-colors">
                  Your Chats & Canvas
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Active research threads with split-screen PDF viewing, 2 dedicated research modes (Paper Assistant & General Assistant), and page-exact citations.
                </p>
              </div>
              <div className="pt-4 mt-2 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-300 font-semibold group-hover:text-white">
                <span>Open Your Chats</span>
                <ArrowRight className="h-3.5 w-3.5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 2: Reference Library */}
            <div 
              onClick={() => onNavigate?.('library')}
              className="group p-5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 group-hover:bg-zinc-750 group-hover:text-white transition-colors">
                  <BookMarked className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-zinc-100 group-hover:text-white transition-colors">
                  Reference Library
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Zotero-style reference manager. Auto-fetch paper metadata & PDFs via arXiv/DOI, manage collections, and export BibTeX.
                </p>
              </div>
              <div className="pt-4 mt-2 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-300 font-semibold group-hover:text-white">
                <span>Open Library</span>
                <ArrowRight className="h-3.5 w-3.5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 3: Academic Writer */}
            <div 
              onClick={() => onNavigate?.('chat')}
              className="group p-5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 group-hover:bg-zinc-750 group-hover:text-white transition-colors">
                  <PenTool className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-zinc-100 group-hover:text-white transition-colors">
                  Academic Writer
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Draft papers side-by-side with your active chat thread. Insert live citations and export clean DOCX and PDF manuscripts.
                </p>
              </div>
              <div className="pt-4 mt-2 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-300 font-semibold group-hover:text-white">
                <span>Open Writer</span>
                <ArrowRight className="h-3.5 w-3.5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>

          {/* Recent Workspaces Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
                Your Workspaces
              </h2>
              <button
                type="button"
                onClick={() => onNavigate?.('chat')}
                className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>View all in Chats</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {workspaces.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {workspaces.map((ws) => (
                  <div
                    key={ws.id}
                    onClick={() => {
                      if (ws.chats && ws.chats.length > 0) {
                        onSelectWorkspaceChat?.(ws.id, ws.chats[0].id);
                      }
                      onNavigate?.('chat');
                    }}
                    className="p-3.5 rounded-lg bg-zinc-900/50 hover:bg-zinc-850/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 text-zinc-400 shrink-0" />
                        <span className="font-semibold text-xs text-zinc-200 group-hover:text-white truncate">
                          {ws.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {ws.doc_names?.length || 0} papers • {ws.chats?.length || 0} / 3 chats
                      </p>
                    </div>

                    <div className="pt-2 mt-2 border-t border-zinc-850 flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="truncate">
                        {ws.chats?.[0]?.title || 'New Workspace'}
                      </span>
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-300" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-lg bg-zinc-900/30 border border-dashed border-zinc-800 text-center space-y-2">
                <Folder className="h-8 w-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">No workspaces created yet.</p>
                <button
                  type="button"
                  onClick={() => onNavigate?.('chat')}
                  className="px-3 py-1 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded text-xs transition-colors cursor-pointer"
                >
                  Create Your First Workspace in Chats
                </button>
              </div>
            )}
          </div>

          {/* Placeholder Section: Dashboard Metrics & Coming Soon */}
          <div className="p-5 rounded-xl bg-zinc-900/30 border border-zinc-800/60 space-y-3">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Home Dashboard (Coming Soon)
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This space will soon host your daily research feed, personalized arXiv literature alerts, paper reading progress trackers, and collaborative peer-review annotations.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-zinc-500">
              <div className="flex items-center gap-2 p-2.5 rounded bg-zinc-950 border border-zinc-850">
                <CheckCircle2 className="h-3.5 w-3.5 text-zinc-600" />
                <span>arXiv Daily Recommendation Feed</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded bg-zinc-950 border border-zinc-850">
                <CheckCircle2 className="h-3.5 w-3.5 text-zinc-600" />
                <span>Citation Network & Co-authorship Graphs</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded bg-zinc-950 border border-zinc-850">
                <CheckCircle2 className="h-3.5 w-3.5 text-zinc-600" />
                <span>Reading Progress & Key Annotations</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
