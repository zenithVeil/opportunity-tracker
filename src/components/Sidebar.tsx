import React from 'react';
import {
  LayoutDashboard,
  Target,
  Clock,
  CheckSquare,
  Calendar,
  Bell,
  Bot,
  Settings,
  X,
  Radio,
  Mic,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'opportunities'
  | 'deadlines'
  | 'tasks'
  | 'calendar'
  | 'voice'
  | 'notifications'
  | 'assistant'
  | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  unreadCount: number;
  urgentCount: number;
  pendingTasksCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen,
  setMobileOpen,
  unreadCount,
  urgentCount,
  pendingTasksCount,
}) => {
  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'opportunities' as ActiveTab,
      label: 'Opportunities',
      icon: Target,
      badge: null,
    },
    {
      id: 'deadlines' as ActiveTab,
      label: 'Deadlines',
      icon: Clock,
      badge: urgentCount > 0 ? `${urgentCount} urgent` : null,
      badgeColor: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    },
    {
      id: 'tasks' as ActiveTab,
      label: 'Tasks',
      icon: CheckSquare,
      badge: pendingTasksCount > 0 ? `${pendingTasksCount}` : null,
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
    },
    {
      id: 'calendar' as ActiveTab,
      label: 'Calendar & Timeline',
      icon: Calendar,
      badge: null,
    },
    {
      id: 'voice' as ActiveTab,
      label: 'Voice Notes',
      icon: Mic,
      badge: 'SPEECH',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
    },
    {
      id: 'notifications' as ActiveTab,
      label: 'Notifications',
      icon: Bell,
      badge: unreadCount > 0 ? `${unreadCount}` : null,
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold',
    },
    {
      id: 'assistant' as ActiveTab,
      label: 'Opportunity AI',
      icon: Bot,
      badge: 'AI',
      badgeColor: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Settings',
      icon: Settings,
      badge: null,
    },
  ];

  const handleSelect = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          id="sidebar-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-72 flex-col border-r border-[#1a2333] bg-[#0c101a] transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="flex h-16 items-center justify-between border-b border-[#1a2333] px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-black font-bold shadow-lg shadow-cyan-950/50">
              <Radio className="h-5 w-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base">OPPORTUNITY</span>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60">
                  TRACKER
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Hackathons · CTFs · Programs</p>
            </div>
          </div>

          <button
            id="close-sidebar-btn"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#162033] hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live monitoring status tag */}
        <div className="px-4 py-3 border-b border-[#141b29] bg-[#0e1422]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-medium text-slate-300">Server Monitor</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
              ACTIVE
            </span>
          </div>
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => handleSelect(item.id)}
                className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#162238] text-cyan-300 shadow-sm border border-cyan-500/20'
                    : 'text-slate-400 hover:bg-[#111827] hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 transition-colors ${
                      isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      item.badgeColor || 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Assistant Callout */}
        <div className="p-3 m-3 rounded-xl border border-violet-500/20 bg-gradient-to-b from-[#131124] to-[#0d0f1a]">
          <div className="flex items-center gap-2 mb-1.5">
            <Bot className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-semibold text-violet-200">Opportunity AI</span>
          </div>
          <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
            Ask questions grounded strictly in your real tracked deadlines.
          </p>
          <button
            id="sidebar-ask-ai-btn"
            onClick={() => handleSelect('assistant')}
            className="w-full rounded-lg bg-violet-600/20 border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-600/30 transition-colors"
          >
            Open Assistant
          </button>
        </div>

        {/* Footer info */}
        <div className="border-t border-[#1a2333] px-4 py-3 text-xs text-slate-400 flex items-center justify-between">
          <span className="font-mono text-[11px]">v2.4 · CyberDark</span>
          <span className="text-[11px] text-slate-400">Sep 2026</span>
        </div>
      </aside>
    </>
  );
};
