import React from 'react';
import {
  Menu,
  Plus,
  RefreshCw,
  Search,
  Bell,
  Sparkles,
  Database,
  Trash2,
  Zap,
  Download,
} from 'lucide-react';
import { ActiveTab } from './Sidebar';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onOpenAddModal: () => void;
  onOpenQuickCapture: () => void;
  onCheckAllWebsites: () => void;
  isCheckingAll: boolean;
  unreadCount: number;
  setActiveTab: (tab: ActiveTab) => void;
  hasSampleData: boolean;
  onClearSampleData: () => void;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenMobileMenu,
  searchQuery,
  setSearchQuery,
  onOpenAddModal,
  onOpenQuickCapture,
  onCheckAllWebsites,
  isCheckingAll,
  unreadCount,
  setActiveTab,
  hasSampleData,
  onClearSampleData,
  canInstallPwa,
  onInstallPwa,
}) => {
  return (
    <header
      id="app-header"
      className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#1a2333] bg-[#090d16]/90 px-4 sm:px-6 backdrop-blur-md"
    >
      {/* Left side: Hamburger & Search */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          id="mobile-menu-trigger"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-slate-400 hover:bg-[#162033] hover:text-white lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            id="global-search-input"
            type="text"
            placeholder="Search opportunities, organizations, tags, CTFs, hackathons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[#1e293b] bg-[#0f1422] pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {hasSampleData && (
          <div className="hidden xl:flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 px-2.5 py-1 text-xs text-amber-300">
            <Database className="h-3.5 w-3.5 text-amber-400" />
            <span>Sample data loaded</span>
            <button
              id="clear-sample-data-btn"
              onClick={onClearSampleData}
              title="Clear sample data"
              className="ml-1 text-amber-400 hover:text-amber-200 underline text-[11px]"
            >
              Remove
            </button>
          </div>
        )}

        {/* PWA Install Button */}
        {canInstallPwa && onInstallPwa && (
          <button
            id="pwa-install-btn"
            onClick={onInstallPwa}
            title="Install Opportunity Tracker App on your device"
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/40 hover:border-cyan-400 transition-colors animate-pulse"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Install App</span>
          </button>
        )}

        {/* Quick Capture Button */}
        <button
          id="header-quick-capture-btn"
          onClick={onOpenQuickCapture}
          title="Universal Quick Capture: Paste URL, voice note, or quick task (Cmd+K)"
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-[#10192e] px-3 py-2 text-xs font-semibold text-cyan-300 hover:border-cyan-400 hover:bg-cyan-950/40 transition-colors"
        >
          <Zap className="h-3.5 w-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Quick +</span>
        </button>

        {/* Check Websites Button */}
        <button
          id="check-all-websites-btn"
          onClick={onCheckAllWebsites}
          disabled={isCheckingAll}
          title="Run server-side website check to detect deadline and announcement changes"
          className="flex items-center gap-1.5 rounded-lg border border-[#1e293b] bg-[#121827] px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/30 hover:bg-[#182236] hover:text-cyan-300 disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isCheckingAll ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
          <span className="hidden sm:inline">{isCheckingAll ? 'Checking Sites...' : 'Check Websites'}</span>
        </button>

        {/* Notifications Icon Button */}
        <button
          id="header-notification-btn"
          onClick={() => setActiveTab('notifications')}
          className="relative rounded-lg border border-[#1e293b] bg-[#121827] p-2 text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm shadow-rose-950">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Add Opportunity Button */}
        <button
          id="add-opportunity-primary-btn"
          onClick={onOpenAddModal}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-black hover:bg-cyan-400 shadow-md shadow-cyan-950/50 transition-colors"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span className="hidden xs:inline">Add Opportunity</span>
        </button>
      </div>
    </header>
  );
};
