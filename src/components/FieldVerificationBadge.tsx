import React from 'react';
import { VerifiedField, SourceType, VerificationStatus } from '../types';
import { CheckCircle2, AlertTriangle, HelpCircle, ExternalLink, ShieldCheck, User } from 'lucide-react';

interface FieldVerificationBadgeProps {
  field?: VerifiedField<any>;
  origin?: 'manual' | 'extracted' | 'verified' | string;
  sourceUrl?: string;
  sourceType?: SourceType;
  showDetails?: boolean;
}

export const FieldVerificationBadge: React.FC<FieldVerificationBadgeProps> = ({
  field,
  origin,
  sourceUrl,
  sourceType,
  showDetails = false,
}) => {
  const status: VerificationStatus = field?.verificationStatus || (origin === 'verified' ? 'verified' : 'unverified');
  const type: SourceType = field?.sourceType || sourceType || 'unverified';
  const url = field?.sourceUrl || sourceUrl;

  if (status === 'verified') {
    return (
      <span
        title={url ? `Verified from ${type.replace(/_/g, ' ')}: ${url}` : 'Verified against official source'}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded px-1.5 py-0.5"
      >
        <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>Verified</span>
        {showDetails && url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hover:underline opacity-80"
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </span>
    );
  }

  if (status === 'conflict') {
    return (
      <span
        title="Conflicting dates detected across sources"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5"
      >
        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Conflict</span>
      </span>
    );
  }

  if (status === 'unable_to_verify') {
    return (
      <span
        title="Could not be verified from live official sources"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded px-1.5 py-0.5"
      >
        <AlertTriangle className="h-3 w-3 text-rose-600 dark:text-rose-400 shrink-0" />
        <span>Unverified</span>
      </span>
    );
  }

  if (origin === 'user_provided' || origin === 'manual') {
    return (
      <span
        title="Provided manually by user"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded px-1.5 py-0.5"
      >
        <User className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
        <span>User-Provided</span>
      </span>
    );
  }

  return (
    <span
      title="Live retrieved information"
      className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5"
    >
      <ShieldCheck className="h-3 w-3 text-zinc-500 shrink-0" />
      <span>Retrieved</span>
    </span>
  );
};
