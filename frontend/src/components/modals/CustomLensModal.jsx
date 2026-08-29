import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Microscope, 
  Brain, 
  ShieldAlert, 
  BarChart3, 
  Library, 
  BookOpen, 
  GraduationCap, 
  FileCode, 
  CheckCircle, 
  Scale, 
  Scroll,
  Trash2,
  Check
} from 'lucide-react';

export const ICON_MAP = {
  Microscope,
  Brain,
  ShieldAlert,
  BarChart3,
  Library,
  Sparkles,
  BookOpen,
  GraduationCap,
  FileCode,
  CheckCircle,
  Scale,
  Scroll,
};

export const COLOR_PRESETS = [
  { id: 'amber', name: 'Amber', badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { id: 'emerald', name: 'Emerald', badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'rose', name: 'Rose', badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  { id: 'blue', name: 'Blue', badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { id: 'purple', name: 'Purple', badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { id: 'cyan', name: 'Cyan', badgeColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { id: 'orange', name: 'Orange', badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
];

export const STARTER_TEMPLATES = [
  {
    name: 'Blank Custom Template',
    tagline: 'Define your own specialized academic reasoning rules',
    icon: 'Sparkles',
    color: 'amber',
    cmd: '/custom',
    directive: `### Active Lens Directives: [Custom Lens Name]
Adopt the specialized academic persona for this workflow.

When answering the user's question:
1. Provide a rigorous, grounded analysis using the retrieved paper context.
2. Format key comparisons inside clean Markdown tables.
3. Cite every statement using strict citations [Doc_Name, p.X].
4. Maintain formal academic tone.`,
  },
  {
    name: 'Grant Proposal Reviewer',
    tagline: 'Audits papers for NSF / Horizon Europe merit criteria',
    icon: 'Scale',
    color: 'rose',
    cmd: '/grant',
    directive: `### Active Lens Directives: [Grant Proposal Reviewer]
Adopt the persona of an expert scientific grant proposal reviewer (NSF / Horizon Europe panelist).

When evaluating or synthesizing the paper:
1. **Intellectual Merit:** Identify the core novelty, technical soundness, and theoretical contribution.
2. **Broader Impacts & Feasibility:** Assess potential societal, commercial, or cross-disciplinary impact.
3. **Budget & Execution Risks:** Note any unstated assumptions, compute barriers, or reproducibility concerns.
4. Ground every point with citations [Doc_Name, p.X].`,
  },
  {
    name: 'LaTeX Proof & Derivation Expert',
    tagline: 'Outputs copy-pasteable LaTeX equations & formal step derivations',
    icon: 'FileCode',
    color: 'cyan',
    cmd: '/latex',
    directive: `### Active Lens Directives: [LaTeX Proof Expert]
Adopt the persona of a theoretical computer science & mathematics formalizer.

When explaining or deriving mathematical concepts from the paper:
1. Output all mathematical equations in clean display LaTeX blocks ($$...$$) or inline ($...$).
2. Show complete step-by-step algebraic derivations without skipping intermediate simplifications.
3. Map symbols clearly to their physical / theoretical definitions in a Markdown notation table.
4. Ground formulas to exact page citations [Doc_Name, p.X].`,
  },
];

export default function CustomLensModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialLens = null
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [tagline, setTagline] = useState('');
  const [slashCommand, setSlashCommand] = useState('/custom');
  const [iconName, setIconName] = useState('Sparkles');
  const [colorId, setColorId] = useState('amber');
  const [temperature, setTemperature] = useState(0.1);
  const [promptDirective, setPromptDirective] = useState('');

  useEffect(() => {
    if (initialLens) {
      setName(initialLens.name || '');
      setShortName(initialLens.short_name || initialLens.name || '');
      setTagline(initialLens.tagline || initialLens.description || '');
      setSlashCommand(initialLens.slash_commands?.[0] || initialLens.slashCommand || '/custom');
      setIconName(initialLens.iconName || 'Sparkles');
      setColorId(initialLens.colorId || 'amber');
      setTemperature(initialLens.temperature ?? 0.1);
      setPromptDirective(initialLens.prompt_directive || initialLens.promptDirective || '');
    } else {
      applyTemplate(STARTER_TEMPLATES[0]);
    }
  }, [initialLens, isOpen]);

  const applyTemplate = (tpl) => {
    setName(tpl.name);
    setShortName(tpl.name.split(' ')[0]);
    setTagline(tpl.tagline);
    setSlashCommand(tpl.cmd);
    setIconName(tpl.icon);
    setColorId(tpl.color);
    setPromptDirective(tpl.directive);
  };

  if (!isOpen) return null;

  const activeColorObj = COLOR_PRESETS.find((c) => c.id === colorId) || COLOR_PRESETS[0];
  const IconComp = ICON_MAP[iconName] || Sparkles;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !promptDirective.trim()) return;

    const formattedCmd = slashCommand.startsWith('/') ? slashCommand.trim() : `/${slashCommand.trim()}`;
    const lensId = initialLens?.id || `custom_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;

    const newLens = {
      id: lensId,
      name: name.trim(),
      short_name: shortName.trim() || name.trim(),
      tagline: tagline.trim(),
      description: tagline.trim(),
      iconName: iconName,
      colorId: colorId,
      badgeColor: activeColorObj.badgeColor,
      temperature: parseFloat(temperature),
      top_k: 8,
      slash_commands: [formattedCmd],
      slashCommand: formattedCmd,
      prompt_directive: promptDirective.trim(),
      isCustom: true,
    };

    onSave(newLens);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${activeColorObj.badgeColor}`}>
              <IconComp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {initialLens?.id ? 'Edit Academic Lens' : 'Create Custom Academic Lens'}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Define specialized cognitive rules, persona directives, and output formatting.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Quick Starter Templates */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 font-mono">
              Quick-Start Template
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STARTER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="px-2.5 py-2 rounded-lg bg-zinc-950/60 border border-zinc-800 hover:border-amber-500/40 text-left transition-colors cursor-pointer group"
                >
                  <div className="font-medium text-zinc-200 group-hover:text-amber-300 text-[11.5px] truncate">
                    {tpl.name}
                  </div>
                  <div className="text-[10.5px] text-zinc-500 truncate mt-0.5">{tpl.tagline}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Name & Short Name Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
                Lens Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Grant Proposal Reviewer"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
                Pill Label
              </label>
              <input
                type="text"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="e.g. Grant"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 text-xs"
              />
            </div>
          </div>

          {/* Tagline & Slash Command */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
                Tagline / Description
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Audits papers against NSF merit criteria"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
                Slash Command
              </label>
              <input
                type="text"
                value={slashCommand}
                onChange={(e) => setSlashCommand(e.target.value)}
                placeholder="/grant"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 text-xs"
              />
            </div>
          </div>

          {/* Visual Styling: Icon & Color */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Icon Picker */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 font-mono">
                Icon
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-950 border border-zinc-800 rounded-lg">
                {Object.keys(ICON_MAP).map((k) => {
                  const Icon = ICON_MAP[k];
                  const isSel = iconName === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setIconName(k)}
                      className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                        isSel ? 'bg-zinc-800 text-amber-300 ring-1 ring-amber-500/40' : 'text-zinc-500 hover:text-zinc-200'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Picker */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 font-mono">
                Color Theme
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-950 border border-zinc-800 rounded-lg">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColorId(c.id)}
                    className={`px-2 py-1 rounded text-[11px] border font-medium transition-all cursor-pointer ${c.badgeColor} ${
                      colorId === c.id ? 'ring-2 ring-zinc-400' : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Prompt Directive Editor */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                Custom Prompt Directives <span className="text-rose-400">*</span>
              </label>
              <span className="text-[10.5px] text-zinc-500">Source-locking & citations are auto-enforced</span>
            </div>
            <textarea
              required
              rows={8}
              value={promptDirective}
              onChange={(e) => setPromptDirective(e.target.value)}
              placeholder="Enter instructions, persona rules, formatting requirements..."
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 leading-relaxed resize-y"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/90 text-xs">
          <div>
            {initialLens?.id && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(initialLens.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Lens</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>Save Lens</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
