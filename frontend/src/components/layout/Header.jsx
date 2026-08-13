import React from 'react';
import { GraduationCap, Activity } from 'lucide-react';
import { APP_CONFIG } from '../../theme/constants';

export default function Header({ backendStatus }) {
  const isReady = backendStatus === 'ok' || backendStatus === 'online';

  return (
    <header className="h-14 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between px-6 shrink-0 select-none">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-bold text-zinc-100 text-base leading-none">
            {APP_CONFIG.name}
          </h1>
          <p className="text-[10px] text-zinc-500 mt-0.5 font-medium">
            {APP_CONFIG.tagline}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
        <Activity className={`h-3.5 w-3.5 ${isReady ? 'text-amber-400' : 'text-rose-400'}`} />
        <span className="capitalize text-zinc-300 font-medium">
          {isReady ? 'System Ready' : 'Backend Offline'}
        </span>
      </div>
    </header>
  );
}