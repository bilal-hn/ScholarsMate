import React from 'react';
import { Compass } from 'lucide-react';

export default function WorkspaceLoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 select-none relative overflow-hidden animate-in fade-in duration-200">
      {/* Background Ambient Glow */}
      <div className="absolute w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -top-12 -left-12" />
      <div className="absolute w-80 h-80 bg-zinc-700/5 rounded-full blur-3xl pointer-events-none -bottom-8 -right-8" />

      <div className="w-full max-w-2xl flex flex-col items-center z-10 space-y-6">
        
        {/* Orbital Constellation Core */}
        <div className="relative flex items-center justify-center p-6">
          {/* Outer Rotating Dashed Ring */}
          <div className="absolute w-24 h-24 rounded-full border border-dashed border-zinc-700/60 animate-orbit-slow" />

          {/* Inner Counter-Rotating Ring with Accent Satellite Nodes */}
          <div className="absolute w-16 h-16 rounded-full border border-zinc-800 animate-orbit-reverse">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-400/80 shadow-sm shadow-amber-500/50" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-zinc-500" />
          </div>

          {/* Center Pulsing Icon Badge */}
          <div className="relative z-10 h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-2xl flex items-center justify-center text-amber-400 animate-float-orb">
            <Compass className="h-6 w-6 stroke-[1.8]" />
          </div>
        </div>

        {/* Realistic Academic Skeleton Mockup */}
        <div className="w-full space-y-4 pt-2 max-w-xl opacity-75">
          {/* Mock User Message */}
          <div className="flex justify-end">
            <div className="w-2/3 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
              <div className="h-2.5 w-3/4 rounded-full animate-shimmer-wave" />
              <div className="h-2.5 w-1/2 rounded-full animate-shimmer-wave" />
            </div>
          </div>

          {/* Mock Assistant Synthesis Message */}
          <div className="flex justify-start">
            <div className="w-full p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-3">
              {/* Header Badge Row */}
              <div className="flex items-center gap-2">
                <div className="h-3 w-16 rounded-md animate-shimmer-wave" />
                <div className="h-3 w-24 rounded-md animate-shimmer-wave" />
              </div>

              {/* Body Lines */}
              <div className="space-y-2">
                <div className="h-2.5 w-full rounded-full animate-shimmer-wave" />
                <div className="h-2.5 w-11/12 rounded-full animate-shimmer-wave" />
                <div className="h-2.5 w-4/5 rounded-full animate-shimmer-wave" />
              </div>

              {/* Mock Inline Citation Chips */}
              <div className="flex items-center gap-2 pt-1">
                <div className="h-4 w-28 rounded-md bg-zinc-800/80 border border-zinc-700/40 animate-shimmer-wave" />
                <div className="h-4 w-32 rounded-md bg-zinc-800/80 border border-zinc-700/40 animate-shimmer-wave" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
