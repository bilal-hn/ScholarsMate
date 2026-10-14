import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Compass, 
  Loader2, 
  Check, 
  Eye, 
  Plus, 
  Edit2, 
  Trash2, 
  Sparkles,
  PenTool,
  Key,
  ArrowRight,
  X
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
  deleteCustomLens,
  getWorkspaceContextPointsAPI,
  importContextPointsAPI
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
  workspaceId = null,
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
  onSessionCreated,
  onDocumentUploaded,
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

  const [attachedDocs, setAttachedDocs] = useState([]);
  const [attachedImages, setAttachedImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLitReviewOpen, setIsLitReviewOpen] = useState(false);
  const [telemetry, setTelemetry] = useState(null); // { responseTime: '1.2s', tokenUsage: 280, docCount: 4 }
  const messagesEndRef = useRef(null);

  // Context points from sister chats in the same workspace (cheap, 0 LLM token cost)
  const [availableContextPoints, setAvailableContextPoints] = useState([]);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [selectedContextIds, setSelectedContextIds] = useState(new Set());
  const [isImportingContext, setIsImportingContext] = useState(false);
  const [dismissedSessionId, setDismissedSessionId] = useState(null);
  const [contextToast, setContextToast] = useState(null);

  // Fetch available context points from other chats in the same workspace
  useEffect(() => {
    if (workspaceId && activeSessionId) {
      getWorkspaceContextPointsAPI(workspaceId, activeSessionId)
        .then((points) => {
          if (Array.isArray(points) && points.length > 0) {
            setAvailableContextPoints(points);
            setSelectedContextIds(new Set(points.map((p) => p.id)));
          } else {
            setAvailableContextPoints([]);
            setSelectedContextIds(new Set());
          }
        })
        .catch(() => {
          setAvailableContextPoints([]);
          setSelectedContextIds(new Set());
        });
    } else {
      setAvailableContextPoints([]);
      setSelectedContextIds(new Set());
    }
  }, [workspaceId, activeSessionId]);

  const handleImportContextPoints = async () => {
    if (!activeSessionId || selectedContextIds.size === 0) return;
    try {
      setIsImportingContext(true);
      await importContextPointsAPI(activeSessionId, Array.from(selectedContextIds));
      setAvailableContextPoints((prev) => prev.filter((p) => !selectedContextIds.has(p.id)));
      setDismissedSessionId(activeSessionId);
      setIsContextModalOpen(false);
      setContextToast(`Imported ${selectedContextIds.size} context point(s) into this chat.`);
      setTimeout(() => setContextToast(null), 3500);
    } catch (err) {
      console.error('Failed to import context points:', err);
    } finally {
      setIsImportingContext(false);
    }
  };

  // Load custom lenses from localStorage on mount
  useEffect(() => {
    setCustomLenses(getCustomLenses());
  }, []);

  // Merge core modes and custom lenses
  const allAvailableModes = useMemo(() => {
    const formattedCustom = (customLenses || []).map((c) => ({
      ...c,
      isCustom: true,
    }));
    return [...ACADEMIC_MODES, ...formattedCustom];
  }, [customLenses]);

  // Extract raw string document names for @ mention autocomplete
  const availableDocNames = useMemo(() => {
    return (documents || [])
      .map((d) => (typeof d === 'string' ? d : d?.doc_name || d?.name || d?.filename || ''))
      .filter(Boolean);
  }, [documents]);

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
              attached_images: m.meta?.attached_images || [],
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
      setAttachedDocs([]);
      setAttachedImages([]);
      setIsSessionLoading(false);
      const defaultGlobal = localStorage.getItem('scholarsmate_global_default_mode') || 'research';
      setCurrentMode(defaultGlobal);
    }
  }, [sessionId]);

  // Listen for global clear chat request from top navbar
  useEffect(() => {
    const handleClearChat = () => {
      setMessages([]);
      setAttachedDocs([]);
      setAttachedImages([]);
    };
    window.addEventListener('scholarsmate:clear-chat', handleClearChat);
    return () => window.removeEventListener('scholarsmate:clear-chat', handleClearChat);
  }, []);

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

  const handleSubmit = async (e, submittedImages = null, submittedText = '') => {
    e?.preventDefault();
    if (!availableModels || availableModels.length === 0) {
      if (onOpenSettings) onOpenSettings();
      return;
    }
    const imgsToUse = submittedImages || attachedImages || [];
    const hasImages = imgsToUse.length > 0;
    let userMessage = (submittedText || '').trim();
    if ((!userMessage && !hasImages) || loading) return;

    if (!userMessage && hasImages) {
      userMessage = 'Analyze the attached image and solve the query or explain the data.';
    }

    // Format clean image objects for RAG backend and user chat bubble
    const imagesPayload = imgsToUse.map((img) => ({
      name: img.name,
      previewUrl: img.previewUrl,
      extracted_text: img.extractedText || '',
      suggested_query: img.suggestedQuery || '',
    }));

    // Reset attached images in active input tray
    setAttachedImages([]);
    
    const nowIso = new Date().toISOString();
    const userMsgObj = { 
      sender: 'user', 
      text: userMessage, 
      mode_applied: currentMode,
      timestamp: nowIso,
      attached_docs: attachedDocs.length > 0 ? [...attachedDocs] : [],
      attached_images: imagesPayload.length > 0 ? imagesPayload : []
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
        customDirectiveToSend,
        imagesPayload,
        workspaceId
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
        if (onSessionCreated) {
          onSessionCreated(result.session_id);
        }
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
      {/* Workspace Sister Chats Context Points Banner */}
      {workspaceId && availableContextPoints.length > 0 && dismissedSessionId !== activeSessionId && (
        <div className="mx-6 mt-3 mb-1 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-amber-200 animate-in fade-in duration-200 shrink-0 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="truncate">
              Found <strong>{availableContextPoints.length}</strong> context point{availableContextPoints.length > 1 ? 's' : ''} from sister chats in this workspace.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              type="button"
              onClick={() => setIsContextModalOpen(true)}
              className="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold transition-colors cursor-pointer text-[11.5px]"
            >
              Review & Pull
            </button>
            <button
              type="button"
              onClick={() => setDismissedSessionId(activeSessionId)}
              className="text-zinc-400 hover:text-zinc-200 p-1 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Context Import Success Toast */}
      {contextToast && (
        <div className="mx-6 mt-2 mb-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in duration-150 shrink-0">
          <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>{contextToast}</span>
        </div>
      )}

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

            {(!availableModels || availableModels.length === 0) ? (
              <div className="mt-2 w-full max-w-sm rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 via-zinc-900/80 to-zinc-950 p-5 shadow-2xl backdrop-blur-md text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-inner">
                  <Key className="h-5 w-5 stroke-[2]" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
                  Add an API key to start
                </h2>
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed max-w-xs">
                  Connect a free or BYOK model (Google Gemini, Groq, OpenAI, Anthropic, or Ollama) to begin research chat and synthesis.
                </p>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Configure API Key</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed font-mono">
                Tip: Drag and drop files onto the chat, or type <span className="text-amber-400">@</span> to tag a paper.
              </p>
            )}
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
        onDocumentUploaded={onDocumentUploaded}
        attachedDocs={attachedDocs}
        setAttachedDocs={setAttachedDocs}
        attachedImages={attachedImages}
        setAttachedImages={setAttachedImages}
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

      {/* Workspace Sister Chats Context Points Pull Modal */}
      {isContextModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl relative text-zinc-100 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  Pull Context Points from Sister Chats
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsContextModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 mt-2 mb-3">
              Select verified insights and user preferences discovered in other chats of this workspace to pull into this conversation. (Zero token cost)
            </p>

            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 px-1">
              <span>{selectedContextIds.size} of {availableContextPoints.length} selected</span>
              <button
                type="button"
                onClick={() => {
                  if (selectedContextIds.size === availableContextPoints.length) {
                    setSelectedContextIds(new Set());
                  } else {
                    setSelectedContextIds(new Set(availableContextPoints.map((p) => p.id)));
                  }
                }}
                className="text-amber-400 hover:text-amber-300 font-medium text-[11.5px] cursor-pointer"
              >
                {selectedContextIds.size === availableContextPoints.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[45vh]">
              {availableContextPoints.map((pt) => {
                const isSelected = selectedContextIds.has(pt.id);
                return (
                  <div
                    key={pt.id}
                    onClick={() => {
                      const next = new Set(selectedContextIds);
                      if (next.has(pt.id)) next.delete(pt.id);
                      else next.add(pt.id);
                      setSelectedContextIds(next);
                    }}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/30 text-zinc-200'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-0.5 accent-amber-500 rounded cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {pt.category || 'INSIGHT'}
                        </span>
                        {pt.session_title && (
                          <span className="text-[10px] text-zinc-500 truncate">
                            from {pt.session_title}
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] text-zinc-200 leading-relaxed select-text">
                        {pt.thought}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 mt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsContextModalOpen(false)}
                className="px-3 py-1.5 rounded-xl border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isImportingContext || selectedContextIds.size === 0}
                onClick={handleImportContextPoints}
                className="px-4 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isImportingContext && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>Pull Selected ({selectedContextIds.size})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}