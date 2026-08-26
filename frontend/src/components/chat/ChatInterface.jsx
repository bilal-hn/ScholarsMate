import React, { useState, useRef, useEffect } from 'react';
import { GraduationCap, Loader2, BookOpen } from 'lucide-react';
import DocumentSelector from '../document/DocumentSelector';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import LiteratureReviewModal from '../modals/LiteratureReviewModal';
import { sendQuery, generateLiteratureReviewAPI } from '../../services/api';
import { APP_CONFIG } from '../../theme/constants';

export default function ChatInterface({ 
  documents = [], 
  selectedDocs = [], 
  setSelectedDocs, 
  onSelectCitation,
  incomingMessage,
  sessionId,
  availableModels = [],
  currentModel,
  onModelChange,
  onOpenSettings,
  customKeys
}) {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: APP_CONFIG.welcomeMessage || "Hello! I'm ScholarsMate. Ask me questions about your uploaded research papers.",
      thinking_process: null,
      sources: [],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState(sessionId || null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLitReviewOpen, setIsLitReviewOpen] = useState(false);
  const messagesEndRef = useRef(null);

  // Extract raw string document names for @ mention autocomplete
  const availableDocNames = (documents || [])
    .map((d) => (typeof d === 'string' ? d : d?.doc_name || d?.name || d?.filename || ''))
    .filter(Boolean);

  // Sync activeSessionId with prop when workspace changes
  useEffect(() => {
    if (sessionId !== undefined) {
      setActiveSessionId(sessionId);
    }
  }, [sessionId]);

  // Appends incoming generated messages (e.g., Literature Reviews)
  useEffect(() => {
    if (incomingMessage) {
      setMessages((prev) => [...prev, incomingMessage]);
    }
  }, [incomingMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    
    const newMessages = [...messages, { sender: 'user', text: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const result = await sendQuery(
        userMessage, 
        selectedDocs, 
        newMessages, 
        activeSessionId,
        10,
        currentModel
      );

      if (result.session_id && result.session_id !== activeSessionId) {
        setActiveSessionId(result.session_id);
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: result.answer,
          thinking_process: result.thinking_process || null,
          sources: result.sources_used || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: `⚠️ Generation failed: ${err.response?.data?.detail || err.message || 'Please check backend connection.'}`,
          thinking_process: null,
          sources: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLiteratureReview = async (config) => {
    return await generateLiteratureReviewAPI(config);
  };

  return (
    <main className="flex-1 flex flex-col bg-zinc-950 h-full relative overflow-hidden">
      {/* Top Header Bar with Document Selector & Review Studio Trigger */}
      <div className="px-6 py-2.5 bg-zinc-950 border-b border-zinc-800/60 flex items-center justify-between shrink-0 z-20">
        <DocumentSelector
          documents={documents}
          selectedDocs={selectedDocs}
          setSelectedDocs={setSelectedDocs}
        />

        {/* Literature Review Studio Popup Trigger */}
        <button
          type="button"
          onClick={() => setIsLitReviewOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-medium rounded-xl transition-all shadow-sm cursor-pointer"
        >
          <BookOpen className="h-3.5 w-3.5 text-amber-400" />
          <span>Literature Review Studio</span>
        </button>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-4xl mx-auto w-full">
        {messages.map((msg, idx) => (
          <ChatMessage 
            key={idx} 
            message={msg} 
            onSelectCitation={onSelectCitation} 
          />
        ))}

        {loading && (
          <div className="flex gap-4">
            <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl px-5 py-4 flex items-center gap-3 text-zinc-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span>Synthesizing source-locked evidence...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Chat Input with Integrated Model Switcher & Document Autocomplete */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        loading={loading}
        availableModels={availableModels}
        currentModel={currentModel}
        onModelChange={onModelChange}
        onOpenSettings={onOpenSettings}
        availableDocuments={availableDocNames}
      />

      {/* Literature Review Studio Modal */}
      <LiteratureReviewModal
        isOpen={isLitReviewOpen}
        onClose={() => setIsLitReviewOpen(false)}
        documents={documents}
        selectedDocs={selectedDocs}
        currentModel={currentModel}
        customKeys={customKeys}
        onGenerateReview={handleGenerateLiteratureReview}
      />
    </main>
  );
}