import { UrgencyLevel, OpportunityStatus, OpportunityCategory } from '../types';

/**
 * Parses any date string safely into a Date object.
 * Correctly avoids UTC timezone shifting for YYYY-MM-DD date-only strings.
 */
export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Handle YYYY-MM-DD date-only strings in local timezone context to prevent off-by-one errors
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates days remaining until a deadline.
 * Returns null if the deadline string is empty, missing, or invalid.
 * Negative indicates deadline has passed.
 */
export function getDaysRemaining(deadlineStr: string | null | undefined, referenceDate: Date = new Date()): number | null {
  const deadline = parseDate(deadlineStr);
  if (!deadline) return null;

  // Compare on midnight boundaries for day-level precision
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const target = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());

  const diffMs = target.getTime() - ref.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determine urgency level based on days remaining.
 */
export function getUrgencyLevel(deadlineStr: string | null | undefined, referenceDate: Date = new Date()): UrgencyLevel {
  const days = getDaysRemaining(deadlineStr, referenceDate);
  if (days === null) return 'none';
  if (days < 0) return 'passed';
  if (days <= 3) return 'urgent';
  if (days <= 10) return 'approaching';
  return 'comfortable';
}

/**
 * Generates a human-friendly countdown or status string.
 */
export function formatCountdown(deadlineStr: string | null | undefined, referenceDate: Date = new Date()): string {
  const days = getDaysRemaining(deadlineStr, referenceDate);
  if (days === null) {
    return 'No deadline set';
  }
  
  if (days < 0) {
    const passedDays = Math.abs(days);
    return passedDays === 1 ? 'Passed yesterday' : `Passed ${passedDays} days ago`;
  }
  if (days === 0) {
    return 'Deadline is TODAY!';
  }
  if (days === 1) {
    return 'Tomorrow (1 day left)';
  }
  return `${days} days left`;
}

/**
 * Formats a date string into readable format like "Sep 14, 2026".
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr || !dateStr.trim()) return 'No date set';
  const d = parseDate(dateStr);
  if (!d) return 'TBD';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a date string into compact format like "Sep 20".
 */
export function formatShortMonthDay(dateStr: string | null | undefined): string {
  if (!dateStr || !dateStr.trim()) return 'No date';
  const d = parseDate(dateStr);
  if (!d) return 'TBD';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a relative timestamp (e.g. "Just now", "5m ago", "2h ago", "Yesterday").
 */
export function formatRelativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return 'Never';
  const d = parseDate(isoStr);
  if (!d) return 'Unknown';

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(isoStr);
}

/**
 * Visual styling helpers for Urgency
 */
export function getUrgencyBadgeConfig(urgency: UrgencyLevel): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (urgency) {
    case 'urgent':
      return {
        label: 'Urgent',
        badgeClass: 'bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-sm shadow-rose-950/50',
        dotClass: 'bg-rose-500 animate-pulse',
      };
    case 'approaching':
      return {
        label: 'Approaching',
        badgeClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
        dotClass: 'bg-amber-400',
      };
    case 'comfortable':
      return {
        label: 'Comfortable',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
        dotClass: 'bg-emerald-400',
      };
    case 'passed':
      return {
        label: 'Deadline Passed',
        badgeClass: 'bg-slate-800/60 text-slate-400 border border-slate-700/40',
        dotClass: 'bg-slate-500',
      };
    case 'none':
      return {
        label: 'No Deadline',
        badgeClass: 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/40',
        dotClass: 'bg-zinc-500',
      };
  }
}

/**
 * Visual styling helpers for Opportunity Status
 */
export function getStatusBadgeConfig(status: OpportunityStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'Interested':
      return { label: 'Interested', badgeClass: 'bg-sky-500/15 text-sky-300 border border-sky-500/30' };
    case 'Planning to register':
      return { label: 'Planning to Register', badgeClass: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30' };
    case 'Registered':
      return { label: 'Registered', badgeClass: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium' };
    case 'Applied':
      return { label: 'Applied', badgeClass: 'bg-blue-500/15 text-blue-300 border border-blue-500/30' };
    case 'Selected':
      return { label: 'Selected / Accepted', badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold' };
    case 'In progress':
      return { label: 'In Progress', badgeClass: 'bg-violet-500/15 text-violet-300 border border-violet-500/30' };
    case 'Completed':
      return { label: 'Completed', badgeClass: 'bg-teal-500/15 text-teal-300 border border-teal-500/30' };
    case 'Rejected':
      return { label: 'Rejected', badgeClass: 'bg-rose-500/15 text-rose-300 border border-rose-500/30' };
    case 'Not participating':
      return { label: 'Not Participating', badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700' };
  }
}

/**
 * Category labels and colors
 */
export function getCategoryConfig(category: OpportunityCategory): {
  label: string;
  colorClass: string;
} {
  switch (category) {
    case 'ctf':
      return { label: 'CTF', colorClass: 'text-red-400 bg-red-950/40 border-red-800/40' };
    case 'hackathon':
      return { label: 'Hackathon', colorClass: 'text-violet-400 bg-violet-950/40 border-violet-800/40' };
    case 'competition':
      return { label: 'Competition', colorClass: 'text-amber-400 bg-amber-950/40 border-amber-800/40' };
    case 'program':
      return { label: 'Dev Program', colorClass: 'text-blue-400 bg-blue-950/40 border-blue-800/40' };
    case 'scholarship':
      return { label: 'Scholarship', colorClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' };
    case 'internship':
      return { label: 'Internship', colorClass: 'text-teal-400 bg-teal-950/40 border-teal-800/40' };
    case 'conference':
      return { label: 'Conference', colorClass: 'text-fuchsia-400 bg-fuchsia-950/40 border-fuchsia-800/40' };
    case 'workshop':
      return { label: 'Workshop', colorClass: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/40' };
    case 'fellowship':
      return { label: 'Fellowship', colorClass: 'text-lime-400 bg-lime-950/40 border-lime-800/40' };
    case 'grant':
      return { label: 'Grant', colorClass: 'text-yellow-400 bg-yellow-950/40 border-yellow-800/40' };
    case 'other':
    default:
      return { label: 'Opportunity', colorClass: 'text-slate-400 bg-slate-800/50 border-slate-700' };
  }
}
