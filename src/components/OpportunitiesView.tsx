import React, { useState, useMemo } from 'react';
import {
  Opportunity,
  OpportunityStatus,
  OpportunityCategory,
  UrgencyLevel,
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
} from '../utils/dateUtils';
import {
  Filter,
  Search,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  ExternalLink,
  Globe,
  Radio,
  CheckCircle2,
  Clock,
  ArrowUpDown,
} from 'lucide-react';

interface OpportunitiesViewProps {
  opportunities: Opportunity[];
  onSelectOpportunity: (opp: Opportunity) => void;
  onUpdateStatus: (id: string, newStatus: OpportunityStatus) => void;
  onCheckWebsite: (id: string) => void;
  checkingIds: Set<string>;
  onOpenAddModal: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const ALL_STATUSES: OpportunityStatus[] = [
  'Interested',
  'Planning to register',
  'Registered',
  'Applied',
  'Selected',
  'In progress',
  'Completed',
  'Rejected',
  'Not participating',
];

const ALL_CATEGORIES: OpportunityCategory[] = [
  'hackathon',
  'ctf',
  'workshop',
  'competition',
  'program',
  'scholarship',
  'internship',
  'conference',
  'fellowship',
  'grant',
  'other',
];

export const OpportunitiesView: React.FC<OpportunitiesViewProps> = ({
  opportunities,
  onSelectOpportunity,
  onUpdateStatus,
  onCheckWebsite,
  checkingIds,
  onOpenAddModal,
  searchQuery,
  setSearchQuery,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'deadline' | 'name' | 'recently_updated'>('deadline');

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((o) => o.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [opportunities]);

  // Extract all unique organizations
  const allOrganizations = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((o) => {
      if (o.organization) set.add(o.organization);
    });
    return Array.from(set).sort();
  }, [opportunities]);

  // Filtered and sorted opportunities
  const filtered = useMemo(() => {
    return opportunities.filter((opp) => {
      // Search query (name, org, tags, notes)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = opp.name.toLowerCase().includes(q);
        const matchOrg = opp.organization.toLowerCase().includes(q);
        const matchTags = opp.tags.some((t) => t.toLowerCase().includes(q));
        const matchNotes = opp.notes.toLowerCase().includes(q);
        if (!matchName && !matchOrg && !matchTags && !matchNotes) return false;
      }

      // Category
      if (selectedCategory !== 'all' && opp.category !== selectedCategory) {
        return false;
      }

      // Status
      if (selectedStatus !== 'all' && opp.status !== selectedStatus) {
        return false;
      }

      // Urgency
      if (selectedUrgency !== 'all') {
        const urg = getUrgencyLevel(opp.deadline);
        if (urg !== selectedUrgency) return false;
      }

      // Tag
      if (selectedTag !== 'all' && !opp.tags.includes(selectedTag)) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'deadline') {
        const da = getDaysRemaining(a.deadline) ?? Infinity;
        const db = getDaysRemaining(b.deadline) ?? Infinity;
        return da - db;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [
    opportunities,
    searchQuery,
    selectedCategory,
    selectedStatus,
    selectedUrgency,
    selectedTag,
    sortBy,
  ]);

  const resetFilters = () => {
    setSelectedCategory('all');
    setSelectedStatus('all');
    setSelectedUrgency('all');
    setSelectedTag('all');
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedCategory !== 'all' ||
    selectedStatus !== 'all' ||
    selectedUrgency !== 'all' ||
    selectedTag !== 'all' ||
    searchQuery !== '';

  return (
    <div id="opportunities-view" className="space-y-5">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Opportunity Registry</span>
            <span className="rounded-full bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 text-xs text-cyan-400 font-mono">
              {filtered.length} of {opportunities.length}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your tracked competitions, CTFs, conferences, and grants.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Grid vs List toggle */}
          <div className="flex items-center rounded-lg border border-[#1e293b] bg-[#0c101a] p-1">
            <button
              id="view-mode-grid"
              onClick={() => setViewMode('grid')}
              className={`rounded p-1 text-slate-400 transition-colors ${
                viewMode === 'grid' ? 'bg-[#1e293b] text-cyan-300' : 'hover:text-slate-200'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              id="view-mode-list"
              onClick={() => setViewMode('list')}
              className={`rounded p-1 text-slate-400 transition-colors ${
                viewMode === 'list' ? 'bg-[#1e293b] text-cyan-300' : 'hover:text-slate-200'
              }`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1 text-xs text-slate-400 border border-[#1e293b] bg-[#0c101a] rounded-lg px-2 py-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer text-xs"
            >
              <option value="deadline" className="bg-[#0c101a]">Nearest Deadline</option>
              <option value="name" className="bg-[#0c101a]">Name (A-Z)</option>
              <option value="recently_updated" className="bg-[#0c101a]">Recently Updated</option>
            </select>
          </div>

          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-[#1e293b] bg-[#0e1320] p-3.5 space-y-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1 shrink-0 mr-1">
            <Filter className="h-3 w-3" />
            Category:
          </span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
              selectedCategory === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            All Categories
          </button>
          {ALL_CATEGORIES.map((cat) => {
            const config = getCategoryConfig(cat);
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
                  selectedCategory === cat
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {config.label}
              </button>
            );
          })}
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1a2333] text-xs">
          {/* Status filter */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Urgency filter */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Urgency</label>
            <select
              value={selectedUrgency}
              onChange={(e) => setSelectedUrgency(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
            >
              <option value="all">All Urgency Levels</option>
              <option value="urgent">Urgent (≤ 3 days)</option>
              <option value="approaching">Approaching (4-10 days)</option>
              <option value="comfortable">Comfortable (&gt; 10 days)</option>
              <option value="passed">Deadline Passed</option>
            </select>
          </div>

          {/* Tag filter */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Tag</label>
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
            >
              <option value="all">All Tags ({allTags.length})</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          </div>

          {/* Quick reset button */}
          <div className="flex items-end">
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="w-full rounded-lg border border-slate-700 bg-[#162033] py-1.5 text-xs text-slate-300 hover:bg-[#1f2d47] hover:text-white transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((opp) => {
            const urgency = getUrgencyLevel(opp.deadline);
            const urgencyConfig = getUrgencyBadgeConfig(urgency);
            const statusConfig = getStatusBadgeConfig(opp.status);
            const catConfig = getCategoryConfig(opp.category);
            const countdown = formatCountdown(opp.deadline);
            const completedTasks = opp.tasks.filter((t) => t.completed).length;
            const totalTasks = opp.tasks.length;
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            const isChecking = checkingIds.has(opp.id);

            return (
              <div
                key={opp.id}
                id={`opp-card-${opp.id}`}
                onClick={() => onSelectOpportunity(opp)}
                className="group relative flex flex-col justify-between rounded-xl border border-[#1e293b] bg-[#101524] p-4 cursor-pointer hover:border-cyan-500/40 hover:bg-[#131b2e] transition-all shadow-sm"
              >
                {opp.tracking.status === 'changed' && (
                  <div className="absolute -top-2.5 right-4 z-10 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-black shadow-md">
                    <Radio className="h-3 w-3" />
                    <span>CHANGED</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase border ${catConfig.colorClass}`}
                    >
                      {catConfig.label}
                    </span>

                    {/* Status change dropdown */}
                    <select
                      value={opp.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateStatus(opp.id, e.target.value as OpportunityStatus)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium border focus:outline-none cursor-pointer ${statusConfig.badgeClass}`}
                    >
                      {ALL_STATUSES.map((st) => (
                        <option key={st} value={st} className="bg-[#0c101a] text-slate-200">
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                    {opp.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mb-3 truncate">
                    {opp.organization}
                  </p>

                  {/* Deadline & countdown */}
                  <div className="rounded-lg border border-[#1a2333] bg-[#0c101a] p-2.5 mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Deadline:</span>
                      <span className="font-mono text-slate-200">{formatDate(opp.deadline)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${urgencyConfig.badgeClass}`}>
                        {urgencyConfig.label}
                      </span>
                      <span className="font-mono font-bold text-cyan-400 text-xs">
                        {countdown}
                      </span>
                    </div>
                  </div>

                  {/* Checklist progress */}
                  {totalTasks > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span>Checklist</span>
                        <span className="font-mono">{completedTasks}/{totalTasks} ({progress}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#1a2333] overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 rounded-full"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {opp.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {opp.tags.slice(0, 3).map((tag, i) => (
                        <span key={i} className="rounded bg-[#162033] px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer website status & action */}
                <div className="pt-2.5 border-t border-[#1a2333] flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1 truncate max-w-[170px]">
                    <Globe className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    {opp.tracking.status === 'error' ? (
                      <span className="text-[11px] text-rose-400 truncate">Unable to check</span>
                    ) : opp.tracking.status === 'changed' ? (
                      <span className="text-[11px] font-semibold text-amber-400">Updated</span>
                    ) : (
                      <span className="text-[11px] truncate">
                        {opp.tracking.lastChecked ? formatRelativeTime(opp.tracking.lastChecked) : 'Not checked'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {opp.websiteUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCheckWebsite(opp.id);
                        }}
                        disabled={isChecking}
                        title="Check website now"
                        className="rounded p-1 text-slate-400 hover:text-cyan-300 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
                      </button>
                    )}
                    <span className="text-cyan-400 text-xs hover:underline font-medium">View &rarr;</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="rounded-xl border border-[#1e293b] bg-[#101524] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1e293b] bg-[#0c101a] text-[11px] font-semibold uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Opportunity</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Deadline</th>
                  <th className="px-3 py-3">Urgency</th>
                  <th className="px-3 py-3">Checklist</th>
                  <th className="px-3 py-3">Site Monitoring</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#162033]">
                {filtered.map((opp) => {
                  const urgency = getUrgencyLevel(opp.deadline);
                  const urgencyConfig = getUrgencyBadgeConfig(urgency);
                  const statusConfig = getStatusBadgeConfig(opp.status);
                  const catConfig = getCategoryConfig(opp.category);
                  const countdown = formatCountdown(opp.deadline);
                  const completedTasks = opp.tasks.filter((t) => t.completed).length;
                  const totalTasks = opp.tasks.length;
                  const isChecking = checkingIds.has(opp.id);

                  return (
                    <tr
                      key={opp.id}
                      onClick={() => onSelectOpportunity(opp)}
                      className="cursor-pointer hover:bg-[#141c2e] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-white text-sm hover:text-cyan-300 transition-colors">
                          {opp.name}
                        </div>
                        <div className="text-slate-400 text-[11px]">{opp.organization}</div>
                      </td>

                      <td className="px-3 py-3">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase border ${catConfig.colorClass}`}>
                          {catConfig.label}
                        </span>
                      </td>

                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={opp.status}
                          onChange={(e) => onUpdateStatus(opp.id, e.target.value as OpportunityStatus)}
                          className={`rounded px-2 py-0.5 text-[11px] font-medium border focus:outline-none cursor-pointer ${statusConfig.badgeClass}`}
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st} value={st} className="bg-[#0c101a] text-slate-200">
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-3 font-mono text-slate-200 whitespace-nowrap">
                        <div>{formatDate(opp.deadline)}</div>
                        <div className="text-[11px] font-semibold text-cyan-400">{countdown}</div>
                      </td>

                      <td className="px-3 py-3">
                        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${urgencyConfig.badgeClass}`}>
                          {urgencyConfig.label}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="font-mono text-slate-300">
                          {completedTasks}/{totalTasks}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-slate-400 whitespace-nowrap">
                        {opp.tracking.status === 'error' ? (
                          <span className="text-rose-400 text-[11px]">Unable to check</span>
                        ) : opp.tracking.status === 'changed' ? (
                          <span className="text-amber-400 font-bold text-[11px]">Changed!</span>
                        ) : opp.tracking.lastChecked ? (
                          <span className="text-[11px]">{formatRelativeTime(opp.tracking.lastChecked)}</span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Not monitored</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {opp.websiteUrl && (
                            <button
                              onClick={() => onCheckWebsite(opp.id)}
                              disabled={isChecking}
                              title="Check website"
                              className="rounded p-1 text-slate-400 hover:text-cyan-300 disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={() => onSelectOpportunity(opp)}
                            className="rounded bg-[#162238] px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
