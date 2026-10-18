import React from 'react';

export default function TopNavbar({
  isSidebarCollapsed,
  onToggleSidebar,
  currentUser,
  onOpenAuth,
  onDeleteChat,
  onOpenSettings,
}) {
  const isAuthenticated = currentUser && !currentUser.is_guest;

  if (isAuthenticated) {
    return null;
  }

  return (
    <header className="h-[60px] bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-30 select-none border-b border-zinc-800/40">
      {/* Top Left: Shows ScholarsMate when logged out */}
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-tight text-zinc-100 font-sans block leading-tight">
          ScholarsMate
        </span>
      </div>

      {/* Top Right: Login/Sign Up when logged out */}
      <div className="flex items-center gap-3 relative">
        <button
          type="button"
          onClick={() => onOpenAuth && onOpenAuth('login')}
          style={{
            width: '120px',
            height: '42px',
            borderRadius: '21px',
            border: '1px transparent solid',
          }}
          className="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white font-semibold text-sm flex items-center justify-center transition-all cursor-pointer shadow-sm hover:border-zinc-500"
        >
          Login
        </button>

        <button
          type="button"
          onClick={() => onOpenAuth && onOpenAuth('signup')}
          style={{
            width: '160px',
            height: '42px',
            borderRadius: '21px',
            border: '1px transparent solid',
          }}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm flex items-center justify-center transition-all cursor-pointer shadow-md hover:shadow-amber-500/20"
        >
          Sign Up
        </button>
      </div>
    </header>
  );
}
