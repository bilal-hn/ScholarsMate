import React, { useEffect, useState } from 'react';
import { Plus, Trash2, MessageSquare, Loader2 } from 'lucide-react';
import {
  getChatSessions,
  createChatSession,
  deleteChatSession,
} from '../services/api';

export default function ChatSidebar({
  activeSessionId,
  onSelectSession,
  onNewChat,
}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch all saved sessions on mount or when active session updates
  useEffect(() => {
    fetchSessions();
  }, [activeSessionId]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await getChatSessions();
      setSessions(data || []);
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewChat = async () => {
    try {
      const newSession = await createChatSession('New Research Chat');
      setSessions((prev) => [newSession, ...prev]);
      onNewChat(newSession.id);
    } catch (err) {
      console.error('Failed to create session:', err);
      // Fallback local reset
      onNewChat(null);
    }
  };

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat thread?')) return;

    try {
      await deleteChatSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        onNewChat(null);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  return (
    <div className="w-64 h-full bg-zinc-950 border-r border-zinc-800/80 flex flex-col p-4 shrink-0 select-none">
      {/* New Chat Button */}
      <button
        onClick={handleCreateNewChat}
        className="w-full flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer mb-5"
      >
        <Plus className="h-4 w-4 stroke-[2.5]" />
        <span>New Research Chat</span>
      </button>

      {/* Header */}
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 px-1">
        Saved Research Sessions
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 py-6">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
            <span>Loading history...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-xs text-zinc-600 text-center py-6">
            No saved chats yet.
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                  isActive
                    ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-800'
                    : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                  <MessageSquare
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isActive ? 'text-amber-400' : 'text-zinc-600'
                    }`}
                  />
                  <span className="truncate" title={session.title}>
                    {session.title}
                  </span>
                </div>

                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  title="Delete Session"
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 p-1 rounded transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}