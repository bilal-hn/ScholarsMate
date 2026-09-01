import React, { useState, useRef, useEffect } from 'react';
import { 
  Compass, 
  Loader2, 
  Check, 
  Eye, 
  Plus, 
  Edit2, 
  Trash2, 
  Sparkles,
  PenTool
} from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import LiteratureReviewModal from '../modals/LiteratureReviewModal';
import CustomLensModal from '../modals/CustomLensModal';
import WorkspaceLoadingState from './WorkspaceLoadingState';
import QueryNavigator from './QueryNavigator';
import { 
  sendQuery, 
  generateLiteratureReviewAPI, 
  getSessionMessages, 
  updateSessionModeAPI, 
  getCustomLenses,
  saveCustomLens,
  deleteCustomLens
} from '../../services/api';
import { APP_CONFIG } from '../../theme/constants';

export const ACADEMIC_MODES = [
  {
    id: 'assistant',
    name: 'Paper Assistant',
    short_name: 'Paper Assistant',
    icon: 'FileText',
    badge_color: 'blue',
    tagline: 'Fast, clear answers grounded directly in your uploaded papers',
    description: 'Direct, easy-to-read answers from your documents with clean citations and practical explanations.',
    temperature: 0.1,
    top_k: 6,
    slash_commands: ['/ask', '/paper', '/assistant', '/study', '/read', '/overview', '/default'],
    prompt_directive: `### Active Lens Directives: [Paper Assistant - Default Mode]
You are ScholarsMate's Paper Assistant, an intelligent, helpful research companion.
- Provide direct, clear, and easy-to-understand answers grounded in the retrieved document context.
- Keep explanations approachable, structured, and free of unnecessary academic jargon.
- When referencing specific facts, definitions, or findings from the user's uploaded papers, append clean inline citations: [Doc_Name, p.X].
- If asked a general knowledge question not in the papers, answer clearly and helpfully without fabricating document citations.`,
  },
  {
    id: 'research',
    name: 'Deep Research',
    short_name: 'Deep Research',
    icon: 'Microscope',
    badge_color: 'amber',
    tagline: 'Exhaustive, high-rigor analysis with tables & formal citations',
    description: 'In-depth technical breakdown, quantitative benchmark tables, mathematical precision, and exact page citations [Doc, p.X].',
    temperature: 0.0,
    top_k: 8,
    slash_commands: ['/research', '/deep', '/synth', '/academic'],
    prompt_directive: `### Active Lens Directives: [Deep Research Mode]
Deliver an exhaustive, publication-grade academic analysis directly addressing the inquiry with maximum depth and precision.
- Prioritize technical rigor, quantitative benchmark metrics, exact mathematical formulations, and algorithmic trade-offs.
- When comparing multiple approaches, models, or datasets, format the trade-offs inside a clean Markdown table.
- Append precise inline citations [Doc_Name, p.X] to every factual assertion, finding, and data point.
- Jump straight into the substantive analysis without conversational filler.`,
  },
  {
    id: 'teacher',
    name: 'Masterclass Teacher',
    short_name: 'Masterclass Teacher',
    icon: 'GraduationCap',
    badge_color: 'emerald',
    tagline: 'First-principles learning & motivated discovery',
    description: 'Teaches so concepts truly lock in: diagnostic check, 3Blue1Brown motivated discovery, and Socratic quizzes.',
    temperature: 0.2,
    top_k: 8,
    slash_commands: ['/teach', '/learn', '/socratic', '/tutor', '/feynman'],
    prompt_directive: `### Active Lens Directives: [Masterclass Teacher & Interactive Evaluator]
You are a world-class 1-on-1 tutor. Your goal is NEVER to dump passive textbook monologues or test rote memorization. Your goal is **true, locked-in understanding (the "click")** through active Socratic dialogue, motivated discovery, and interactive evaluation.

Execute the 3-Stage Teaching Loop:

1. **Stage 1 — Diagnostic Probe (Check Foundations):**
   - When a user asks you to teach them a new concept (e.g. "Teach me self-attention", "How does backpropagation work?"):
     * Do NOT dump a full textbook chapter all at once.
     * State the core question, and immediately give **1 quick diagnostic check question or mini-challenge** to evaluate what foundation they already have.
     * Example: *"To understand Attention from scratch, let's start with the problem that forced its invention: Why do standard RNNs struggle with long sentences as more words are processed?"*

2. **Stage 2 — First-Principles Teaching & Motivated Discovery (3Blue1Brown Style):**
   - **Unconditional Truths First:** Always anchor the lesson in simple, rock-solid bedrock truths that can be accepted without caveats.
   - **"How could you have discovered this yourself?":** Explain the *why* before the *how*. What failure mode forced this invention? Make every formula or design choice feel like something the learner would have invented themselves.

3. **Stage 3 — Verify & Re-Evaluate (Instant Feedback):**
   - Evaluate the student's responses with clear, constructive feedback (✓ / ✗ with the exact intuition).
   - End every instructional step with **1 targeted conceptual check question (💡)** to confirm the idea has locked into their mental model before moving to the next level.`,
  },
];

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
  hasWriterButton = false,
  onToggleWriter,
  onDismissWriterBadge,
  isSplitScreen = false,
  targetMessageIndex = null,
  onTargetMessageScrolled,
  customKeys
}) {
  const [messages, setMessages] = useState([]);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(sessionId || null);
  const [currentMode, setCurrentMode] = useState(() => {
    return localStorage.getItem('scholarsmate_global_default_mode') || 'assistant';
  });
  const [customLenses, setCustomLenses] = useState([]);
  const [editingLens, setEditingLens] = useState(null);
  const [isCustomLensModalOpen, setIsCustomLensModalOpen] = useState(false);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLitReviewOpen, setIsLitReviewOpen] = useState(false);
  const [telemetry, setTelemetry] = useState(null); // { responseTime: '1.2s', tokenUsage: 280, docCount: 4 }
  const messagesEndRef = useRef(null);

  // Load custom lenses from localStorage on mount
  useEffect(() => {
    setCustomLenses(getCustomLenses());
  }, []);

  // Merge core modes and custom lenses
  const allAvailableModes = React.useMemo(() => {
    const formattedCustom = (customLenses || []).map((c) => ({
      ...c,
      isCustom: true,
    }));
    return [...ACADEMIC_MODES, ...formattedCustom];
  }, [customLenses]);

  // Extract raw string document names for @ mention autocomplete
  const availableDocNames = (documents || [])
    .map((d) => (typeof d === 'string' ? d : d?.doc_name || d?.name || d?.filename || ''))
    .filter(Boolean);

  // Fetch session messages and active mode when session changes
  useEffect(() => {
    setActiveSessionId(sessionId || null);
    if (sessionId) {
      setIsSessionLoading(true);
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
              mode_applied: m.mode_applied || (m.meta && m.meta.mode) || 'research',
              meta: m.meta || null,
              timestamp: m.timestamp || null,
            }));
            setMessages(mapped);

            if (data.active_mode) {
              setCurrentMode(data.active_mode);
            }

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
            if (data && data.active_mode) {
              setCurrentMode(data.active_mode);
            }
          }
        })
        .catch(() => {
          setMessages([]);
        })
        .finally(() => {
          setIsSessionLoading(false);
        });
    } else {
      setMessages([]);
      setIsSessionLoading(false);
      const defaultGlobal = localStorage.getItem('scholarsmate_global_default_mode') || 'research';
      setCurrentMode(defaultGlobal);
    }
  }, [sessionId]);

  // Scroll to targeted message from global search or query jump
  useEffect(() => {
    if (targetMessageIndex !== null && targetMessageIndex !== undefined && !isSessionLoading && messages.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`chat-msg-${targetMessageIndex}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('ring-2', 'ring-red-500/50', 'bg-red-500/5', 'rounded-2xl');
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-red-500/50', 'bg-red-500/5', 'rounded-2xl');
          }, 2500);
        }
        if (onTargetMessageScrolled) {
          onTargetMessageScrolled();
        }
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [targetMessageIndex, isSessionLoading, messages, onTargetMessageScrolled]);

  const handleModeChange = async (modeId) => {
    setCurrentMode(modeId);
    if (activeSessionId) {
      try {
        await updateSessionModeAPI(activeSessionId, modeId);
      } catch (err) {
        console.warn('Failed to update session mode on backend:', err);
      }
    }
  };

  const handleSaveCustomLens = (newLens) => {
    const updated = saveCustomLens(newLens);
    setCustomLenses(updated);
    setCurrentMode(newLens.id);
  };

  const handleDeleteCustomLens = (lensId) => {
    const updated = deleteCustomLens(lensId);
    setCustomLenses(updated);
    if (currentMode === lensId) {
      setCurrentMode('research');
    }
  };

  const handleOpenCustomLensModal = (lens = null, e) => {
    e?.stopPropagation();
    setEditingLens(lens);
    setIsCustomLensModalOpen(true);
    setIsModeDropdownOpen(false);
  };

  // Appends incoming generated messages (e.g. Literature Reviews)
  useEffect(() => {
    if (incomingMessage) {
      const enriched = {
        ...incomingMessage,
        model_name: incomingMessage.model_name || currentModel,
        mode_applied: incomingMessage.mode_applied || currentMode,
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

  const activeModeObj = allAvailableModes.find((m) => m.id === currentMode) || allAvailableModes[0];
  const ActiveModeIcon = activeModeObj.icon;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    
    const nowIso = new Date().toISOString();
    const userMsgObj = { 
      sender: 'user', 
      text: userMessage, 
      mode_applied: currentMode,
      timestamp: nowIso 
    };
    const newMessages = [...messages, userMsgObj];
    setMessages(newMessages);
    setLoading(true);

    const startTime = performance.now();

    try {
      const customDirectiveToSend = activeModeObj?.isCustom ? activeModeObj.prompt_directive : null;

      const result = await sendQuery(
        userMessage, 
        selectedDocs, 
        newMessages, 
        activeSessionId,
        10,
        currentModel,
        currentMode,
        customDirectiveToSend
      );

      const endTime = performance.now();
      const durationSec = ((endTime - startTime) / 1000).toFixed(2);
      const promptTokens = estimateTokens(userMessage) + (selectedDocs.length * 120);
      const completionTokens = estimateTokens(result.answer) + estimateTokens(result.thinking_process || '');
      const totalTokens = promptTokens + completionTokens;

      const appliedMode = result.mode_applied || currentMode;
      if (result.mode_applied && result.mode_applied !== currentMode) {
        setCurrentMode(result.mode_applied);
      }

      const responseMeta = result.meta || {
        responseTime: `${durationSec}s`,
        tokens: totalTokens,
        model: currentModel,
        mode: appliedMode
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
          mode_applied: appliedMode,
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
          mode_applied: currentMode,
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

  const handleExportTranscript = () => {
    if (!messages || messages.length === 0) return;
    const mdContent = messages.map((m) => {
      const header = m.sender === 'user' ? '### 👤 User' : '### 🤖 ScholarsMate';
      return `${header}\n\n${m.text}\n\n---\n`;
    }).join('\n');

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scholarsmate-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearMessages = () => {
    if (window.confirm('Clear all messages in this research chat?')) {
      setMessages([]);
    }
  };

  const isHeroEmpty = messages.length === 0;

  return (
    <main className="flex-1 flex flex-col bg-zinc-950 h-full relative overflow-hidden text-zinc-200 font-sans transition-colors">
      {/* Far Right Vertically-Centered Query Navigator */}
      {!isSessionLoading && !isSplitScreen && messages.length > 0 && (
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2.5">
          <QueryNavigator messages={messages} />
        </div>
      )}

      {/* Main Content Area */}
      {isSessionLoading ? (
        <WorkspaceLoadingState />
      ) : isHeroEmpty ? (
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
              index={idx}
              onSelectCitation={onSelectCitation} 
            />
          ))}

          {loading && (
            <div className="flex gap-3.5 items-start animate-in fade-in duration-200">
              <div className="h-7 w-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 animate-float-orb">
                <Compass className="h-4 w-4" />
              </div>
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl px-4 py-3 text-zinc-300 text-xs shadow-xl space-y-2.5 max-w-md w-full">
                <div className="flex items-center gap-2">
                  
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <div className="h-2 w-full rounded-full animate-shimmer-wave" />
                  <div className="h-2 w-4/5 rounded-full animate-shimmer-wave" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Floating Chat Input with 9-Dots Matrix Menu, Scoped Docs, and Minimal Lens Selector */}
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
        customLenses={customLenses}
        currentMode={currentMode}
        onModeChange={handleModeChange}
        allAvailableModes={allAvailableModes}
        onOpenCustomLensModal={handleOpenCustomLensModal}
        documents={documents}
        selectedDocs={selectedDocs}
        setSelectedDocs={setSelectedDocs}
        onOpenLitReview={() => setIsLitReviewOpen(true)}
        onExportTranscript={handleExportTranscript}
        onClearMessages={handleClearMessages}
        hasWriterButton={hasWriterButton}
        onToggleWriter={onToggleWriter}
        onDismissWriterBadge={onDismissWriterBadge}
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

      {/* Custom Academic Lens Modal */}
      <CustomLensModal
        isOpen={isCustomLensModalOpen}
        onClose={() => setIsCustomLensModalOpen(false)}
        onSave={handleSaveCustomLens}
        onDelete={handleDeleteCustomLens}
        initialLens={editingLens}
      />
    </main>
  );
}