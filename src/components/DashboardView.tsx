import React, { useState } from 'react';
import {
  Opportunity,
  OpportunityStatus,
  AppNotification,
} from '../types';
import {
  getDaysRemaining,
  getUrgencyLevel,
  getUrgencyBadgeConfig,
  getStatusBadgeConfig,
  getCategoryConfig,
  formatDate,
  formatCountdown,
  formatRelativeTime,
  formatShortMonthDay,
} from '../utils/dateUtils';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  ListTodo,
  Radio,
  RefreshCw,
  Sparkles,
  Target,
  ArrowRight,
} from 'lucide-react';
import { ActiveTab } from './Sidebar';

interface DashboardViewProps {
  opportunities: Opportunity[];
  notifications: AppNotification[];
  onSelectOpportunity: (opp: Opportunity) => void;
  onUpdateStatus: (id: string, newStatus: OpportunityStatus) => void;
  onCheckWebsite: (id: string) => void;
  checkingIds: Set<string>;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenAddModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  opportunities,
  notifications,
  onSelectOpportunity,
  onUpdateStatus,
  onCheckWebsite,
  checkingIds,
  setActiveTab,
  onOpenAddModal,
}) => {
  const [activeSection, setActiveSection] = useState<
    'upcoming' | 'urgent' | 'registered' | 'interested' | 'recently_updated'
  >('upcoming');

  // Metrics
  const totalCount = opportunities.length;
  const registeredCount = opportunities.filter(
    (o) => o.status === 'Registered' || o.status === 'Selected' || o.status === 'Applied'
  ).length;

  const urgentOpportunities = opportunities.filter((o) => {
    const days = getDaysRemaining(o.deadline);
    return days >= 0 && days <= 3;
  });

  const upcomingDeadlines = [...opportunities]
    .filter((o) => getDaysRemaining(o.deadline) >= 0)
    .sort((a, b) => getDaysRemaining(a.deadline) - getDaysRemaining(b.deadline));

  const upcomingDeadlines14d = upcomingDeadlines.filter(
    (o) => getDaysRemaining(o.deadline) <= 14
  );

  const pendingTasksTotal = opportunities.reduce((acc, opp) => {
    return acc + opp.tasks.filter((t) => !t.completed).length;
  }, 0);

  // Statuses for filtering tabs
  const registeredEvents = opportunities.filter(
    (o) => o.status === 'Registered' || o.status === 'Selected'
  );
  const interestedEvents = opportunities.filter(
    (o) => o.status === 'Interested' || o.status === 'Planning to register'
  );
  const recentlyUpdatedEvents = [...opportunities].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const displayedList =
    activeSection === 'urgent'
      ? urgentOpportunities
      : activeSection === 'registered'
      ? registeredEvents
      : activeSection === 'interested'
      ? interestedEvents
      : activeSection === 'recently_updated'
      ? recentlyUpdatedEvents
      : upcomingDeadlines;

  return (
    <div id="dashboard-view" className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Opportunities */}
        <div
          id="stat-card-total"
          onClick={() => setActiveTab('opportunities')}
          className="group cursor-pointer rounded-xl border border-[#1e293b] bg-[#111624] p-4 transition-all hover:border-cyan-500/40 hover:bg-[#151c2e]"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">TOTAL OPPORTUNITIES</span>
            <Target className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {totalCount}
            </span>
            <span className="text-xs text-slate-400">tracked</span>
          </div>
        </div>

        {/* Registered */}
        <div
          id="stat-card-registered"
          onClick={() => {
            setActiveSection('registered');
          }}
          className="group cursor-pointer rounded-xl border border-[#1e293b] bg-[#111624] p-4 transition-all hover:border-emerald-500/40 hover:bg-[#151c2e]"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">REGISTERED</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-400 tracking-tight">
              {registeredCount}
            </span>
            <span className="text-xs text-slate-400">active</span>
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div
          id="stat-card-upcoming"
          onClick={() => setActiveTab('deadlines')}
          className="group cursor-pointer rounded-xl border border-[#1e293b] bg-[#111624] p-4 transition-all hover:border-amber-500/40 hover:bg-[#151c2e]"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">UPCOMING (14D)</span>
            <Clock className="h-4 w-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-amber-400 tracking-tight">
              {upcomingDeadlines14d.length}
            </span>
            <span className="text-xs text-slate-400">events</span>
          </div>
        </div>

        {/* Urgent Attention */}
        <div
          id="stat-card-urgent"
          onClick={() => setActiveSection('urgent')}
          className="group cursor-pointer rounded-xl border border-rose-900/40 bg-[#16121f] p-4 transition-all hover:border-rose-500/50 hover:bg-[#1c1426]"
        >
          <div className="flex items-center justify-between text-xs text-rose-300 mb-2">
            <span className="font-medium">URGENT</span>
            <Flame className="h-4 w-4 text-rose-400 animate-pulse" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-rose-400 tracking-tight">
              {urgentOpportunities.length}
            </span>
            <span className="text-xs text-rose-300">≤ 3 days</span>
          </div>
        </div>

        {/* Tasks to do */}
        <div
          id="stat-card-tasks"
          onClick={() => setActiveTab('tasks')}
          className="group cursor-pointer rounded-xl border border-[#1e293b] bg-[#111624] p-4 transition-all hover:border-cyan-500/40 hover:bg-[#151c2e] col-span-2 lg:col-span-1"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">TASKS TO DO</span>
            <ListTodo className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-cyan-400 tracking-tight">
              {pendingTasksTotal}
            </span>
            <span className="text-xs text-slate-400">pending</span>
          </div>
        </div>
      </div>

      {/* Urgent Attention Callout Banner if any exist */}
      {urgentOpportunities.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-[#18101a] to-rose-950/20 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="rounded-lg bg-rose-500/20 p-2 text-rose-400 border border-rose-500/40">
                <AlertTriangle className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-rose-200">
                  {urgentOpportunities.length} {urgentOpportunities.length === 1 ? 'Opportunity requires' : 'Opportunities require'} immediate attention!
                </h3>
                <p className="text-xs text-rose-300/80">
                  Deadlines closing in 72 hours or less. Verify checklists and submit before closing.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                id="urgent-banner-review-btn"
                onClick={() => setActiveSection('urgent')}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 transition-colors"
              >
                Review Urgent ({urgentOpportunities.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Section Header & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e293b] pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          <h2 className="text-base font-semibold text-white tracking-tight">
            Opportunity Intelligence
          </h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            {displayedList.length}
          </span>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            id="tab-upcoming-deadlines"
            onClick={() => setActiveSection('upcoming')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeSection === 'upcoming'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121827]'
            }`}
          >
            Upcoming Deadlines
          </button>
          <button
            id="tab-urgent"
            onClick={() => setActiveSection('urgent')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeSection === 'urgent'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121827]'
            }`}
          >
            Urgent ({urgentOpportunities.length})
          </button>
          <button
            id="tab-registered"
            onClick={() => setActiveSection('registered')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeSection === 'registered'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121827]'
            }`}
          >
            Registered ({registeredEvents.length})
          </button>
          <button
            id="tab-interested"
            onClick={() => setActiveSection('interested')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeSection === 'interested'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121827]'
            }`}
          >
            Interested ({interestedEvents.length})
          </button>
          <button
            id="tab-recently-updated"
            onClick={() => setActiveSection('recently_updated')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeSection === 'recently_updated'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121827]'
            }`}
          >
            Recently Updated
          </button>
        </div>
      </div>

      {/* Opportunities Card Grid */}
      {displayedList.length === 0 ? (
        <div className="rounded-xl border border-[#1e293b] bg-[#111624] p-8 text-center">
          <Target className="mx-auto h-8 w-8 text-slate-500 mb-2" />
          <p className="text-sm text-slate-300 font-medium">No opportunities match this filter</p>
          <p className="text-xs text-slate-500 mt-1">
            Add a new opportunity or select another section.
          </p>
          <button
            onClick={onOpenAddModal}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400 transition-colors"
          >
            + Add Opportunity
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Home-Screen Opportunity Cards (Minimal Design per specification) */}
          <div className="md:hidden flex flex-col gap-2">
            {displayedList.map((opp) => {
              const days = getDaysRemaining(opp.deadline);
              const alertColor = days <= 3 ? '🔴' : days <= 10 ? '🟠' : '🟢';
              const formattedDate = formatShortMonthDay(opp.deadline);

              return (
                <div
                  key={`mobile-${opp.id}`}
                  id={`mobile-opp-card-${opp.id}`}
                  onClick={() => onSelectOpportunity(opp)}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-[#1e293b] bg-[#0c101a] active:bg-[#151c2e] hover:border-slate-700 transition-colors cursor-pointer min-h-[52px] select-none"
                >
                  <span className="text-sm font-medium text-white truncate pr-3">
                    {opp.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs leading-none">{alertColor}</span>
                    <span className="text-xs font-mono font-medium text-slate-300">
                      {formattedDate}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Opportunity Cards Grid */}
          <div className="hidden md:grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayedList.map((opp) => {
            const urgency = getUrgencyLevel(opp.deadline);
            const urgencyConfig = getUrgencyBadgeConfig(urgency);
            const statusConfig = getStatusBadgeConfig(opp.status);
            const catConfig = getCategoryConfig(opp.category);
            const countdown = formatCountdown(opp.deadline);
            const completedTasks = opp.tasks.filter((t) => t.completed).length;
            const totalTasks = opp.tasks.length;
            const progressPercent =
              totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            const isChecking = checkingIds.has(opp.id);

            return (
              <div
                key={opp.id}
                id={`opp-card-${opp.id}`}
                className="group relative flex flex-col justify-between rounded-xl border border-[#1e293b] bg-[#101524] p-4 transition-all hover:border-cyan-500/40 hover:bg-[#131b2e] shadow-sm hover:shadow-lg hover:shadow-black/40"
              >
                {/* Changed / New indicator badge */}
                {opp.tracking.status === 'changed' && (
                  <div className="absolute -top-2.5 right-4 z-10 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-0.5 text-[10px] font-bold text-black shadow-md animate-bounce">
                    <Radio className="h-3 w-3" />
                    <span>CHANGED ON SITE</span>
                  </div>
                )}

                <div>
                  {/* Category & Status Bar */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase border ${catConfig.colorClass}`}
                      >
                        {catConfig.label}
                      </span>
                      <span className="text-xs text-slate-400 font-medium truncate max-w-[140px]">
                        {opp.organization}
                      </span>
                    </div>

                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${statusConfig.badgeClass}`}
                    >
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Title */}
                  <h3
                    onClick={() => onSelectOpportunity(opp)}
                    className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors cursor-pointer line-clamp-1"
                    title={opp.name}
                  >
                    {opp.name}
                  </h3>

                  {/* Deadline & Urgency Display */}
                  <div className="mt-3 rounded-lg border border-[#1a2333] bg-[#0c101a] p-2.5">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        Deadline:
                      </span>
                      <span className="font-mono font-semibold text-slate-200">
                        {formatDate(opp.deadline)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${urgencyConfig.dotClass}`} />
                        <span className={`text-[11px] font-semibold ${urgencyConfig.badgeClass} px-1.5 py-0.5 rounded`}>
                          {urgencyConfig.label}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-cyan-400">
                        {countdown}
                      </span>
                    </div>
                  </div>

                  {/* Tasks Progress Bar */}
                  {totalTasks > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span className="flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="h-3 w-3 text-cyan-400" />
                          Checklist
                        </span>
                        <span className="font-mono text-[11px] text-slate-300">
                          {completedTasks}/{totalTasks} ({progressPercent}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1a2333]">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            progressPercent === 100
                              ? 'bg-emerald-400'
                              : progressPercent > 50
                              ? 'bg-cyan-400'
                              : 'bg-amber-400'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {opp.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {opp.tags.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-[#162033] px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
                        >
                          #{tag}
                        </span>
                      ))}
                      {opp.tags.length > 3 && (
                        <span className="text-[10px] text-slate-500 font-mono self-center">
                          +{opp.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer / Quick Actions */}
                <div className="mt-4 border-t border-[#1a2333] pt-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    {/* Website Tracking Status Pill */}
                    <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                      <Globe className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      {opp.tracking.status === 'error' ? (
                        <span className="truncate text-[11px] text-rose-400" title={opp.tracking.errorMessage}>
                          Unable to check site
                        </span>
                      ) : opp.tracking.status === 'changed' ? (
                        <span className="text-[11px] font-semibold text-amber-400">
                          Site info changed
                        </span>
                      ) : opp.tracking.lastChecked ? (
                        <span className="text-[11px] text-slate-400">
                          Checked {formatRelativeTime(opp.tracking.lastChecked)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Not monitored yet</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {opp.websiteUrl && (
                        <button
                          id={`check-site-${opp.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCheckWebsite(opp.id);
                          }}
                          disabled={isChecking}
                          title="Run live server-side website check"
                          className="rounded p-1 text-slate-400 hover:bg-[#162033] hover:text-cyan-300 disabled:opacity-50 transition-colors"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
                        </button>
                      )}

                      {opp.websiteUrl && (
                        <a
                          href={opp.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded p-1 text-slate-400 hover:bg-[#162033] hover:text-white transition-colors"
                          title="Open official website"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      <button
                        onClick={() => onSelectOpportunity(opp)}
                        className="flex items-center gap-1 rounded bg-[#162238] px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                      >
                        <span>Details</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
};
