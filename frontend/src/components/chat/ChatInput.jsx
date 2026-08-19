import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, Plus, Key, Check, Sparkles } from 'lucide-react';

export default function ChatInput({
  input,
  setInput,
  onSubmit,
  loading,
  availableModels = [],
  currentModel,
  onModelChange,
  onOpenSettings
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState(null);
  const dropdownRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups = {};
    availableModels.forEach((model) => {
      const prov = (model.provider || 'custom').toLowerCase();
      if (!groups[prov]) {
        groups[prov] = [];
      }
      groups[prov].push(model);
    });
    return groups;
  }, [availableModels]);

  // Automatically expand the active model's provider when opening dropdown
  useEffect(() => {
    if (isDropdownOpen && currentModel) {
      const activeObj = availableModels.find((m) => m.id === currentModel);
      if (activeObj) {
        setExpandedProvider(activeObj.provider?.toLowerCase() || null);
      }
    }
  }, [isDropdownOpen, currentModel, availableModels]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format model card labels and descriptions
  const formatModelInfo = (model) => {
    const rawId = model?.id || '';
    const rawName = model?.name || rawId;

    let cleanTitle = rawName
      .replace(/^models\//i, '')
      .replace(/^gemini\//i, '')
      .replace(/^gemini-/i, '')
      .replace(/^openai\//i, '')
      .replace(/^groq\//i, '')
      .replace(/^anthropic\//i, '');

    let subtitle = 'General intelligence';
    const lower = rawId.toLowerCase();

    if (lower.includes('flash-lite') || lower.includes('haiku') || lower.includes('mini')) {
      subtitle = 'Fastest answers';
    } else if (lower.includes('flash') || lower.includes('turbo')) {
      subtitle = 'All-around help';
    } else if (lower.includes('pro') || lower.includes('opus') || lower.includes('o1') || lower.includes('o3')) {
      subtitle = 'Advanced reasoning';
    } else if (lower.includes('thinking') || lower.includes('reason')) {
      subtitle = 'Complex problem solving';
    }

    return {
      title: cleanTitle,
      subtitle: subtitle,
      provider: model?.provider?.toUpperCase() || 'LLM'
    };
  };

  const selectedModelObj = availableModels.find((m) => m.id === currentModel) || availableModels[0];
  const currentFormatted = formatModelInfo(selectedModelObj);

  return (
    <div className="p-4 bg-zinc-950/80 backdrop-blur-md shrink-0">
      <form
        onSubmit={onSubmit}
        className="max-w-4xl mx-auto bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800/70 hover:border-zinc-700/70 focus-within:border-zinc-700 rounded-3xl p-3.5 flex flex-col gap-2 transition-all shadow-xl relative"
      >
        <textarea
          rows={2}
          placeholder="Ask anything about your research papers..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none px-2 pt-1 font-sans"
        />

        <div className="flex items-center justify-between pt-1 px-1">
          {/* Left Action Button (+) */}
          <button
            type="button"
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
            title="Add File"
          >
            <Plus className="h-5 w-5" />
          </button>

          {/* Right Action Controls: Model Selector & Send Button */}
          <div className="flex items-center gap-2.5">
            {availableModels && availableModels.length > 0 ? (
              <div className="relative" ref={dropdownRef}>
                {/* Trigger Pill */}
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:bg-zinc-800/70 transition-all cursor-pointer border border-transparent hover:border-zinc-700/60"
                >
                  <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
                  <span className="truncate max-w-[130px] font-medium">{currentFormatted.title}</span>
                  <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Nested Provider Accordion Popover Menu */}
                {isDropdownOpen && (
                  <div className="absolute bottom-full right-0 mb-3 w-72 bg-zinc-950/95 border border-zinc-800/90 rounded-2xl p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150 text-zinc-200">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase px-2 py-1 tracking-wider border-b border-zinc-900 mb-1.5">
                      Select Model Provider
                    </div>

                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                      {Object.entries(groupedModels).map(([providerKey, modelsList]) => {
                        const isExpanded = expandedProvider === providerKey;
                        const hasActiveModel = modelsList.some((m) => m.id === currentModel);

                        return (
                          <div
                            key={providerKey}
                            className="border border-zinc-800/60 rounded-xl overflow-hidden bg-zinc-900/40"
                          >
                            {/* Provider Group Header */}
                            <button
                              type="button"
                              onClick={() => setExpandedProvider(isExpanded ? null : providerKey)}
                              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                                hasActiveModel ? 'text-amber-400' : 'text-zinc-200 hover:text-white'
                              } hover:bg-zinc-800/50`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="uppercase tracking-wide">{providerKey}</span>
                                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                                  {modelsList.length}
                                </span>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                              )}
                            </button>

                            {/* Nested Models List */}
                            {isExpanded && (
                              <div className="px-1.5 pb-1.5 pt-0.5 space-y-1 border-t border-zinc-800/50 bg-zinc-950/40 max-h-44 overflow-y-auto">
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
                                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-zinc-800 border border-zinc-700/80 text-zinc-100'
                                          : 'hover:bg-zinc-900/80 text-zinc-300 border border-transparent'
                                      }`}
                                    >
                                      <div className="min-w-0 pr-2">
                                        <div className="text-xs font-medium truncate">{info.title}</div>
                                        <div className="text-[10px] text-zinc-500 truncate mt-0.5">
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
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium px-2.5 py-1.5 rounded-full hover:bg-zinc-800/40 transition-colors"
              >
                <Key className="h-3.5 w-3.5" />
                <span>Add Key</span>
              </button>
            )}

            {/* Circular Send Button */}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-8 w-8 rounded-full bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 shrink-0"
              title="Send Message"
            >
              <ArrowUp className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}