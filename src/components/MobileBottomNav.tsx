import React from 'react';
import {
  LayoutDashboard,
  Clock,
  Mic,
  Bot,
  Plus,
  Bell,
  CheckSquare,
} from 'lucide-react';
import { ActiveView } from '../types';

interface MobileBottomNavProps {
  currentView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  urgentDeadlinesCount: number;
  unreadNotificationsCount: number;
  onOpenQuickCapture: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  urgentDeadlinesCount,
  unreadNotificationsCount,
  onOpenQuickCapture,
}) => {
  return (
    <nav
      id="mobile-bottom-nav"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c101a]/95 backdrop-blur-lg border-t border-[#1e293b] px-3 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom"
    >
      {/* 1. Dashboard */}
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-w-[56px] ${
          currentView === 'dashboard'
            ? 'text-cyan-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <LayoutDashboard className="h-5 w-5" />
        <span className="text-[10px] mt-1">Overview</span>
      </button>

      {/* 2. Deadlines */}
      <button
        type="button"
        onClick={() => onNavigate('deadlines')}
        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative min-w-[56px] ${
          currentView === 'deadlines'
            ? 'text-amber-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <Clock className="h-5 w-5" />
          {urgentDeadlinesCount > 0 && (
            <span className="absolute -top-1 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm">
              {urgentDeadlinesCount}
            </span>
          )}
        </div>
        <span className="text-[10px] mt-1">Deadlines</span>
      </button>

      {/* 3. Center Quick Add / Quick Capture Button */}
      <div className="flex flex-col items-center justify-center -mt-5">
        <button
          type="button"
          onClick={onOpenQuickCapture}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-900/50 hover:scale-105 active:scale-95 transition-transform border-2 border-[#0c101a]"
          aria-label="Quick Capture"
        >
          <Plus className="h-6 w-6 stroke-[2.5]" />
        </button>
        <span className="text-[9px] font-bold text-cyan-400 mt-0.5">Quick +</span>
      </div>

      {/* 4. Voice Notes */}
      <button
        type="button"
        onClick={() => onNavigate('voice')}
        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-w-[56px] ${
          currentView === 'voice'
            ? 'text-cyan-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Mic className="h-5 w-5" />
        <span className="text-[10px] mt-1">Voice</span>
      </button>

      {/* 5. AI Assistant */}
      <button
        type="button"
        onClick={() => onNavigate('assistant')}
        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-w-[56px] ${
          currentView === 'assistant'
            ? 'text-violet-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Bot className="h-5 w-5" />
        <span className="text-[10px] mt-1">Assistant</span>
      </button>
    </nav>
  );
};
