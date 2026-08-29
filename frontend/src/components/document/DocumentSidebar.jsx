import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  BookOpen, 
  PenTool,
  Settings, 
  Compass, 
  Palette,
  Check,
  X,
  PanelLeftClose
} from 'lucide-react';
import { AuthProfile } from '../layout/AuthProfile';
import { APP_CONFIG, THEMES } from '../../theme/constants';

export default function DocumentSidebar({
  workspaces = [],
  activeWorkspaceId,
  onSelectWorkspace,
  onDeleteWorkspace,
  onOpenCreateModal,
  onOpenLitReview,
  onToggleWriter,
  isWriterActive = false,
  onAuthChange,
  onOpenSettings,
  currentTheme = 'odysseus',
  onThemeChange,
  isCollapsed = false,
  onToggleCollapse,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  const themeMenuRef = useRef(null);

  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery.trim()) return workspaces;
    const q = searchQuery.toLowerCase();
    return workspaces.filter((ws) => ws.name.toLowerCase().includes(q));
  }, [workspaces, searchQuery]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target)) {
        setIsThemeMenuOpen(false);
      }
    };
    if (isThemeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isThemeMenuOpen]);

  const activeThemeObj = THEMES.find((t) => t.id === currentTheme) || THEMES[0];

  return (
    <aside className={`bg-zinc-900/90 border-r border-zinc-800/80 flex flex-col h-full shrink-0 select-none text-zinc-300 font-sans transition-all duration-300 ${
      isCollapsed ? 'w-0 opacity-0 overflow-hidden border-r-0 pointer-events-none' : 'w-60 opacity-100'
    }`}>
      {/* Top Brand Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Compass className="h-4 w-4" />
          </div>
          <span className="font-semibold text-zinc-100 text-sm tracking-tight">
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
        {/* Minimal "+ New Workspace" Action */}
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-amber-400 hover:text-amber-300 hover:bg-zinc-800/50 transition-colors cursor-pointer group text-left"
        >
          <Plus className="h-4 w-4 stroke-[2.2] group-hover:scale-110 transition-transform" />
          <span>New Workspace</span>
        </button>

        {/* Search Toggle / Input */}
        {isSearching ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs">
            <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <input
              type="text"
              placeholder="Filter workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setIsSearching(false);
                setSearchQuery('');
              }}
              className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsSearching(true)}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition-colors cursor-pointer text-left"
          >
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <span>Search</span>
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

        {/* Theme Selector Navigation Item */}
        <div className="relative" ref={themeMenuRef}>
          <button
            type="button"
            onClick={() => setIsThemeMenuOpen((prev) => !prev)}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
              isThemeMenuOpen
                ? 'bg-zinc-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
            }`}
          >
            <Palette className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <span>Theme</span>
          </button>

          {/* Theme Popover Menu */}
          {isThemeMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-xl">
              <div className="px-2.5 py-1 text-[10.5px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80 mb-1 flex items-center justify-between font-mono">
                <span>Interface Theme</span>
              </div>

              <div className="space-y-0.5">
                {THEMES.map((theme) => {
                  const isSelected = theme.id === currentTheme;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => {
                        if (onThemeChange) onThemeChange(theme.id);
                        setIsThemeMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-zinc-800 text-zinc-100 font-medium'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full border border-zinc-700/80 shrink-0"
                          style={{ backgroundColor: theme.accentColor }}
                        />
                        <span className="truncate leading-none">{theme.name}</span>
                      </div>

                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Workspaces List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <div className="px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-500 flex items-center justify-between uppercase">
          <span>Workspaces</span>
          <span className="text-[10px] text-zinc-600 font-mono">{workspaces.length}</span>
        </div>

        {filteredWorkspaces.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">
            {searchQuery ? 'No matching workspaces' : 'No workspaces yet'}
          </div>
        ) : (
          filteredWorkspaces.map((ws) => {
            const isActive = ws.id === activeWorkspaceId;
            return (
              <div
                key={ws.id}
                onClick={() => onSelectWorkspace(ws)}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isActive ? 'bg-amber-400' : 'bg-transparent'}`} />
                  <span className="truncate">{ws.name}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteWorkspace(ws.id);
                  }}
                  title="Delete Workspace"
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 p-1 rounded transition-opacity cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: User Profile & Settings */}
      <div className="border-t border-zinc-800/80 bg-zinc-950/60 p-2 relative">
        <div className="flex items-center justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <AuthProfile onAuthChange={onAuthChange} />
          </div>

          {/* BYOK & Model Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="BYOK & Model Settings"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors cursor-pointer shrink-0"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}