import React, { useEffect, useState } from 'react';
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

  // Fetch all saved sessions on mount
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
    <div style={styles.sidebar}>
      {/* New Chat Button */}
      <button style={styles.newChatBtn} onClick={handleCreateNewChat}>
        <span style={{ fontSize: '18px', marginRight: '8px' }}>+</span>
        New Research Chat
      </button>

      {/* Header */}
      <div style={styles.sectionHeader}>Saved Research Sessions</div>

      {/* Session List */}
      <div style={styles.sessionList}>
        {loading && sessions.length === 0 ? (
          <div style={styles.loadingText}>Loading history...</div>
        ) : sessions.length === 0 ? (
          <div style={styles.emptyText}>No saved chats yet.</div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                style={{
                  ...styles.sessionItem,
                  ...(isActive ? styles.activeItem : {}),
                }}
                onClick={() => onSelectSession(session.id)}
              >
                <div style={styles.sessionTitle} title={session.title}>
                  📄 {session.title}
                </div>
                <button
                  style={styles.deleteBtn}
                  onClick={(e) => handleDelete(e, session.id)}
                  title="Delete Session"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Lightweight Inline Styles
const styles = {
  sidebar: {
    width: '260px',
    height: '100%',
    backgroundColor: '#1f2937',
    color: '#f3f4f6',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    boxSizing: 'border-box',
    borderRight: '1px solid #374151',
  },
  newChatBtn: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
    transition: 'background-color 0.2s',
  },
  sectionHeader: {
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#9ca3af',
    marginBottom: '10px',
  },
  sessionList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sessionItem: {
    padding: '10px 12px',
    borderRadius: '6px',
    backgroundColor: '#374151',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  },
  activeItem: {
    backgroundColor: '#1d4ed8',
    fontWeight: '600',
  },
  sessionTitle: {
    fontSize: '14px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '180px',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  loadingText: {
    fontSize: '13px',
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: '20px',
  },
  emptyText: {
    fontSize: '13px',
    color: '#6b7280',
    textAlign: 'center',
    marginTop: '20px',
  },
};