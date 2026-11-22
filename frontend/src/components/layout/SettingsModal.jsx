import React, { useState, useEffect } from 'react';
import { 
  Key, 
  X, 
  Plus, 
  Trash2, 
  Loader2, 
  Sparkles, 
  Check, 
  AlertCircle, 
  Sun, 
  Moon, 
  SlidersHorizontal 
} from 'lucide-react';
import { fetchModelsFromKey, getSavedBYOKConfig, saveBYOKConfig } from '../../services/api';
import { getSavedTheme, saveTheme } from '../../theme/constants';

const detectProviderName = (key) => {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('AIzaSy') || k.startsWith('AQ.') || k.startsWith('AQ')) return 'gemini';
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('sk-') && (k.includes('--') || (k.includes('-') && k.length > 55 && !k.startsWith('sk-proj-') && !k.startsWith('sk-admin-')))) {
    return 'openrouter';
  }
  if (k.startsWith('sk-')) return 'openai';
  return 'custom';
};

export default function SettingsModal({ 
  isOpen, 
  onClose, 
  onConfigUpdated, 
  currentTheme: propTheme, 
  onThemeChange 
}) {
  const [inputKey, setInputKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [keyList, setKeyList] = useState([]);
  const [allModels, setAllModels] = useState([]);
  const [activeModel, setActiveModel] = useState('');
  const [activeTheme, setActiveTheme] = useState(() => propTheme || getSavedTheme());

  useEffect(() => {
    if (propTheme) {
      setActiveTheme(propTheme);
    }
  }, [propTheme]);

  useEffect(() => {
    if (isOpen) {
      const cfg = getSavedBYOKConfig();
      let storedList = [];
      try {
        storedList = JSON.parse(localStorage.getItem('scholarsmate_byok_key_items') || '[]');
      } catch {}

      if (!storedList || storedList.length === 0) {
        // Migrate from cfg.keys if present
        storedList = Object.entries(cfg.keys || {}).map(([prov, k], i) => ({
          id: `key_${i + 1}`,
          key: k,
          provider: prov,
          models: (cfg.discoveredModels || []).filter((m) => m.provider === prov),
        }));
      }

      setKeyList(storedList);
      setAllModels(cfg.discoveredModels || []);
      setActiveModel(cfg.activeModel || '');
      setActiveTheme(propTheme || getSavedTheme());
      setError(null);
    }
  }, [isOpen, propTheme]);

  if (!isOpen) return null;

  const handleSelectTheme = (themeId) => {
    setActiveTheme(themeId);
    saveTheme(themeId);
    if (onThemeChange) {
      onThemeChange(themeId);
    }
  };

  const handleAddKey = async () => {
    if (!inputKey.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const models = await fetchModelsFromKey(inputKey);
      const effectiveProvider = models.length > 0 && models[0].provider
        ? models[0].provider
        : detectProviderName(inputKey);

      const newKeyEntry = {
        id: `key_${Date.now()}`,
        key: inputKey.trim(),
        provider: effectiveProvider,
        models: models || [],
      };

      const updatedKeyList = [...keyList, newKeyEntry];

      // Recompute keys object for LiteLLM
      const updatedKeysObj = {};
      updatedKeyList.forEach((k) => {
        updatedKeysObj[k.provider] = k.key;
      });

      // Merge models without duplicates by id
      const seenIds = new Set();
      const mergedModels = [];
      for (const k of updatedKeyList) {
        for (const m of (k.models || [])) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            mergedModels.push(m);
          }
        }
      }

      const newActive = activeModel || (mergedModels.length > 0 ? mergedModels[0].id : '');

      setKeyList(updatedKeyList);
      setAllModels(mergedModels);
      setActiveModel(newActive);

      saveBYOKConfig(updatedKeysObj, mergedModels, newActive);
      localStorage.setItem('scholarsmate_byok_key_items', JSON.stringify(updatedKeyList));

      setInputKey('');
      if (onConfigUpdated) onConfigUpdated(mergedModels, newActive);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Failed to validate API key and fetch models.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveKey = (keyId) => {
    const updatedKeyList = keyList.filter((k) => k.id !== keyId);

    const updatedKeysObj = {};
    updatedKeyList.forEach((k) => {
      updatedKeysObj[k.provider] = k.key;
    });

    const seenIds = new Set();
    const remainingModels = [];
    for (const k of updatedKeyList) {
      for (const m of (k.models || [])) {
        if (!seenIds.has(m.id)) {
          seenIds.add(m.id);
          remainingModels.push(m);
        }
      }
    }

    const newActive = remainingModels.some((m) => m.id === activeModel)
      ? activeModel
      : remainingModels[0]?.id || '';

    setKeyList(updatedKeyList);
    setAllModels(remainingModels);
    setActiveModel(newActive);

    saveBYOKConfig(updatedKeysObj, remainingModels, newActive);
    localStorage.setItem('scholarsmate_byok_key_items', JSON.stringify(updatedKeyList));

    if (onConfigUpdated) onConfigUpdated(remainingModels, newActive);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-5 shadow-2xl space-y-4 text-zinc-100 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-sm font-semibold">Settings &amp; Preferences</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Section 1: Appearance (Dark & Light Mode) */}
        <div className="space-y-2 pb-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
              Theme &amp; Appearance
            </label>
            <span className="text-[10.5px] font-mono text-[#8e8e93]">
              {activeTheme === 'clarity' ? 'Daylight Light' : 'Obsidian Dark'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Dark Mode Card */}
            <button
              type="button"
              onClick={() => handleSelectTheme('original')}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                activeTheme !== 'clarity'
                  ? 'bg-zinc-800/90 border-[#8e8e93] text-white shadow-sm ring-1 ring-[#8e8e93]/50'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
              }`}
            >
              <div className={`p-1.5 rounded-lg border ${
                activeTheme !== 'clarity'
                  ? 'bg-zinc-900 border-zinc-700 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500'
              }`}>
                <Moon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold leading-tight">Dark Mode</div>
                <div className="text-[10px] text-zinc-500 truncate mt-0.5">Obsidian black &amp; slate grey</div>
              </div>
              {activeTheme !== 'clarity' && (
                <Check className="h-3.5 w-3.5 text-zinc-100 shrink-0" />
              )}
            </button>

            {/* Light Mode Card */}
            <button
              type="button"
              onClick={() => handleSelectTheme('clarity')}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                activeTheme === 'clarity'
                  ? 'bg-zinc-200 border-zinc-400 text-zinc-950 shadow-sm ring-1 ring-zinc-400'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
              }`}
            >
              <div className={`p-1.5 rounded-lg border ${
                activeTheme === 'clarity'
                  ? 'bg-white border-zinc-300 text-zinc-900'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500'
              }`}>
                <Sun className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold leading-tight">Light Mode</div>
                <div className="text-[10px] text-zinc-500 truncate mt-0.5">Studio porcelain daylight</div>
              </div>
              {activeTheme === 'clarity' && (
                <Check className="h-3.5 w-3.5 text-zinc-950 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* Section 2: LLM API Keys & Discovered Models */}
        <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
          <label className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
            API Keys
          </label>

          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Paste any API key (OpenRouter, Gemini, Groq, OpenAI...)"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              className="flex-1 bg-zinc-950/70 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={handleAddKey}
              disabled={loading || !inputKey.trim()}
              className="bg-zinc-100 hover:bg-white text-zinc-950 font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors shadow-sm shrink-0"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 stroke-[2.5]" />}
              <span>{loading ? 'Verifying...' : 'Add Key'}</span>
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2.5 rounded-xl mt-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Vision OCR Guide */}
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400 mt-2">
            <Sparkles className="h-3.5 w-3.5 text-zinc-300 shrink-0 mt-0.5" />
            <span>
              <strong className="text-zinc-200">Vision &amp; Formula OCR Tip:</strong> For extracting text, equations, and diagrams from uploaded images, add a free Google Gemini key from{' '}
              <a
                href="https://aistudio.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-200 hover:text-white underline font-medium"
              >
                aistudio.google.com
              </a>{' '}
              (Groq has decommissioned its Llama vision models).
            </span>
          </div>
        </div>

        {/* Section 3: Configured Keys List */}
        <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
            Configured Keys ({keyList.length})
          </div>
          {keyList.length === 0 ? (
            <div className="text-center py-4 text-xs text-zinc-500">
              No API keys configured yet.<br />Add a key above to automatically load its verified models.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
              {keyList.map((item, idx) => {
                const count = item.models?.length || 0;
                return (
                  <div key={item.id} className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-100">Key {idx + 1}</span>
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700/80 px-2 py-0.5 rounded-md font-mono">
                          ••••••••{item.key.slice(-4)}
                        </span>
                        <span className="text-[10px] text-emerald-400/90 font-mono">
                          {count} {count === 1 ? 'verified model' : 'verified models'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveKey(item.id)}
                      className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg transition-colors cursor-pointer"
                      title="Delete Key"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end border-t border-zinc-800/80">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
