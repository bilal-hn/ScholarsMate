import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, MessageSquare, CornerDownLeft, X } from 'lucide-react';
import { getSessionMessages } from '../../services/api';

export default function GlobalSearchModal({
  isOpen,
  onClose,
  workspaces = [],
  standaloneChats = [],
  onSelectWorkspace,
  onSelectStandaloneChat,
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sessionMessagesMap, setSessionMessagesMap] = useState({});
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Flatten all searchable chat sessions from workspaces and standalone chats
  const searchableSessions = useMemo(() => {
    const list = [];
    (workspaces || []).forEach((ws) => {
      (ws.chats || []).forEach((c) => {
        list.push({
          sessionId: c.id,
          workspaceId: ws.id,
          name: `${ws.name} › ${c.title || 'Chat'}`,
          workspaceName: ws.name,
          chatTitle: c.title || 'Chat',
          updated_at: c.updated_at || ws.updated_at,
        });
      });
    });
    (standaloneChats || []).forEach((s) => {
      list.push({
        sessionId: s.id,
        workspaceId: null,
        name: s.title || 'Chat Session',
        workspaceName: null,
        chatTitle: s.title || 'Chat Session',
        updated_at: s.updated_at,
      });
    });
    return list;
  }, [workspaces, standaloneChats]);

  // Load message data for all sessions on modal open
  useEffect(() => {
    if (!isOpen || searchableSessions.length === 0) return;

    let isMounted = true;
    const fetchAllSessionData = async () => {
      const messagesMap = {};
      await Promise.all(
        searchableSessions.map(async (item) => {
          try {
            const data = await getSessionMessages(item.sessionId);
            if (data && Array.isArray(data.messages)) {
              messagesMap[item.sessionId] = data.messages;
            } else {
              messagesMap[item.sessionId] = [];
            }
          } catch {
            messagesMap[item.sessionId] = [];
          }
        })
      );

      if (isMounted) {
        setSessionMessagesMap(messagesMap);
      }
    };

    fetchAllSessionData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, searchableSessions]);

  // Focus input and reset query on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Compute Search Results: strictly empty if query is empty
  const searchResults = useMemo(() => {
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ) return [];

    const results = [];

    searchableSessions.forEach((sess) => {
      const messages = sessionMessagesMap[sess.sessionId] || [];
      const titleMatch = sess.name.toLowerCase().includes(cleanQ);

      // Session / Workspace title match
      if (titleMatch) {
        const lastUserMsg = [...messages].reverse().find((m) => m.sender === 'user');
        const userMsgIndex = lastUserMsg ? messages.indexOf(lastUserMsg) : (messages.length > 0 ? 0 : null);
        results.push({
          type: 'title_match',
          session: sess,
          snippet: lastUserMsg ? lastUserMsg.text : 'Title match',
          messageIndex: userMsgIndex,
          timestamp: sess.updated_at,
          score: 10,
        });
      }

      // Search through conversation messages
      messages.forEach((msg, mIdx) => {
        const text = msg.text || '';
        const lowerText = text.toLowerCase();
        const matchIdx = lowerText.indexOf(cleanQ);

        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 40);
          const end = Math.min(text.length, matchIdx + cleanQ.length + 80);
          const snippetText = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');

          results.push({
            type: 'message_match',
            session: sess,
            message: msg,
            messageIndex: mIdx,
            snippet: snippetText,
            matchTerm: cleanQ,
            sender: msg.sender,
            timestamp: msg.timestamp || sess.updated_at,
            score: msg.sender === 'user' ? 8 : 5,
          });
        }
      });
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 20);
  }, [query, searchableSessions, sessionMessagesMap]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation handlers
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0 && searchResults[selectedIndex]) {
        handleSelect(searchResults[selectedIndex]);
      }
    }
  };

  const handleSelect = (item) => {
    if (!item) return;
    if (item.session.workspaceId && onSelectWorkspace) {
      onSelectWorkspace(item.session.workspaceId, item.session.sessionId, item.messageIndex);
    } else if (onSelectStandaloneChat) {
      onSelectStandaloneChat(item.session.sessionId, item.messageIndex);
    }
    onClose();
  };

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 sm:pt-32 px-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      {/* Search Modal Container */}
      <div
        className="w-full max-w-xl bg-[#131417]/95 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl animate-in zoom-in-95 duration-150 text-zinc-200 flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Minimal Search Input Bar */}
        <div className={`flex items-center gap-3 px-4 py-3.5 bg-zinc-900/60 ${hasQuery ? 'border-b border-zinc-800/80' : ''}`}>
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations across workspaces and chats..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-hidden font-sans"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Results List: Only rendered when user has typed */}
        {hasQuery && (
          <div
            ref={listRef}
            className="max-h-[60vh] overflow-y-auto p-2 space-y-1"
          >
            {searchResults.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs font-mono">
                No conversations found
              </div>
            ) : (
              searchResults.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={`${item.session.sessionId}-${idx}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer text-left group ${
                      isSelected
                        ? 'bg-zinc-800/80 border border-zinc-700/70 shadow-lg'
                        : 'hover:bg-zinc-800/40 border border-transparent'
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`p-2 rounded-lg shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                      }`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={`text-xs font-medium truncate ${
                              isSelected ? 'text-zinc-100' : 'text-zinc-300'
                            }`}
                          >
                            {item.session.name}
                          </span>
                          {item.sender && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0">
                              {item.sender === 'user' ? 'You' : 'Bot'}
                            </span>
                          )}
                        </div>

                        {item.timestamp && (
                          <span className="text-[10.5px] font-mono text-zinc-500 shrink-0">
                            {new Date(item.timestamp).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                      </div>

                      {/* Snippet Preview */}
                      <p
                        className={`text-xs leading-relaxed line-clamp-2 ${
                          isSelected ? 'text-zinc-300' : 'text-zinc-400'
                        }`}
                      >
                        {item.snippet}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer Shortcut Hints */}
        <div className="px-4 py-2 bg-zinc-950/80 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>esc to close</span>
          </div>
          {hasQuery && (
            <span>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
