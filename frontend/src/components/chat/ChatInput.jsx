import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  ArrowUp, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Key, 
  Check, 
  FileText,
  Search,
  LayoutGrid,
  Clock,
  Cpu,
  Layers,
  BookOpen,
  Download,
  Trash2,
  CheckSquare,
  Square,
  Eye,
  Edit2
} from 'lucide-react';

export const SLASH_COMMANDS = [
  { cmd: '/research', mode: 'research', label: 'Research Synthesizer', desc: 'Formal citation-dense synthesis with benchmark tables' },
  { cmd: '/socratic', mode: 'socratic', label: 'Socratic Tutor', desc: 'Intuitive Feynman breakdown with 1 check question' },
  { cmd: '/critique', mode: 'reviewer', label: 'Peer Reviewer', desc: 'Red-team critical audit of methodology & limitations' },
  { cmd: '/brief', mode: 'executive', label: 'Executive Brief', desc: 'High-density TL;DR, core innovation & takeaways' },
  { cmd: '/survey', mode: 'survey', label: 'Literature Survey', desc: 'Cross-paper comparative synthesis & timelines' },
];

export default function ChatInput({
  input,
  setInput,
  onSubmit,
  loading,
  availableModels = [],
  currentModel,
  onModelChange,
  onOpenSettings,
  availableDocuments = [],
  telemetry = null, // { responseTime, tokenUsage, docCount, isCached }
  customLenses = [],
  currentMode = 'research',
  onModeChange,
  allAvailableModes = [],
  onOpenInspector,
  onOpenCustomLensModal,
  documents = [],
  selectedDocs = [],
  setSelectedDocs,
  onOpenLitReview,
  onExportTranscript,
  onClearMessages,
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLensDropdownOpen, setIsLensDropdownOpen] = useState(false);
  const [isMatrixMenuOpen, setIsMatrixMenuOpen] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [isDeepSearchActive, setIsDeepSearchActive] = useState(false);
  
  const dropdownRef = useRef(null);
  const lensDropdownRef = useRef(null);
  const matrixMenuRef = useRef(null);
  const textareaRef = useRef(null);

  // Combine default and custom slash commands
  const allSlashCommands = useMemo(() => {
    const customCmds = (customLenses || [])
      .map((l) => {
        const cmd = l.slash_commands?.[0] || l.slashCommand || `/${l.id}`;
        return {
          cmd: cmd.startsWith('/') ? cmd : `/${cmd}`,
          mode: l.id,
          label: l.name,
          desc: l.tagline || l.description || 'Custom Academic Lens',
        };
      })
      .filter((c) => Boolean(c.cmd));

    return [...SLASH_COMMANDS, ...customCmds];
  }, [customLenses]);

  // @ Mention State
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionMenuRef = useRef(null);

  // Slash Command Menu State
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);

  // Filter documents matching whatever is typed after '@'
  const matchingDocuments = useMemo(() => {
    if (!showMentionMenu) return [];
    const query = mentionQuery.toLowerCase().trim();
    if (!query) return availableDocuments;
    return availableDocuments.filter((doc) => doc.toLowerCase().includes(query));
  }, [showMentionMenu, mentionQuery, availableDocuments]);

  // Filter slash commands matching whatever is typed after '/'
  const matchingSlashCommands = useMemo(() => {
    if (!showSlashMenu) return [];
    const query = slashQuery.toLowerCase().trim();
    if (!query) return allSlashCommands;
    return allSlashCommands.filter(
      (c) => c.cmd.toLowerCase().includes(query) || c.label.toLowerCase().includes(query)
    );
  }, [showSlashMenu, slashQuery, allSlashCommands]);

  // Track '@' and '/' triggers in textarea
  const handleInputChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);

    // Look at the text before the current cursor
    const textBeforeCursor = value.slice(0, cursorPos);

    // 1. Check for slash command at the very start
    const slashMatch = textBeforeCursor.match(/^\/([a-zA-Z]*)$/);
    if (slashMatch) {
      setShowSlashMenu(true);
      setSlashQuery(slashMatch[1]);
      setSlashIndex(0);
      setShowMentionMenu(false);
      return;
    } else {
      setShowSlashMenu(false);
    }

    // 2. Check for @ document mention
    const lastWordMatch = textBeforeCursor.match(/@([^\s]*)$/);
    if (lastWordMatch && availableDocuments.length > 0) {
      setShowMentionMenu(true);
      setMentionQuery(lastWordMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentionMenu(false);
    }
  };

  // Insert the selected document tag into the textarea
  const selectDocumentTag = (docName) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);

    // Replace the trailing '@query' with '@docName '
    const updatedBefore = textBeforeCursor.replace(/@([^\s]*)$/, `@${docName} `);
    const fullNewText = updatedBefore + textAfterCursor;

    setInput(fullNewText);
    setShowMentionMenu(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(updatedBefore.length, updatedBefore.length);
      }
    }, 0);
  };

  // Insert selected slash command into the textarea
  const selectSlashCommand = (item) => {
    if (!textareaRef.current) return;
    const fullNewText = `${item.cmd} `;
    setInput(fullNewText);
    setShowSlashMenu(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(fullNewText.length, fullNewText.length);
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    // Slash commands navigation
    if (showSlashMenu && matchingSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((prev) => (prev + 1) % matchingSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((prev) => (prev - 1 + matchingSlashCommands.length) % matchingSlashCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSlashCommand(matchingSlashCommands[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    // Mention navigation
    if (showMentionMenu && matchingDocuments.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % matchingDocuments.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + matchingDocuments.length) % matchingDocuments.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectDocumentTag(matchingDocuments[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setShowMentionMenu(false);
      setShowSlashMenu(false);
      onSubmit(e);
    }
  };

  const formatModelInfo = (model) => {
    const rawId = model?.id || '';
    const rawName = model?.name || rawId;

    let cleanTitle = rawName
      .replace(/^models\//i, '')
      .replace(/^gemini\//i, '')
      .replace(/^gemini-/i, '')
      .replace(/^openai\//i, '')
      .replace(/^groq\//i, '')
      .replace(/^anthropic\//i, '')
      .replace(/-/g, ' ');

    cleanTitle = cleanTitle
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const lower = (rawId + ' ' + rawName).toLowerCase();
    let subtitle = 'General intelligence';

    if (lower.includes('deep-research') || lower.includes('deep research') || lower.includes('research')) {
      subtitle = 'Autonomous research agent';
    } else if (lower.includes('gemma') || lower.includes('llama')) {
      subtitle = 'Open foundation weights';
    } else if (lower.includes('lite') || lower.includes('8b') || lower.includes('haiku') || lower.includes('mini')) {
      subtitle = 'Fastest answers & lowest latency';
    } else if (lower.includes('pro') || lower.includes('opus') || lower.includes('o1') || lower.includes('o3')) {
      subtitle = 'Advanced reasoning & STEM';
    } else if (lower.includes('omni')) {
      subtitle = 'Multimodal reasoning';
    } else if (lower.includes('flash') || lower.includes('turbo')) {
      subtitle = 'All-around balance & speed';
    }

    return {
      title: cleanTitle || 'Select Model',
      rawId: rawId,
      subtitle: subtitle,
      provider: model?.provider?.toUpperCase() || 'LLM'
    };
  };

  const filteredModels = useMemo(() => {
    const blacklisted = [
      'tts', 'lyria', 'robotics', 'computer-use', 
      'imagen', 'embedding', 'aqa', '2.5-flash', '2.5-pro'
    ];
    
    const seen = new Set();
    const result = [];

    (availableModels || []).forEach((m) => {
      const raw = (m.id || '').toLowerCase();
      const isBad = blacklisted.some((bad) => raw.includes(bad));
      if (!isBad && !seen.has(m.id)) {
        seen.add(m.id);
        result.push(m);
      }
    });

    return result;
  }, [availableModels]);

  const groupedModels = useMemo(() => {
    const groups = {};
    filteredModels.forEach((model) => {
      const prov = (model.provider || 'custom').toLowerCase();
      if (!groups[prov]) {
        groups[prov] = [];
      }
      groups[prov].push(model);
    });
    return groups;
  }, [filteredModels]);

  useEffect(() => {
    if (isDropdownOpen && currentModel) {
      const activeObj = filteredModels.find((m) => m.id === currentModel);
      if (activeObj) {
        setExpandedProvider(activeObj.provider?.toLowerCase() || null);
      }
    }
  }, [isDropdownOpen, currentModel, filteredModels]);

  const slashMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (lensDropdownRef.current && !lensDropdownRef.current.contains(event.target)) {
        setIsLensDropdownOpen(false);
      }
      if (matrixMenuRef.current && !matrixMenuRef.current.contains(event.target)) {
        setIsMatrixMenuOpen(false);
      }
      if (mentionMenuRef.current && !mentionMenuRef.current.contains(event.target)) {
        setShowMentionMenu(false);
      }
      if (slashMenuRef.current && !slashMenuRef.current.contains(event.target)) {
        setShowSlashMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDoc = (docName) => {
    if (!setSelectedDocs) return;
    if (selectedDocs.includes(docName)) {
      setSelectedDocs(selectedDocs.filter((name) => name !== docName));
    } else {
      setSelectedDocs([...selectedDocs, docName]);
    }
  };

  const toggleSelectAll = () => {
    if (!setSelectedDocs) return;
    if (selectedDocs.length === documents.length) {
      setSelectedDocs([]);
    } else {
      setSelectedDocs(documents.map((d) => d.doc_name));
    }
  };

  const getScopeLabel = () => {
    if (!documents || documents.length === 0) return 'No papers';
    if (selectedDocs.length === 0 || selectedDocs.length === documents.length) {
      return `All (${documents.length})`;
    }
    return `${selectedDocs.length} of ${documents.length}`;
  };

  const selectedModelObj = filteredModels.find((m) => m.id === currentModel) || filteredModels[0];
  const currentFormatted = formatModelInfo(selectedModelObj);

  const activeModeObj = useMemo(() => {
    return allAvailableModes.find((m) => m.id === currentMode) || allAvailableModes[0] || {
      id: 'research',
      name: 'Research Synthesizer',
      short_name: 'Research',
    };
  }, [allAvailableModes, currentMode]);

  return (
    <div className="w-full px-4 pb-4 pt-1 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent shrink-0 relative z-30 transition-colors">
      <form
        onSubmit={onSubmit}
        className="max-w-3xl mx-auto bg-zinc-900 hover:bg-zinc-900/95 border border-zinc-800 hover:border-zinc-700/80 focus-within:border-zinc-600 rounded-2xl p-3 flex flex-col gap-2 transition-all shadow-2xl relative"
      >
        {/* Slash Command Autocomplete Menu */}
        {showSlashMenu && matchingSlashCommands.length > 0 && (
          <div
            ref={slashMenuRef}
            className="absolute bottom-full left-3 mb-2.5 w-80 max-h-60 overflow-y-auto bg-zinc-900/95 border border-zinc-800 rounded-xl p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 tracking-wider border-b border-zinc-800/80 mb-1 flex items-center justify-between font-mono">
              <span>Academic Slash Commands</span>
              <span className="text-[9px] text-zinc-600 font-normal">↵ to select</span>
            </div>
            <div className="space-y-0.5">
              {matchingSlashCommands.map((item, idx) => {
                const isFocused = idx === slashIndex;
                return (
                  <button
                    key={item.cmd}
                    type="button"
                    onClick={() => selectSlashCommand(item)}
                    onMouseEnter={() => setSlashIndex(idx)}
                    className={`w-full flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      isFocused
                        ? 'bg-zinc-800 text-amber-300 font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    <span className="font-mono text-amber-400 font-bold shrink-0 text-[11.5px] mt-0.5">{item.cmd}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] font-semibold text-zinc-200">{item.label}</div>
                      <div className="text-[10.5px] text-zinc-400 truncate">{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* @ Mention Document Autocomplete Menu */}
        {showMentionMenu && matchingDocuments.length > 0 && (
          <div
            ref={mentionMenuRef}
            className="absolute bottom-full left-3 mb-2.5 w-80 max-h-60 overflow-y-auto bg-zinc-900/95 border border-zinc-800 rounded-xl p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 tracking-wider border-b border-zinc-800/80 mb-1 flex items-center justify-between font-mono">
              <span>Indexed Research Documents</span>
              <span className="text-[9px] text-zinc-600 font-normal">↵ to tag</span>
            </div>
            <div className="space-y-0.5">
              {matchingDocuments.map((doc, idx) => {
                const isFocused = idx === mentionIndex;
                return (
                  <button
                    key={doc}
                    type="button"
                    onClick={() => selectDocumentTag(doc)}
                    onMouseEnter={() => setMentionIndex(idx)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      isFocused
                        ? 'bg-zinc-800 text-amber-300 font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate flex-1 font-mono text-[11.5px]">{doc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Textarea Input */}
        <textarea
          ref={textareaRef}
          rows={2}
          placeholder="Message ScholarsMate or type @ to tag a file..."
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-[13.5px] text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none px-2 pt-1 font-sans leading-relaxed"
        />

        {/* Bottom Control & Tool Row */}
        <div className="flex items-center justify-between pt-0.5 px-1">
          {/* Left Action Toolbar */}
          <div className="flex items-center gap-1.5">
            {/* 9-Dots Matrix Menu Button */}
            <div className="relative" ref={matrixMenuRef}>
              <button
                type="button"
                onClick={() => setIsMatrixMenuOpen((prev) => !prev)}
                title="Workspace Tools & Scoped Documents"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isMatrixMenuOpen
                    ? 'text-amber-400 bg-zinc-800'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>

              {/* 9-Dots Matrix Menu Popover */}
              {isMatrixMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2.5 w-80 bg-zinc-900 border border-zinc-800 rounded-xl p-2 shadow-2xl backdrop-blur-xl z-50 text-zinc-200 animate-in fade-in zoom-in-95 duration-100">
                  {/* Scoped Documents Header */}
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-mono border-b border-zinc-800 mb-1.5 flex items-center justify-between">
                    <span>Scoped Documents ({getScopeLabel()})</span>
                    {documents.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-amber-400 hover:underline cursor-pointer lowercase font-sans font-normal text-[10.5px]"
                      >
                        
                      </button>
                    )}
                  </div>

                  {/* Scoped Documents List */}
                  <div className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5 mb-2 border-b border-zinc-800/80 pb-1.5">
                    {documents.length === 0 ? (
                      <p className="text-[11px] text-zinc-500 py-2 text-center font-mono">No PDFs indexed in this workspace.</p>
                    ) : (
                      documents.map((doc) => {
                        const isSelected = selectedDocs.length === 0 || selectedDocs.includes(doc.doc_name);
                        return (
                          <div
                            key={doc.doc_name}
                            onClick={() => toggleDoc(doc.doc_name)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-zinc-800 text-zinc-100 font-medium'
                                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                            }`}
                          >
                            {isSelected ? (
                              <CheckSquare className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <Square className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                            )}
                            <span className="truncate flex-1 text-[11.5px]">{doc.doc_name}</span>
                            <span className="text-[9.5px] font-mono text-zinc-500">{doc.chunk_count}c</span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Tools & Actions */}
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenLitReview) onOpenLitReview();
                        setIsMatrixMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-amber-300 hover:bg-zinc-800/60 transition-colors cursor-pointer text-left"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Literature Review Studio</span>
                    </button>

                    {onExportTranscript && (
                      <button
                        type="button"
                        onClick={() => {
                          onExportTranscript();
                          setIsMatrixMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer text-left"
                      >
                        <Download className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Export Chat Transcript</span>
                      </button>
                    )}

                    {onClearMessages && (
                      <button
                        type="button"
                        onClick={() => {
                          onClearMessages();
                          setIsMatrixMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-rose-400/90 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer text-left"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Clear Chat History</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Search Tool Toggle */}
            <button
              type="button"
              onClick={() => setIsDeepSearchActive(!isDeepSearchActive)}
              title={isDeepSearchActive ? "Deep Search Active" : "Deep Search Mode"}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isDeepSearchActive
                  ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
            </button>

            {/* Attach File Button */}
            <button
              type="button"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Attach Research Paper"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Right Controls: Academic Lens Selector, Model Pill, Submit */}
          <div className="flex items-center gap-2">
            {/* Academic Lens Selector Pill */}
            <div className="relative" ref={lensDropdownRef}>
              <button
                type="button"
                onClick={() => setIsLensDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all cursor-pointer select-none"
                title={`Active Lens: ${activeModeObj?.name || 'Academic Lens'}`}
              >
                <span>{activeModeObj?.short_name || activeModeObj?.name || 'Research'}</span>
                <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform duration-150 ${isLensDropdownOpen ? 'rotate-180 text-amber-400' : ''}`} />
              </button>

              {/* Lens Selector Popover */}
              {isLensDropdownOpen && (
                <div className="absolute bottom-full right-0 mb-2.5 w-80 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150 max-h-[70vh] overflow-y-auto">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-mono border-b border-zinc-800/80 mb-1 flex items-center justify-between">
                    <span>Academic Reasoning Lens</span>
                  </div>

                  <div className="space-y-0.5">
                    {(allAvailableModes || []).map((mode) => {
                      const isSelected = mode.id === currentMode;
                      return (
                        <div
                          key={mode.id}
                          onClick={() => {
                            if (onModeChange) onModeChange(mode.id);
                            setIsLensDropdownOpen(false);
                          }}
                          className={`w-full flex items-start justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer group ${
                            isSelected ? 'bg-zinc-800 text-zinc-100 font-medium' : 'hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center justify-between">
                              <span className={`text-[12px] ${isSelected ? 'text-zinc-100 font-semibold' : 'text-zinc-300'}`}>
                                {mode.name}
                              </span>
                            </div>
                            <p className="text-[10.5px] text-zinc-500 leading-tight mt-0.5 truncate">{mode.tagline || mode.description}</p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 mt-0.5">
                            {onOpenInspector && (
                              <button
                                type="button"
                                title="Inspect System Prompt"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenInspector(mode, e);
                                  setIsLensDropdownOpen(false);
                                }}
                                className="p-1 rounded text-zinc-500 hover:text-amber-300 hover:bg-zinc-700/60 transition-colors"
                              >
                                <Eye className="h-3 w-3" />
                              </button>
                            )}
                            {mode.isCustom && onOpenCustomLensModal && (
                              <button
                                type="button"
                                title="Edit Custom Lens"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenCustomLensModal(mode, e);
                                  setIsLensDropdownOpen(false);
                                }}
                                className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/60 transition-colors"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            )}
                            {isSelected && <Check className="h-3.5 w-3.5 text-amber-400 ml-1" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Create Custom Lens Button */}
                  {onOpenCustomLensModal && (
                    <div className="mt-1.5 pt-1.5 border-t border-zinc-800/80">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCustomLensModal(null, e);
                          setIsLensDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-700/50 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 text-amber-400" />
                        <span>Create Custom Lens</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Model Selector Pill */}
            {filteredModels && filteredModels.length > 0 ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all cursor-pointer"
                >
                  <span className="text-amber-400 font-mono text-[11px]">@</span>
                  <span className="truncate max-w-[120px] text-[11.5px] font-mono">{currentFormatted.rawId || currentFormatted.title}</span>
                  <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform duration-150 ${isDropdownOpen ? 'rotate-180 text-amber-400' : ''}`} />
                </button>

                {/* Model Selector Dropdown Popover */}
                {isDropdownOpen && (
                  <div className="absolute bottom-full right-0 mb-2.5 w-72 bg-zinc-900/98 border border-zinc-800 rounded-xl p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150 text-zinc-200">
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 tracking-wider border-b border-zinc-800 mb-1.5 flex items-center justify-between">
                      <span>Available Models</span>
                      <span className="text-[9px] text-zinc-600 font-normal">{filteredModels.length} active</span>
                    </div>

                    <div className="max-h-64 overflow-y-auto space-y-1 pr-0.5">
                      {Object.entries(groupedModels).map(([providerKey, modelsList]) => {
                        const isExpanded = expandedProvider === providerKey;
                        const hasActiveModel = modelsList.some((m) => m.id === currentModel);

                        return (
                          <div
                            key={providerKey}
                            className="border border-zinc-800/60 rounded-lg overflow-hidden bg-zinc-900/40"
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedProvider(isExpanded ? null : providerKey)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                                hasActiveModel ? 'text-amber-400 font-semibold' : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="uppercase tracking-wide text-[11px]">{providerKey}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                                  {modelsList.length}
                                </span>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3 text-zinc-400" />
                              ) : (
                                <ChevronRight className="h-3 w-3 text-zinc-500" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="px-1 pb-1 pt-0.5 space-y-0.5 border-t border-zinc-800/50 bg-zinc-950/40 max-h-40 overflow-y-auto">
                                {modelsList.map((model) => {
                                  const isSelected = model.id === currentModel;
                                  const info = formatModelInfo(model);

                                  return (
                                    <div
                                      key={model.id}
                                      onClick={() => {
                                        if (onModelChange) onModelChange(model.id);
                                        setIsDropdownOpen(false);
                                      }}
                                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-zinc-800 border border-zinc-700 text-zinc-100'
                                          : 'hover:bg-zinc-900 text-zinc-300 border border-transparent'
                                      }`}
                                    >
                                      <div className="min-w-0 pr-2">
                                        <div className="text-[11.5px] font-medium truncate font-mono">{model.id}</div>
                                        <div className="text-[9.5px] text-zinc-500 truncate">
                                          {info.subtitle}
                                        </div>
                                      </div>

                                      {isSelected && (
                                        <Check className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium px-2.5 py-1 rounded-lg hover:bg-zinc-800/40 transition-colors"
              >
                <Key className="h-3 w-3" />
                <span>Add Key</span>
              </button>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-7 w-7 rounded-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 shrink-0"
              title="Send Message"
            >
              <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}