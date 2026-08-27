import React, { useState, useRef, useEffect } from 'react';
import { Compass, Loader2, BookOpen, ChevronDown } from 'lucide-react';
import DocumentSelector from '../document/DocumentSelector';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import LiteratureReviewModal from '../modals/LiteratureReviewModal';
import { sendQuery, generateLiteratureReviewAPI, getSessionMessages } from '../../services/api';
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
  const [messages, setMessages] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(sessionId || null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLitReviewOpen, setIsLitReviewOpen] = useState(false);
  const [telemetry, setTelemetry] = useState(null); // { responseTime: '1.2s', tokenUsage: 280, docCount: 4 }
  const messagesEndRef = useRef(null);

  // Extract raw string document names for @ mention autocomplete
  const availableDocNames = (documents || [])
    .map((d) => (typeof d === 'string' ? d : d?.doc_name || d?.name || d?.filename || ''))
    .filter(Boolean);

  // Fetch session messages or reset when workspace/session changes
  useEffect(() => {
    setActiveSessionId(sessionId || null);
    if (sessionId) {
      getSessionMessages(sessionId)
        .then((data) => {
          if (data && data.messages && data.messages.length > 0) {
            const mapped = data.messages.map((m) => ({
              id: m.id,
              sender: m.sender,
              text: m.text,
              thinking_process: m.thinking_process || null,
              sources: m.sources_used || m.sources || [],
              model_name: m.model_name || null,
              meta: m.meta || null,
              timestamp: m.timestamp || null,
            }));
            setMessages(mapped);

            // Sync last message telemetry to input bar if available
            const lastBotMsg = [...mapped].reverse().find((m) => m.sender === 'bot' && m.meta);
            if (lastBotMsg && lastBotMsg.meta) {
              setTelemetry({
                responseTime: lastBotMsg.meta.responseTime,
                tokenUsage: lastBotMsg.meta.tokens,
                docCount: selectedDocs.length,
              });
            }
          } else {
            setMessages([]);
          }
        })
        .catch(() => {
          setMessages([]);
        });
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  // Appends incoming generated messages (e.g. Literature Reviews)
  useEffect(() => {
    if (incomingMessage) {
      const enriched = {
        ...incomingMessage,
        model_name: incomingMessage.model_name || currentModel,
        timestamp: incomingMessage.timestamp || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, enriched]);
    }
  }, [incomingMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, loading]);

  // Rough estimation helper for token calculations (standard ~0.75 words per token)
  const estimateTokens = (text = '') => {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.round(words * 1.33));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    
    const nowIso = new Date().toISOString();
    const userMsgObj = { 
      sender: 'user', 
      text: userMessage, 
      timestamp: nowIso 
    };
    const newMessages = [...messages, userMsgObj];
    setMessages(newMessages);
    setLoading(true);

    const startTime = performance.now();

    try {
      const result = await sendQuery(
        userMessage, 
        selectedDocs, 
        newMessages, 
        activeSessionId,
        10,
        currentModel
      );

      const endTime = performance.now();
      const durationSec = ((endTime - startTime) / 1000).toFixed(2);
      const promptTokens = estimateTokens(userMessage) + (selectedDocs.length * 120);
      const completionTokens = estimateTokens(result.answer) + estimateTokens(result.thinking_process || '');
      const totalTokens = promptTokens + completionTokens;

      const responseMeta = result.meta || {
        responseTime: `${durationSec}s`,
        tokens: totalTokens,
        model: currentModel,
      };

      setTelemetry({
        responseTime: responseMeta.responseTime || `${durationSec}s`,
        tokenUsage: responseMeta.tokens !== undefined ? responseMeta.tokens : totalTokens,
        docCount: selectedDocs.length,
      });

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
          model_name: result.model_name || currentModel,
          meta: responseMeta,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      const endTime = performance.now();
      const durationSec = ((endTime - startTime) / 1000).toFixed(2);
      setTelemetry({
        responseTime: `${durationSec}s`,
        tokenUsage: 0,
        docCount: selectedDocs.length,
      });

      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: `⚠️ Generation failed: ${err.response?.data?.detail || err.message || 'Please check backend connection.'}`,
          thinking_process: null,
          sources: [],
          model_name: currentModel,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLiteratureReview = async (config) => {
    return await generateLiteratureReviewAPI(config);
  };

  const isHeroEmpty = messages.length === 0;

  return (
    <main className="flex-1 flex flex-col bg-zinc-950 h-full relative overflow-hidden text-zinc-200 font-sans transition-colors">
      {/* Minimal Top Header (Center Dropdown Style) */}
      <div className="px-5 py-2.5 bg-zinc-950/95 border-b border-zinc-800/60 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2">
          <DocumentSelector
            documents={documents}
            selectedDocs={selectedDocs}
            setSelectedDocs={setSelectedDocs}
          />
        </div>

        {/* Center Minimal Workspace Identifier */}
        <div className="flex items-center gap-1 text-xs text-zinc-400 font-medium cursor-pointer hover:text-zinc-200 transition-colors">
          <span>{activeSessionId ? 'Current Research Workspace' : 'New Chat'}</span>
          <ChevronDown className="h-3 w-3 text-zinc-500" />
        </div>

        {/* Right Minimal Literature Review Trigger */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLitReviewOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800/80 hover:border-amber-500/40 text-amber-300 text-[11.5px] font-medium rounded-lg transition-colors cursor-pointer"
          >
            <BookOpen className="h-3 w-3 text-amber-400" />
            <span>Lit Review Studio</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isHeroEmpty ? (
        /* Minimalist Hero Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none relative">
          <div className="max-w-md w-full flex flex-col items-center animate-in fade-in duration-300 -mt-16">
            {/* Logo Crest */}
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-3 shadow-inner">
              <Compass className="h-6 w-6 stroke-[1.8]" />
            </div>

            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-1 font-serif">
              {APP_CONFIG.name}
            </h1>
            <p className="text-xs text-zinc-400 font-medium mb-5">
              {APP_CONFIG.tagline}
            </p>

            <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed font-mono">
              Tip: Drag and drop files onto the chat, or type <span className="text-amber-400">@</span> to tag a paper.
            </p>
          </div>
        </div>
      ) : (
        /* Messages Feed */
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-3xl mx-auto w-full">
          {messages.map((msg, idx) => (
            <ChatMessage 
              key={idx} 
              message={msg} 
              onSelectCitation={onSelectCitation} 
            />
          ))}

          {loading && (
            <div className="flex gap-3.5 items-start">
              <div className="h-7 w-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <Compass className="h-4 w-4 animate-spin" />
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2.5 text-zinc-400 text-xs shadow-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                <span>Synthesizing source-locked research evidence...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Floating Chat Input with Telemetry */}
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
        telemetry={telemetry}
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