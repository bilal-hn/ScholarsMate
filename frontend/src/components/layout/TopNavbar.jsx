import React from 'react';
import { 
  Home, 
  MessageSquare, 
  BookMarked, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Search, 
  Settings, 
  Sun,
  Moon
} from 'lucide-react';
import AppLogo from '../common/AppLogo';

export default function TopNavbar({
  isSidebarCollapsed,
  onToggleSidebar,
  currentUser,
  onOpenAuth,
  onOpenSettings,
  onOpenThemeModal,
  currentTheme = 'original',
  onToggleTheme,
  onOpenSearchModal,
  currentRoute = 'chat',
  onNavigate,
  totalLibraryItems = 0,
}) {
  const isAuthenticated = currentUser && !currentUser.is_guest;
  const isLight = currentTheme === 'clarity';

  return (
    <header className="h-10 border-b border-zinc-800 bg-zinc-900/90 px-3 flex items-center justify-between gap-3 shrink-0 select-none text-xs z-30 font-sans">
      {/* Left: Sidebar Toggle + Brand + Window Switcher */}
      <div className="flex items-center gap-2 shrink-0">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 rounded transition-colors cursor-pointer mr-1"
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}

        <div className="flex items-center gap-1.5 pr-2 border-r border-zinc-800">
          <AppLogo className="h-4 w-4" />
          <span className="font-bold text-xs tracking-tight text-zinc-100 hidden sm:inline">ScholarsMate</span>
        </div>

        {/* Window Switcher Segmented Tabs (VS Code / Code Editor Style) */}
        <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => onNavigate?.('home')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              currentRoute === 'home'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-750'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
            title="Home (localhost/home)"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('chat')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              currentRoute === 'chat'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-750'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
            title="Your Chats (localhost/chat)"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Your Chats</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('library')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              currentRoute === 'library'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-750'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
            title="Reference Library (localhost/library)"
          >
            <BookMarked className="h-3.5 w-3.5" />
            <span>Library</span>
            {totalLibraryItems > 0 && (
              <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1 rounded">
                {totalLibraryItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Center: Command Palette Trigger */}
      {onOpenSearchModal && (
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
      )}

      {/* Right: Actions & User Status */}
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

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
            title="Settings & BYOK Keys"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="h-4 w-px bg-zinc-800 mx-0.5" />

        {isAuthenticated ? (
          <div className="flex items-center gap-2 px-2 py-0.5 bg-zinc-800/60 rounded text-[11px] text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-medium truncate max-w-[120px]">{currentUser.name || 'User'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenAuth && onOpenAuth('login')}
              className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 font-medium rounded text-[11px] transition-colors cursor-pointer border border-zinc-750"
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth && onOpenAuth('signup')}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded text-[11px] transition-colors cursor-pointer shadow-xs"
            >
              Sign Up
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
