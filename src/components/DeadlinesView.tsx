import React, { useState } from 'react';
import { Opportunity, UrgencyLevel } from '../types';
import {
  getDaysRemaining,
  getUrgencyLevel,
  getUrgencyBadgeConfig,
  getStatusBadgeConfig,
  getCategoryConfig,
  formatDate,
  formatCountdown,
} from '../utils/dateUtils';
import {
  Clock,
  Flame,
  AlertCircle,
  CheckCircle,
  Calendar,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

interface DeadlinesViewProps {
  opportunities: Opportunity[];
  onSelectOpportunity: (opp: Opportunity) => void;
  onOpenAddModal: () => void;
}

export const DeadlinesView: React.FC<DeadlinesViewProps> = ({
  opportunities,
  onSelectOpportunity,
  onOpenAddModal,
}) => {
  const [selectedUrgencyTab, setSelectedUrgencyTab] = useState<UrgencyLevel | 'all'>('all');

  // Categorize by urgency
  const urgentList = opportunities
    .filter((o) => getUrgencyLevel(o.deadline) === 'urgent')
    .sort((a, b) => (getDaysRemaining(a.deadline) ?? Infinity) - (getDaysRemaining(b.deadline) ?? Infinity));

  const approachingList = opportunities
    .filter((o) => getUrgencyLevel(o.deadline) === 'approaching')
    .sort((a, b) => (getDaysRemaining(a.deadline) ?? Infinity) - (getDaysRemaining(b.deadline) ?? Infinity));

  const comfortableList = opportunities
    .filter((o) => getUrgencyLevel(o.deadline) === 'comfortable')
    .sort((a, b) => (getDaysRemaining(a.deadline) ?? Infinity) - (getDaysRemaining(b.deadline) ?? Infinity));

  const passedList = opportunities
    .filter((o) => getUrgencyLevel(o.deadline) === 'passed')
    .sort((a, b) => (getDaysRemaining(b.deadline) ?? -Infinity) - (getDaysRemaining(a.deadline) ?? -Infinity));

  const unscheduledList = opportunities
    .filter((o) => getUrgencyLevel(o.deadline) === 'none')
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredList =
    selectedUrgencyTab === 'urgent'
      ? urgentList
      : selectedUrgencyTab === 'approaching'
      ? approachingList
      : selectedUrgencyTab === 'comfortable'
      ? comfortableList
      : selectedUrgencyTab === 'passed'
      ? passedList
      : [...urgentList, ...approachingList, ...comfortableList, ...unscheduledList, ...passedList];

  return (
    <div id="deadlines-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Clock className="h-5 w-5 text-cyan-400" />
            <span>Deadline Intelligence Center</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Strict real-time tracking of upcoming deadlines, countdowns, and urgency states.
          </p>
        </div>
      </div>

      {/* Urgency Summary Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Urgent Card */}
        <div
          onClick={() => setSelectedUrgencyTab('urgent')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            selectedUrgencyTab === 'urgent'
              ? 'border-rose-500 bg-rose-950/40 ring-1 ring-rose-500'
              : 'border-rose-900/30 bg-[#140f17] hover:border-rose-700/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-300 mb-1.5">
            <span className="font-semibold tracking-wider uppercase flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
              Urgent (≤ 3d)
            </span>
            <span className="text-2xl font-bold text-rose-400">{urgentList.length}</span>
          </div>
          <p className="text-[11px] text-rose-300/80">Immediate attention needed</p>
        </div>

        {/* Approaching Card */}
        <div
          onClick={() => setSelectedUrgencyTab('approaching')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            selectedUrgencyTab === 'approaching'
              ? 'border-amber-500 bg-amber-950/40 ring-1 ring-amber-500'
              : 'border-amber-900/30 bg-[#17140f] hover:border-amber-700/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-300 mb-1.5">
            <span className="font-semibold tracking-wider uppercase flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              Approaching (4-10d)
            </span>
            <span className="text-2xl font-bold text-amber-400">{approachingList.length}</span>
          </div>
          <p className="text-[11px] text-amber-300/80">Prepare application & tools</p>
        </div>

        {/* Comfortable Card */}
        <div
          onClick={() => setSelectedUrgencyTab('comfortable')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            selectedUrgencyTab === 'comfortable'
              ? 'border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500'
              : 'border-emerald-900/30 bg-[#0f1714] hover:border-emerald-700/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-300 mb-1.5">
            <span className="font-semibold tracking-wider uppercase flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              Comfortable (&gt; 10d)
            </span>
            <span className="text-2xl font-bold text-emerald-400">{comfortableList.length}</span>
          </div>
          <p className="text-[11px] text-emerald-300/80">On schedule</p>
        </div>

        {/* Passed Card */}
        <div
          onClick={() => setSelectedUrgencyTab('passed')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            selectedUrgencyTab === 'passed'
              ? 'border-slate-500 bg-slate-900/60 ring-1 ring-slate-500'
              : 'border-slate-800/60 bg-[#0e121a] hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-semibold tracking-wider uppercase">Passed Deadlines</span>
            <span className="text-2xl font-bold text-slate-300">{passedList.length}</span>
          </div>
          <p className="text-[11px] text-slate-400">Past events & archives</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1e293b] pb-2">
        <button
          onClick={() => setSelectedUrgencyTab('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            selectedUrgencyTab === 'all'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          All Deadlines ({opportunities.length})
        </button>
        <button
          onClick={() => setSelectedUrgencyTab('urgent')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            selectedUrgencyTab === 'urgent'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Urgent ({urgentList.length})
        </button>
        <button
          onClick={() => setSelectedUrgencyTab('approaching')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            selectedUrgencyTab === 'approaching'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Approaching ({approachingList.length})
        </button>
        <button
          onClick={() => setSelectedUrgencyTab('comfortable')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            selectedUrgencyTab === 'comfortable'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Comfortable ({comfortableList.length})
        </button>
        <button
          onClick={() => setSelectedUrgencyTab('passed')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            selectedUrgencyTab === 'passed'
              ? 'bg-slate-700/40 text-slate-300 border border-slate-600'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Passed ({passedList.length})
        </button>
      </div>

      {/* Deadlines List */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="rounded-xl border border-[#1e293b] bg-[#111624] p-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-slate-500 mb-2" />
            <p className="text-sm font-medium text-slate-300">No deadlines in this urgency category</p>
          </div>
        ) : (
          filteredList.map((opp) => {
            const urgency = getUrgencyLevel(opp.deadline);
            const urgencyConfig = getUrgencyBadgeConfig(urgency);
            const statusConfig = getStatusBadgeConfig(opp.status);
            const catConfig = getCategoryConfig(opp.category);
            const daysRemaining = getDaysRemaining(opp.deadline);
            const countdown = formatCountdown(opp.deadline);
            const completedTasks = opp.tasks.filter((t) => t.completed).length;

            return (
              <div
                key={opp.id}
                id={`deadline-item-${opp.id}`}
                onClick={() => onSelectOpportunity(opp)}
                className={`group flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border p-4 cursor-pointer transition-all hover:bg-[#141b2c] ${
                  urgency === 'urgent'
                    ? 'border-rose-900/40 bg-[#130e18] hover:border-rose-500/50'
                    : urgency === 'approaching'
                    ? 'border-amber-900/30 bg-[#131215] hover:border-amber-500/50'
                    : 'border-[#1e293b] bg-[#101524] hover:border-cyan-500/40'
                }`}
              >
                {/* Left info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className={`mt-1 h-3 w-3 rounded-full shrink-0 ${urgencyConfig.dotClass}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase border ${catConfig.colorClass}`}>
                        {catConfig.label}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {opp.organization}
                      </span>
                      <span className={`rounded px-2 py-0.2 text-[10px] ${statusConfig.badgeClass}`}>
                        {statusConfig.label}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                      {opp.name}
                    </h3>

                    {opp.tasks.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        {completedTasks} of {opp.tasks.length} tasks finished
                        {opp.tasks.some(t => !t.completed && t.priority === 'high') && (
                          <span className="ml-2 text-rose-400 font-medium">⚠️ High-priority task pending</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right deadline badge & countdown */}
                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-[#1a2333] pt-3 md:pt-0">
                  <div className="text-left md:text-right">
                    <div className="text-xs text-slate-400">Deadline</div>
                    <div className="font-mono text-sm font-bold text-slate-200">
                      {formatDate(opp.deadline)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`inline-block rounded px-2.5 py-1 text-xs font-bold font-mono ${urgencyConfig.badgeClass}`}>
                      {countdown}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {daysRemaining !== null ? (daysRemaining >= 0 ? `${daysRemaining} calendar days` : 'Closed') : 'Unscheduled'}
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all hidden sm:block" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
