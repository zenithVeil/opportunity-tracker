import React, { useState } from 'react';
import { AppNotification } from '../types';
import { formatRelativeTime } from '../utils/dateUtils';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  AlertTriangle,
  Clock,
  Radio,
  FileWarning,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

interface NotificationsViewProps {
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onSelectOpportunityById: (oppId: string) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onSelectOpportunityById,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'website_change' | 'deadline'>('all');

  const filtered = notifications.filter((n) => {
    if (filterType === 'unread' && n.read) return false;
    if (filterType === 'website_change' && n.type !== 'website_change') return false;
    if (filterType === 'deadline' && n.type !== 'deadline_reminder') return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div id="notifications-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-400" />
            <span>Alerts & Notifications Feed</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-xs text-rose-300 font-bold">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time deadline proximity warnings, website change diffs, and task alerts.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            id="mark-all-notifications-read-btn"
            onClick={onMarkAllAsRead}
            className="flex items-center gap-1.5 rounded-lg border border-[#1e293b] bg-[#121827] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-500/30 hover:text-cyan-300 transition-colors"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1e293b] pb-2 text-xs">
        <button
          onClick={() => setFilterType('all')}
          className={`rounded-lg px-3 py-1.5 transition-colors ${
            filterType === 'all'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          All Alerts ({notifications.length})
        </button>
        <button
          onClick={() => setFilterType('unread')}
          className={`rounded-lg px-3 py-1.5 transition-colors ${
            filterType === 'unread'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Unread ({unreadCount})
        </button>
        <button
          onClick={() => setFilterType('website_change')}
          className={`rounded-lg px-3 py-1.5 transition-colors ${
            filterType === 'website_change'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Website Changes
        </button>
        <button
          onClick={() => setFilterType('deadline')}
          className={`rounded-lg px-3 py-1.5 transition-colors ${
            filterType === 'deadline'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Deadlines
        </button>
      </div>

      {/* Notification List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-[#1e293b] bg-[#111624] p-8 text-center">
            <Bell className="mx-auto h-8 w-8 text-slate-500 mb-2" />
            <p className="text-sm font-medium text-slate-300">No notifications to display</p>
            <p className="text-xs text-slate-500 mt-1">
              You are completely up-to-date.
            </p>
          </div>
        ) : (
          filtered.map((n) => {
            const isWebsiteChange = n.type === 'website_change';
            const isFailure = n.type === 'check_failure';
            const isOverdue = n.type === 'overdue_task';

            return (
              <div
                key={n.id}
                className={`group flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-xl border p-4 transition-all ${
                  !n.read
                    ? isWebsiteChange
                      ? 'border-amber-500/40 bg-[#16130d]'
                      : isFailure
                      ? 'border-rose-500/40 bg-[#160d0f]'
                      : 'border-cyan-500/40 bg-[#0d1622]'
                    : 'border-[#1a2333] bg-[#0c101a] opacity-75'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Icon */}
                  <div
                    className={`mt-0.5 rounded-lg p-2 shrink-0 ${
                      isWebsiteChange
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : isFailure
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : isOverdue
                        ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                        : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    }`}
                  >
                    {isWebsiteChange ? (
                      <Radio className="h-4 w-4" />
                    ) : isFailure ? (
                      <ShieldAlert className="h-4 w-4" />
                    ) : isOverdue ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-sm font-bold text-white">{n.title}</h4>
                      {!n.read && (
                        <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      )}
                      <span className="text-[11px] text-slate-400 ml-auto font-mono">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{n.message}</p>

                    {/* Diff snippet if website change */}
                    {n.details?.summary && (
                      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 text-xs text-amber-200">
                        <span className="font-semibold">Detected Change:</span> {n.details.summary}
                      </div>
                    )}

                    {n.opportunityId && (
                      <div className="mt-2">
                        <button
                          onClick={() => onSelectOpportunityById(n.opportunityId!)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline"
                        >
                          <span>Open Opportunity Details</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2 self-end sm:self-start shrink-0 pt-2 sm:pt-0">
                  {!n.read && (
                    <button
                      onClick={() => onMarkAsRead(n.id)}
                      title="Mark as read"
                      className="rounded p-1.5 text-slate-400 hover:bg-[#162033] hover:text-cyan-300 transition-colors"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteNotification(n.id)}
                    title="Dismiss alert"
                    className="rounded p-1.5 text-slate-500 hover:bg-[#162033] hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
