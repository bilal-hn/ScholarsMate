import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { 
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
import AppLogo, { BrandName, ScholarsMateIntro, ChessPieceLoader } from '../common/AppLogo';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import CustomLensModal from '../modals/CustomLensModal';
import WorkspaceLoadingState from './WorkspaceLoadingState';
import { 
  sendQuery, 
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
    tagline: 'Strict document RAG: 100% grounded in your uploaded papers with exact citations',
    description: 'Direct, evidence-locked answers strictly sourced from your documents with page citations [Doc, p.X].',
    temperature: 0.1,
    top_k: 8,
    slash_commands: ['/paper', '/assistant', '/strict', '/ask', '/doc', '/read'],
    prompt_directive: `### Active Mode: [Paper Assistant - Strict Document RAG]
You are ScholarsMate's Paper Assistant, dedicated strictly to answering from the user's uploaded materials.
- Answer solely and strictly using evidence from the retrieved document excerpts.
- You must answer strictly from the user's uploaded documents. If a question is not covered in the retrieved excerpts or uploaded documents, state clearly that the uploaded documents do not contain this information, and do not answer using general pre-trained knowledge.
- Append precise inline citations [Doc_Name, p.X] to every factual assertion, finding, and equation.
- Zero Hallucination & Strict Refusal: If an answer cannot be determined from the uploaded documents, state clearly that the materials do not contain this information. Do not extrapolate using outside general knowledge.`,
  },
  {
    id: 'general',
    name: 'General Assistant',
    short_name: 'General Assistant',
    icon: 'Sparkles',
    badge_color: 'purple',
    tagline: 'Hybrid RAG: Relates your documents to broader theory, background, & general knowledge',
    description: 'Answers questions using your documents as context while freely explaining background concepts, code, and out-of-scope topics.',
    temperature: 0.3,
    top_k: 6,
    slash_commands: ['/general', '/chat', '/hybrid', '/askall', '/explore'],
    prompt_directive: `### Active Mode: [General Assistant - Hybrid Document & World Knowledge]
You are ScholarsMate's General Assistant, a versatile, intellectually rich research partner.
- Hybrid Grounding: Use the retrieved document excerpts as your primary anchor, but freely draw upon your broader pre-trained technical, scientific, mathematical, and coding knowledge.
- Contextual Bridging: When the user asks about concepts, prerequisites, or topics not explicitly defined in their papers (e.g. background theory, intuitive explanations, implementation code, comparisons with other methods), provide a comprehensive, helpful answer and relate it back to their uploaded documents wherever relevant.
- Citations: When citing or quoting specific findings, data points, or claims from the uploaded papers, append [Doc_Name, p.X]. For general knowledge, explain clearly without artificial citations.
- Never refuse simply because a topic is not in the uploaded documents.`,
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
  onDeleteChat,
  onOpenLitReview,
  onOpenMonograph,
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
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState(null); // quiet one-line status ("Stopped", failed retry)
  const [regenText, setRegenText] = useState(null); // question being regenerated in place (Try again / Edit)
  const abortRef = useRef(null); // AbortController of the in-flight request
  const startedAtRef = useRef(0);
  const latestRef = useRef({}); // freshest state for the stable Try again / Edit callbacks
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
    // A request still in flight belongs to the previous chat: abort it and ignore its response.
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setRegenText(null);
    setNotice(null);
    setActiveSessionId(sessionId || null);
    if (sessionId) {
      setIsSessionLoading(true);
      getSessionMessages(sessionId)
        .then((data) => {
          if (data && data.messages && data.messages.length > 0) {
            const mapped = data.messages.map((m) => ({
              id: m.id,
              persisted: true,
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
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setRegenText(null);
      setNotice(null);
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

  const runQuery = async ({
    text,
    regenerateId = null,
    model = currentModel,
    mode = currentMode,
    images = [],
    rawImages = [],
    restoreText = '', // only text the user actually typed (or edited); put back on Stop / failure
    baseMessages = messages,
  }) => {
    const isRegen = Boolean(regenerateId);
    const controller = new AbortController();
    abortRef.current = controller;
    startedAtRef.current = Date.now();
    setNotice(null);

    const nowIso = new Date().toISOString();
    const userMsgObj = {
      sender: 'user',
      text,
      mode_applied: mode,
      timestamp: nowIso,
      attached_docs: attachedDocs.length > 0 ? [...attachedDocs] : [],
      attached_images: images.length > 0 ? images : []
    };
    const newMessages = isRegen ? baseMessages : [...baseMessages, userMsgObj];
    if (isRegen) {
      setRegenText(text);
    } else {
      setMessages(newMessages);
    }
    setLoading(true);

    const startTime = performance.now();
    const putTextBack = () => {
      if (restoreText) setInput((cur) => (cur.trim() ? cur : restoreText));
    };

    try {
      const modeObj = allAvailableModes.find((m) => m.id === mode) || activeModeObj;
      const customDirectiveToSend = modeObj?.isCustom ? modeObj.prompt_directive : null;

      const result = await sendQuery(
        text,
        selectedDocs,
        newMessages,
        activeSessionId,
        10,
        model,
        mode,
        customDirectiveToSend,
        images,
        workspaceId,
        { signal: controller.signal, regenerateId }
      );

      // The chat was switched or cleared while this request was in flight: drop the response.
      if (abortRef.current !== controller) return;

      const endTime = performance.now();
      const durationSec = ((endTime - startTime) / 1000).toFixed(2);
      const promptTokens = estimateTokens(text) + (selectedDocs.length * 120);
      const completionTokens = estimateTokens(result.answer) + estimateTokens(result.thinking_process || '');
      const totalTokens = promptTokens + completionTokens;

      const appliedMode = result.mode_applied || mode;
      if (result.mode_applied && result.mode_applied !== currentMode) {
        setCurrentMode(result.mode_applied);
      }

      const responseMeta = result.meta || {
        responseTime: `${durationSec}s`,
        tokens: totalTokens,
        model,
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

      const botMsg = {
        id: result.message_id || undefined,
        persisted: Boolean(result.message_id),
        sender: 'bot',
        text: result.answer,
        thinking_process: result.thinking_process || null,
        sources: result.sources_used || [],
        model_name: result.model_name || model,
        mode_applied: appliedMode,
        meta: responseMeta,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => {
        if (!isRegen) return [...prev, botMsg];
        // Replace the regenerated pair by id, not by position.
        const i = prev.findIndex((m) => m.id === regenerateId);
        if (i < 1 || prev[i - 1].sender !== 'user') return prev;
        return [...prev.slice(0, i - 1), { ...prev[i - 1], text }, botMsg, ...prev.slice(i + 1)];
      });
    } catch (err) {
      if (abortRef.current !== controller) return; // stale request from a chat we left
      if (axios.isCancel(err)) {
        // Stop: drop the optimistic bubble and hand the question back, without overwriting a newer draft.
        if (!isRegen) {
          setMessages((prev) => prev.filter((m) => m !== userMsgObj));
          if (rawImages.length > 0) setAttachedImages((cur) => (cur.length > 0 ? cur : rawImages));
        }
        putTextBack();
        setNotice('Stopped');
      } else if (isRegen) {
        putTextBack();
        setNotice(`Try again failed: ${err.response?.data?.detail || err.message || 'Please check backend connection.'}`);
      } else {
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
            isError: true,
            text: `Generation failed: ${err.response?.data?.detail || err.message || 'Please check backend connection.'}`,
            thinking_process: null,
            sources: [],
            model_name: model,
            mode_applied: mode,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRegenText(null);
        setLoading(false);
      }
    }
  };

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

    const typed = userMessage; // empty for an image-only send: the synthesized text is never restored
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

    await runQuery({ text: userMessage, images: imagesPayload, rawImages: imgsToUse, restoreText: typed });
  };

  // Ignore a Stop that lands within 300 ms of Send, so a double-click on the shared button doesn't cancel the request.
  const handleStop = () => {
    if (Date.now() - startedAtRef.current < 300) return;
    abortRef.current?.abort();
  };

  // Try again / Edit: stable callbacks (they read the freshest state through latestRef) so React.memo(ChatMessage) holds.
  useEffect(() => {
    latestRef.current = { messages, loading, currentModel, currentMode, availableModels, runQuery };
  });

  // Try again: regenerate the last answer. A local error bubble was never saved, so it is resent as a normal query.
  const handleRegenerate = useCallback((kind) => {
    const { messages: msgs, loading: busy, currentModel: curModel, currentMode: curMode, availableModels: models, runQuery: run } = latestRef.current;
    if (busy) return;
    const last = msgs[msgs.length - 1];
    const prev = msgs[msgs.length - 2];
    if (last?.sender !== 'bot' || prev?.sender !== 'user') return;
    if (!last.persisted && !last.isError) return;

    let model = curModel;
    let mode = curMode;
    if (kind === 'model') {
      const ids = models.map((m) => m.id);
      model = ids[(ids.indexOf(curModel) + 1) % ids.length] || curModel;
    } else if (kind === 'mode') {
      mode = (last.mode_applied || curMode) === 'general' ? 'assistant' : 'general';
    }
    const images = prev.attached_images || [];
    if (last.persisted && last.id) {
      run({ text: prev.text, regenerateId: last.id, model, mode, images });
    } else {
      run({ text: prev.text, model, mode, images, baseMessages: msgs.slice(0, -2) });
    }
  }, []);

  // Edit the last question: regenerates the last answer from the new text.
  const handleEdit = useCallback((text) => {
    const { messages: msgs, loading: busy, runQuery: run } = latestRef.current;
    const last = msgs[msgs.length - 1];
    const prev = msgs[msgs.length - 2];
    if (busy || !last?.persisted || !last.id || last.sender !== 'bot' || prev?.sender !== 'user') return;
    run({ text, regenerateId: last.id, images: prev.attached_images || [], restoreText: text });
  }, []);

  // Prompt starters from the attached paper titles (file names, no extension). No LLM call.
  const starters = useMemo(() => {
    const titles = (selectedDocs || []).slice(0, 2).map((name) => {
      const t = String(name).replace(/\.[^./\\]+$/, '');
      return t.length > 70 ? `${t.slice(0, 67)}...` : t;
    });
    if (titles.length === 0) return [];
    const [a, b] = titles;
    return [
      `Summarise the methodology of ${a}`,
      `Which datasets and baselines does ${a} use?`,
      ...(b ? [`Compare ${a} with ${b}`] : []),
      `What are the limitations of ${a}?`,
    ];
  }, [selectedDocs]);

  const handleExportTranscript = () => {
    if (!messages || messages.length === 0) return;
    const mdContent = messages.map((m) => {
      const header = m.sender === 'user' ? '### User' : '### ScholarsMate';
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
  const displayMessages =
    regenText !== null
      ? [...messages.slice(0, -2), { ...messages[messages.length - 2], text: regenText }]
      : messages;

  return (
    <main className="flex-1 flex flex-col bg-zinc-950 h-full relative overflow-hidden text-zinc-200 font-sans transition-colors">
      {/* Workspace Sister Chats Context Points Banner */}
      {workspaceId && availableContextPoints.length > 0 && dismissedSessionId !== activeSessionId && (
        <div className="mx-4 mt-2 mb-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-zinc-200 animate-in fade-in duration-200 shrink-0 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="truncate text-[11.5px]">
              Found <strong>{availableContextPoints.length}</strong> blueprint takeaway{availableContextPoints.length > 1 ? 's' : ''} from prior chats in this workspace.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              type="button"
              onClick={() => setIsContextModalOpen(true)}
              className="px-2.5 py-0.5 rounded-md bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold transition-colors cursor-pointer text-[11px]"
            >
              Review & Pull
            </button>
            <button
              type="button"
              onClick={() => setDismissedSessionId(activeSessionId)}
              className="text-zinc-400 hover:text-zinc-200 p-0.5 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Context Import Success Toast */}
      {contextToast && (
        <div className="mx-4 mt-1.5 mb-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11.5px] flex items-center gap-2 animate-in fade-in duration-150 shrink-0">
          <Check className="h-3 w-3 text-emerald-400 shrink-0" />
          <span>{contextToast}</span>
        </div>
      )}

      {/* Main Content Area */}
      {isSessionLoading ? (
        <WorkspaceLoadingState />
      ) : isHeroEmpty ? (
        /* Minimalist Hero Empty State with Signature Intro Animation */
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center select-none relative">
          <div className="max-w-md w-full flex flex-col items-center -mt-6">
            {/* Signature ScholarsMate Intro Animation */}
            <ScholarsMateIntro key={activeSessionId || 'empty-chat-intro'} />

            <p className="text-xs text-zinc-400 max-w-sm text-center leading-relaxed mt-4 mb-4 font-sans">
              Interrogate papers with grounded citations, configure research context, and synthesize findings with precision.
            </p>

            {(!availableModels || availableModels.length === 0) ? (
              <div className="mt-1 w-full max-w-xs rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 shadow-lg text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 shadow-inner">
                  <Key className="h-4 w-4 stroke-[2]" />
                </div>
                <h2 className="text-xs font-semibold text-zinc-100 tracking-tight">
                  Add an API key to start
                </h2>
                <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed max-w-xs">
                  Connect a free or BYOK model (Google Gemini, Groq, OpenAI, Anthropic, or Ollama) to begin research chat and synthesis.
                </p>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 px-3 py-1.5 text-xs font-semibold transition-all shadow cursor-pointer"
                >
                  <Plus className="h-3 w-3 stroke-[2.5]" />
                  <span>Configure API Key</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            ) : documents && documents.length === 0 ? (
              <div className="mt-1 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 max-w-xs text-center space-y-1">
                <p className="text-[11px] text-zinc-200 font-medium">No documents attached yet</p>
                <p className="text-[10.5px] text-zinc-400 leading-relaxed font-sans">
                  Upload documents (PDFs, books, notes) or select from your library to start chatting. ScholarsMate answers questions strictly from your uploaded materials.
                </p>
              </div>
            ) : (
              <>
                {starters.length > 0 && (
                  <div className="flex flex-col items-stretch gap-1.5 w-full max-w-sm mb-3" role="group" aria-label="Prompt starters">
                    {starters.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={loading}
                        onClick={() => handleSubmit(null, null, q)}
                        className="px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-[11px] text-left truncate cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 disabled:opacity-50"
                        title={q}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              <p className="text-[10.5px] text-zinc-500 max-w-xs leading-relaxed font-mono">
                Tip: Drag and drop files onto the chat, or type <span className="text-amber-400 font-medium">@</span> to tag a paper.
              </p>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Messages Feed */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 max-w-3xl mx-auto w-full">
          {displayMessages.map((msg, idx) => (
            <ChatMessage
              key={idx}
              message={msg}
              index={idx}
              isLast={!loading && idx === displayMessages.length - 1 && msg.sender === 'bot' && displayMessages[idx - 1]?.sender === 'user'}
              canSwitchModel={availableModels.length > 1}
              onRegenerate={handleRegenerate}
              onEdit={
                !loading && idx === displayMessages.length - 2 && msg.sender === 'user' &&
                displayMessages[idx + 1]?.sender === 'bot' && displayMessages[idx + 1]?.persisted
                  ? handleEdit
                  : undefined
              }
              onSelectCitation={onSelectCitation}
              onOpenMonograph={onOpenMonograph}
            />
          ))}

          {loading && (
            <div className="w-full flex justify-start my-2 animate-in fade-in duration-200">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl px-5 py-3.5 text-zinc-300 text-xs shadow-xl space-y-2.5 max-w-md w-full">
                <div className="flex items-center gap-3 text-zinc-300">
                  <ChessPieceLoader size="sm" />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-zinc-200">Thinking...</span>
                  </div>
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

      {notice && (
        <p role="status" className="shrink-0 text-center text-[11px] text-zinc-500 py-1 select-none">
          {notice}
        </p>
      )}

      {/* Floating Chat Input with 9-Dots Matrix Menu, Scoped Docs, and Minimal Lens Selector */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        onStop={handleStop}
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
        onOpenLitReview={onOpenLitReview}
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
        messages={messages}
        onDeleteChat={onDeleteChat}
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
                  Pull Blueprint Takeaways from Prior Chats
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
              Select verified project decisions, empirical parameters, and findings discovered in other chats of this workspace to pull into this conversation. (Zero token cost)
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