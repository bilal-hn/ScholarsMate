import React, { useEffect, useRef } from 'react';
import { Palette, X, Minus } from 'lucide-react';
import { THEMES } from '../../theme/constants';

export default function ThemeModal({ isOpen, onClose, currentTheme, onThemeChange }) {
  const modalRef = useRef(null);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      {/* Odysseus-Style Window Frame */}
      <div
        ref={modalRef}
        className="w-full max-w-xl bg-[#14161b]/95 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-150 text-zinc-200"
      >
        {/* Window Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500">
              <Palette className="h-3 w-3" />
            </div>
            <span className="font-semibold text-sm text-red-500 tracking-tight">Theme</span>
          </div>

          {/* Window Control Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer border border-zinc-800"
              title="Minimize"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer border border-zinc-800"
              title="Close"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Themes Grid Body */}
        <div className="p-4 sm:p-5 max-h-[70vh] overflow-y-auto space-y-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-3 font-semibold">
              Available Themes
            </div>

            {/* Curated Theme Swatch Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {THEMES.map((theme) => {
                const isSelected = theme.id === currentTheme;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onThemeChange(theme.id)}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all cursor-pointer group relative ${
                      isSelected
                        ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/5 ring-1 ring-red-500/50'
                        : 'border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-800/60 hover:border-zinc-700'
                    }`}
                  >
                    {/* Interlocking 3-Circle Theme Swatches */}
                    <div className="flex -space-x-1.5 items-center justify-center mb-2.5">
                      <div
                        className="w-4 h-4 rounded-full border border-black/40 shadow-xs"
                        style={{ backgroundColor: theme.canvasPreview || '#131417' }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-black/40 shadow-xs"
                        style={{ backgroundColor: theme.surfacePreview || '#23252c' }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-black/40 shadow-xs ring-1 ring-white/10"
                        style={{ backgroundColor: theme.accentColor }}
                      />
                    </div>

                    {/* Theme Name & Mode */}
                    <span
                      className={`text-xs font-mono tracking-tight capitalize ${
                        isSelected ? 'text-zinc-100 font-semibold' : 'text-zinc-300 group-hover:text-zinc-100'
                      }`}
                    >
                      {theme.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 capitalize mt-0.5">
                      {theme.mode} mode
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
