import React, { useState, useEffect } from 'react';
import { Key, X, Plus, Trash2, Loader2, Sparkles, Check, AlertCircle } from 'lucide-react';
import { fetchModelsFromKey, getSavedBYOKConfig, saveBYOKConfig } from '../../services/api';

const detectProviderName = (key) => {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('AIzaSy') || k.startsWith('AQ.') || k.startsWith('AQ')) return 'gemini';
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('sk-')) return 'openai';
  return 'custom';
};

export default function SettingsModal({ isOpen, onClose, onConfigUpdated }) {
  const [inputKey, setInputKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [savedKeys, setSavedKeys] = useState({});
  const [allModels, setAllModels] = useState([]);
  const [activeModel, setActiveModel] = useState('');

  useEffect(() => {
    if (isOpen) {
      const cfg = getSavedBYOKConfig();
      setSavedKeys(cfg.keys);
      setAllModels(cfg.discoveredModels);
      setActiveModel(cfg.activeModel);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddKey = async () => {
    if (!inputKey.trim()) return;
    setLoading(true);
    setError(null);

    const provider = selectedProvider === 'auto' ? detectProviderName(inputKey) : selectedProvider;

    try {
      const models = await fetchModelsFromKey(inputKey, provider);
      
      const newKeys = { ...savedKeys, [provider]: inputKey.trim() };
      const mergedModels = [...allModels.filter((m) => m.provider !== provider), ...models];
      const newActive = activeModel || (mergedModels.length > 0 ? mergedModels[0].id : '');

      setSavedKeys(newKeys);
      setAllModels(mergedModels);
      setActiveModel(newActive);
      saveBYOKConfig(newKeys, mergedModels, newActive);

      setInputKey('');
      if (onConfigUpdated) onConfigUpdated(mergedModels, newActive);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to validate API key and fetch models.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveProvider = (prov) => {
    const newKeys = { ...savedKeys };
    delete newKeys[prov];

    const remainingModels = allModels.filter((m) => m.provider !== prov);
    const newActive = remainingModels.some((m) => m.id === activeModel)
      ? activeModel
      : remainingModels[0]?.id || '';

    setSavedKeys(newKeys);
    setAllModels(remainingModels);
    setActiveModel(newActive);
    saveBYOKConfig(newKeys, remainingModels, newActive);
    if (onConfigUpdated) onConfigUpdated(remainingModels, newActive);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-5 shadow-2xl space-y-4 text-zinc-100 font-sans">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Key className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-sm font-semibold">Custom LLM Keys & Discovered Models</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Input Box */}
        <div className="space-y-2">
          <label className="text-[11px] text-zinc-400 font-medium">Add Any LLM API Key</label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Paste Groq, Gemini, OpenAI, Claude, OpenRouter key..."
              value={inputKey}
              onChange={(e) => {
                setInputKey(e.target.value);
                setSelectedProvider(detectProviderName(e.target.value));
              }}
              className="flex-1 bg-zinc-950/70 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/80"
            />
            <button
              onClick={handleAddKey}
              disabled={loading || !inputKey.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 stroke-[2.5]" />}
              <span>{loading ? 'Detecting...' : 'Add Key'}</span>
            </button>
          </div>

          {inputKey && (
            <div className="text-[10px] text-zinc-500 font-mono">
              Detected Provider: <span className="text-amber-400 uppercase">{selectedProvider}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2.5 rounded-xl mt-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Configured Keys List */}
        <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Configured Providers ({Object.keys(savedKeys).length})</div>
          {Object.keys(savedKeys).length === 0 ? (
            <div className="text-center py-5 text-xs text-zinc-600">
              No API keys configured yet.<br />Add a key above to automatically load its live models.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
              {Object.entries(savedKeys).map(([prov, key]) => {
                const provModels = allModels.filter((m) => m.provider === prov);
                return (
                  <div key={prov} className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-200 uppercase">{prov}</span>
                        <span className="text-[9.5px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded-md font-mono">
                          {provModels.length} models
                        </span>
                      </div>
                      <div className="text-[10.5px] text-zinc-500 font-mono mt-0.5">
                        ••••••••{key.slice(-4)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveProvider(prov)}
                      className="text-zinc-600 hover:text-rose-400 p-1 rounded-lg transition-colors cursor-pointer"
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

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-xl text-xs font-medium cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}