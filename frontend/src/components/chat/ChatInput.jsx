import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  ArrowUp, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Key, 
  Check, 
  Sparkles, 
  FileText,
  Search,
  Terminal,
  Clock,
  Cpu,
  Layers
} from 'lucide-react';

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
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [activeMode, setActiveMode] = useState('chat'); // 'agent' | 'chat'
  const [isDeepSearchActive, setIsDeepSearchActive] = useState(false);
  const dropdownRef = useRef(null);
  const textareaRef = useRef(null);

  // @ Mention State
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionMenuRef = useRef(null);

  // Filter documents matching whatever is typed after '@'
  const matchingDocuments = useMemo(() => {
    if (!showMentionMenu) return [];
    const query = mentionQuery.toLowerCase().trim();
    if (!query) return availableDocuments;
    return availableDocuments.filter((doc) => doc.toLowerCase().includes(query));
  }, [showMentionMenu, mentionQuery, availableDocuments]);

  // Track '@' trigger in textarea
  const handleInputChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);

    // Look at the text before the current cursor
    const textBeforeCursor = value.slice(0, cursorPos);
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

  const handleKeyDown = (e) => {
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (mentionMenuRef.current && !mentionMenuRef.current.contains(event.target)) {
        setShowMentionMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedModelObj = filteredModels.find((m) => m.id === currentModel) || filteredModels[0];
  const currentFormatted = formatModelInfo(selectedModelObj);

  return (
    <div className="w-full px-4 pb-4 pt-1 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent shrink-0 relative z-30 transition-colors">
      <form
        onSubmit={onSubmit}
        className="max-w-3xl mx-auto bg-zinc-900 hover:bg-zinc-900/95 border border-zinc-800 hover:border-zinc-700/80 focus-within:border-zinc-600 rounded-2xl p-3 flex flex-col gap-2 transition-all shadow-2xl relative"
      >
        {/* @ Mention Document Autocomplete Menu */}
        {showMentionMenu && matchingDocuments.length > 0 && (
          <div
            ref={mentionMenuRef}
            className="absolute bottom-full left-3 mb-2.5 w-76 max-h-52 overflow-y-auto bg-zinc-900/95 border border-zinc-800 rounded-xl p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 tracking-wider border-b border-zinc-800/80 mb-1 flex items-center justify-between">
              <span>Target Research Paper</span>
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
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      isFocused
                        ? 'bg-zinc-800 text-amber-300 font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    <FileText className={`h-3.5 w-3.5 shrink-0 ${isFocused ? 'text-amber-400' : 'text-zinc-500'}`} />
                    <span className="truncate">{doc}</span>
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

        {/* Bottom Control & Tool Row (Odysseus Style) */}
        <div className="flex items-center justify-between pt-0.5 px-1">
          {/* Left Action Toolbar + Live Telemetry */}
          <div className="flex items-center gap-1.5">
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

            {/* Terminal / Analysis Mode */}
            <button
              type="button"
              title="Academic Prompt Mode"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer"
            >
              <Terminal className="h-3.5 w-3.5" />
            </button>

            {/* Attach File Button */}
            <button
              type="button"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Attach Research Paper"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            {/* Telemetry Display (Odysseus Telemetry: Tokens, Latency, Docs) */}
            {telemetry && (
              <div className="hidden sm:flex items-center gap-2 ml-1 px-2 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800/80 text-[10.5px] text-zinc-400 font-mono select-none">
                {telemetry.responseTime && (
                  <span className="flex items-center gap-1 text-zinc-300">
                    <Clock className="h-2.5 w-2.5 text-amber-400" />
                    <span>{telemetry.responseTime}</span>
                  </span>
                )}
                {telemetry.tokenUsage !== undefined && (
                  <span className="flex items-center gap-1 border-l border-zinc-800 pl-2 text-zinc-400">
                    <Cpu className="h-2.5 w-2.5 text-zinc-500" />
                    <span>{telemetry.tokenUsage} tokens</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right Controls: Model Pill, Mode Switch, and Submit */}
          <div className="flex items-center gap-2">
            {/* Mode Switch: Agent | Chat */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800/80 rounded-lg p-0.5 text-[11px] font-medium text-zinc-400 select-none">
              <button
                type="button"
                onClick={() => setActiveMode('agent')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  activeMode === 'agent'
                    ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs'
                    : 'hover:text-zinc-200'
                }`}
              >
                Agent
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('chat')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  activeMode === 'chat'
                    ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                    : 'hover:text-zinc-200'
                }`}
              >
                Chat
              </button>
            </div>

            {/* Model Selector Pill (with Odysseus-style '@' prefix) */}
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
                                hasActiveModel ? 'text-amber-400 font-semibold' : 'text-zinc-300 hover:text-white'
                              } hover:bg-zinc-800/50`}
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
                                        <Check className="h-3 w-3 text-amber-400 shrink-0" />
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

            {/* Circular Coral / Salmon Red Submit Button (Odysseus Style) */}
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