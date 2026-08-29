import React, { useState, useRef, useEffect } from 'react';
import { 
  Compass, 
  Loader2, 
  Check, 
  Eye, 
  Plus, 
  Edit2, 
  Trash2, 
  Sparkles 
} from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import LiteratureReviewModal from '../modals/LiteratureReviewModal';
import PromptInspectorModal from '../modals/PromptInspectorModal';
import CustomLensModal from '../modals/CustomLensModal';
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
    id: 'research',
    name: 'Research Synthesizer',
    short_name: 'Research',
    tagline: 'Rigorous, citation-dense academic analysis',
    description: 'Publication-grade synthesis, benchmark tables, and methodology trade-offs.',
    temperature: 0.0,
    top_k: 8,
    slash_commands: ['/research', '/synth', '/academic'],
    prompt_directive: `### Active Lens Directives: [Research Synthesizer]
- Deliver an authoritative, publication-grade academic synthesis directly addressing the user's inquiry.
- Prioritize technical precision, quantitative benchmark metrics, and exact algorithmic or theoretical definitions found in the text.
- When comparing multiple approaches, models, or datasets, format the trade-offs inside a clean, structured Markdown table.
- Append precise inline citations [Doc_Name, p.X] to every factual assertion, finding, and data point.
- Avoid generic conversational filler; begin directly with the academic analysis.`,
  },
  {
    id: 'socratic',
    name: 'Socratic Tutor',
    short_name: 'Socratic Tutor',
    tagline: 'Intuitive clarity & Feynman first-principles',
    description: 'Explains complex papers intuitively using real-world analogies, step-by-step logic, and adaptive check questions.',
    temperature: 0.2,
    top_k: 8,
    slash_commands: ['/socratic', '/tutor', '/explain', '/teach'],
    prompt_directive: `### Active Lens Directives: [Socratic Masterclass Tutor]
Adopt the persona of a world-class, friendly computer science / academic professor at office hours (inspired by Richard Feynman and 3Blue1Brown).

Pedagogical Rules:
1. **Adaptive Scope (Do Not Over-Engineer):** Calibrate your response length to the question.
   - For basic or foundational questions (e.g. "What is RAG?"): Give a crisp, crystal-clear 2 to 3 paragraph explanation with an intuitive real-world analogy. Do not force an unnecessary 6-part dissertation.
   - For complex, multi-stage systems: Break down (1) the core problem that forced its invention, (2) the step-by-step mechanism, and (3) a clean flowchart or table.
2. **Mandatory Relatable Analogy (The Feynman Principle):** Anchor abstract mathematical or architectural jargon with a vivid, relatable real-world metaphor before diving into technical details.
3. **Motivated Engineering (Why, Not Just What):** Explain *why* the authors made specific design choices (e.g. why dot-product attention instead of RNNs).
4. **Strict Grounding & Citations:** Every technical fact and finding must be attributed with [Doc_Name, p.X].
5. **Targeted Follow-up:** End with **1 concise, thought-provoking conceptual check question** (marked with 💡) that tests active understanding without being patronizing.`,
  },
  {
    id: 'reviewer',
    name: 'Peer Reviewer',
    short_name: 'Peer Reviewer',
    tagline: 'Critical red-team audit & limitation analysis',
    description: 'Audits methodology, unstated assumptions, and potential vulnerabilities.',
    temperature: 0.1,
    top_k: 10,
    slash_commands: ['/reviewer', '/critique', '/audit', '/redteam'],
    prompt_directive: `### Active Lens Directives: [Peer Reviewer & Red Team Auditor]
Adopt the analytical, discerning persona of a senior academic meta-reviewer (e.g., NeurIPS, ICML, Nature reviewer).

Structure your critique as follows:
1. **Validated Strengths:** Concisely state the legitimate empirical and theoretical contributions substantiated by the paper [Doc_Name, p.X].
2. **Methodological Vulnerabilities & Unstated Assumptions:** Dissect theoretical gaps, dataset scale limits, missing baselines, and synthetic evaluation biases.
3. **Scalability & Deployment Realities:** Detail computational overhead, latency penalties, hardware constraints, or out-of-distribution failure modes.
- Support all criticisms by quoting or citing the author's own stated claims and empirical bounds with [Doc_Name, p.X].`,
  },
  {
    id: 'executive',
    name: 'Executive Brief',
    short_name: 'Executive Brief',
    tagline: 'High-density TL;DR & key takeaways',
    description: 'Core innovations, quantitative highlights, and 3 actionable takeaways.',
    temperature: 0.0,
    top_k: 5,
    slash_commands: ['/executive', '/brief', '/tldr', '/summary'],
    prompt_directive: `### Active Lens Directives: [Executive Brief & Rapid Triage]
Deliver a high-density, zero-fluff technical briefing structured for rapid executive triage.

Format strictly under these 4 section headers:
- **Executive TL;DR:** Exactly 2 sentences summarizing the core problem and the proposed solution.
- **Key Innovation:** What is genuinely novel compared to prior literature [Doc_Name, p.X].
- **Quantitative Highlights:** A compact table or bulleted list of top benchmark metrics and efficiency gains.
- **3 Actionable Takeaways:** Three concrete, practical engineering or research implications.
- Ground all metrics and claims with citations [Doc_Name, p.X].`,
  },
  {
    id: 'survey',
    name: 'Literature Survey',
    short_name: 'Literature Survey',
    tagline: 'Cross-paper synthesis & timeline mapping',
    description: 'Groups approaches by school of thought, comparative matrix, and research gaps.',
    temperature: 0.0,
    top_k: 12,
    slash_commands: ['/survey', '/litreview', '/compare', '/timeline'],
    prompt_directive: `### Active Lens Directives: [Literature Survey & Cross-Paper Synthesis]
Synthesize evidence across all relevant papers in the workspace.

When synthesizing:
1. **Thematic Categorization:** Group retrieved papers and paradigms into coherent schools of thought.
2. **Comparative Synthesis Matrix:** Build a clear Markdown table comparing methodologies, advantages, and limitations across papers.
3. **Evolution of Ideas:** Explain how newer techniques addressed previous bottlenecks or failure modes.
4. **Open Research Gaps:** Highlight unresolved contradictions, benchmark voids, or future research frontiers.
5. Explicitly attribute every finding with inline citations [Doc_Name, p.X].`,
  },
];

import WorkspaceLoadingState from './WorkspaceLoadingState';

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
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(sessionId || null);
  const [currentMode, setCurrentMode] = useState(() => {
    return localStorage.getItem('scholarsmate_global_default_mode') || 'research';
  });
  const [customLenses, setCustomLenses] = useState([]);
  const [inspectingMode, setInspectingMode] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
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

  const handleOpenInspector = (mode, e) => {
    e?.stopPropagation();
    setInspectingMode(mode);
    setIsInspectorOpen(true);
    setIsModeDropdownOpen(false);
  };

  const handleOpenCustomLensModal = (lens = null, e) => {
    e?.stopPropagation();
    setEditingLens(lens);
    setIsCustomLensModalOpen(true);
    setIsModeDropdownOpen(false);
  };

  const handleCloneAsCustom = (mode) => {
    setEditingLens({
      name: `${mode.name} (Custom)`,
      short_name: `${mode.short_name || mode.name}`,
      tagline: mode.tagline || mode.description,
      description: mode.tagline || mode.description,
      slashCommand: `/${mode.id}_custom`,
      iconName: mode.icon?.name || 'Sparkles',
      colorId: 'amber',
      temperature: mode.temperature ?? 0.1,
      prompt_directive: mode.prompt_directive || mode.description || '',
    });
    setIsCustomLensModalOpen(true);
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
                  <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                  <span className="font-medium text-zinc-200">Synthesizing evidence across papers...</span>
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
        onOpenInspector={handleOpenInspector}
        onOpenCustomLensModal={handleOpenCustomLensModal}
        documents={documents}
        selectedDocs={selectedDocs}
        setSelectedDocs={setSelectedDocs}
        onOpenLitReview={() => setIsLitReviewOpen(true)}
        onExportTranscript={handleExportTranscript}
        onClearMessages={handleClearMessages}
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

      {/* Prompt Transparency Inspector Modal */}
      <PromptInspectorModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        modeObj={inspectingMode}
        onCloneAsCustom={handleCloneAsCustom}
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