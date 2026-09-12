import React, { useState } from 'react';
import {
  ResearchEventResult,
  ResearchStateStatus,
  SourceType,
  VerifiedField,
  Opportunity,
} from '../types';
import {
  Globe,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  FileText,
  Brain,
  ShieldCheck,
  Calendar,
  Clock,
  Building,
  Plus,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
} from 'lucide-react';

interface GroundedResearchCardProps {
  research: ResearchEventResult;
  onAddToTracker?: (oppData: Partial<Opportunity>) => void;
  isAlreadyTracked?: boolean;
}

export const GroundedResearchCard: React.FC<GroundedResearchCardProps> = ({
  research,
  onAddToTracker,
  isAlreadyTracked = false,
}) => {
  const [showSources, setShowSources] = useState(false);
  const [showQuotes, setShowQuotes] = useState(false);
  const [added, setAdded] = useState(false);

  const getSourceTypeLabel = (st: SourceType): string => {
    switch (st) {
      case 'official_event_website':
        return 'Official Event Website';
      case 'official_registration_page':
        return 'Official Registration Portal';
      case 'official_rules_documentation':
        return 'Official Rules / Documentation';
      case 'official_organization_announcement':
        return 'Official Announcement';
      case 'trusted_secondary_source':
        return 'Trusted Secondary Source';
      case 'user_input':
        return 'User-Provided';
      default:
        return 'Web Source';
    }
  };

  const getSourceTypeColor = (st: SourceType): string => {
    switch (st) {
      case 'official_event_website':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      case 'official_registration_page':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800';
      case 'official_rules_documentation':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
      case 'official_organization_announcement':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'trusted_secondary_source':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      default:
        return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
    }
  };

  const handleAdd = () => {
    if (!onAddToTracker || added) return;
    const opp: Partial<Opportunity> = {
      name: research.eventName.value,
      websiteUrl: research.officialWebsite.value || research.sourcesDiscovered[0]?.url || '',
      registrationUrl: research.registrationUrl.value || '',
      category: research.category.value,
      organization: research.organization.value,
      deadline: research.deadline.value || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      eventDate: research.eventDate.value || undefined,
      notes: research.description.value,
      tags: research.suggestedTags,
      tasks: research.suggestedTasks.map((t, idx) => ({
        id: `task_${Date.now()}_${idx}`,
        name: t.name,
        priority: t.priority as any,
        completed: false,
      })),
      status: research.registrationStatus.value === 'Open' ? 'Planning to register' : 'Interested',
      verifiedFields: {
        deadline: research.deadline,
        registrationStatus: research.registrationStatus,
        eventDate: research.eventDate,
        websiteUrl: research.officialWebsite,
        registrationUrl: research.registrationUrl,
        organization: research.organization,
      },
      sources: research.sourcesDiscovered,
      lastResearchTimestamp: research.retrievalTimestamp,
      researchState: research.overallState,
      provenance: {
        origin: 'verified',
        sourceUrl: research.officialWebsite.value,
        sourceType: research.officialWebsite.sourceType,
        verificationStatus: research.deadline.verificationStatus,
        confidence: research.deadline.confidence,
        extractedAt: research.retrievalTimestamp,
      },
    };
    onAddToTracker(opp);
    setAdded(true);
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden my-3 transition-all">
      {/* 1. Header & Research State Stepper */}
      <div className="border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
              Grounded Web Research
            </span>
          </div>

          {/* Research State Badge */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {research.overallState === 'verified' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                ✓ Verified Source
              </span>
            )}
            {research.overallState === 'needs_confirmation' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                ⚠ Needs Confirmation
              </span>
            )}
            {research.overallState === 'unable_to_verify' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/60 px-2.5 py-0.5 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                <XCircle className="h-3.5 w-3.5" />
                ✕ Unable to Verify
              </span>
            )}
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {new Date(research.retrievalTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Multi-step progress pipeline indicator */}
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center gap-1 rounded bg-zinc-200/70 dark:bg-zinc-800 px-2 py-1">
            <Search className="h-3 w-3 text-indigo-500" />
            <span className="truncate">🔎 Discovered</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-zinc-200/70 dark:bg-zinc-800 px-2 py-1">
            <FileText className="h-3 w-3 text-indigo-500" />
            <span className="truncate">📄 {research.sourcesRetrievedCount || research.sourcesDiscovered.length} Sources</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-zinc-200/70 dark:bg-zinc-800 px-2 py-1">
            <Brain className="h-3 w-3 text-indigo-500" />
            <span className="truncate">🧠 Analyzed</span>
          </div>
          <div className={`flex items-center gap-1 rounded px-2 py-1 font-medium ${
            research.overallState === 'verified'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              : research.overallState === 'needs_confirmation'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
          }`}>
            {research.overallState === 'verified' ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">✓ Verified</span>
              </>
            ) : research.overallState === 'needs_confirmation' ? (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span className="truncate">⚠ Partial</span>
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                <span className="truncate">✕ Unverified</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Verified Content & Cards */}
      <div className="p-4 space-y-3.5">
        {/* Event Title and Organization */}
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
              {research.eventName.value}
            </h4>
            <span className="inline-block px-2 py-0.5 text-[11px] font-medium rounded capitalize bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {research.category.value}
            </span>
          </div>
          {research.organization.value && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
              <Building className="h-3 w-3" />
              {research.organization.value}
            </p>
          )}
        </div>

        {/* Warning if unverified or conflict */}
        {research.unverifiedWarning && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Verification Notice</p>
              <p className="mt-0.5 text-[11px] opacity-90">{research.unverifiedWarning}</p>
            </div>
          </div>
        )}

        {/* Crucial Fields Verification Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          {/* Deadline Field */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-2.5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
              <span className="flex items-center gap-1 font-medium">
                <Clock className="h-3.5 w-3.5 text-red-500" />
                Registration Deadline
              </span>
              {research.deadline.verificationStatus === 'verified' && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Verified
                </span>
              )}
            </div>
            {research.deadline.verificationStatus === 'verified' && research.deadline.value ? (
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {research.deadline.value}
                </p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  from {getSourceTypeLabel(research.deadline.sourceType)}
                </p>
              </div>
            ) : research.deadline.verificationStatus === 'conflict' ? (
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  ⚠ Conflicting dates detected
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Check sources below for details
                </p>
              </div>
            ) : (
              <div className="text-amber-700 dark:text-amber-400 font-medium text-xs flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                ⚠ Deadline could not be verified
              </div>
            )}
          </div>

          {/* Registration Status */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-2.5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
              <span className="flex items-center gap-1 font-medium">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                Registration Status
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded ${
                research.registrationStatus.value === 'Open'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : research.registrationStatus.value === 'Closed'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
              }`}>
                {research.registrationStatus.value}
              </span>
              {research.registrationStatus.verificationStatus === 'verified' && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Verified live
                </span>
              )}
            </div>
            {research.eventDate.value && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                Event Dates: <span className="font-medium text-zinc-700 dark:text-zinc-200">{research.eventDate.value}</span>
              </p>
            )}
          </div>
        </div>

        {/* Conflicts Breakdown if sources disagree */}
        {research.deadline.conflicts && research.deadline.conflicts.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Source Disagreement Found:
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2 rounded border border-amber-200/70 dark:border-amber-800/70">
                <div>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{research.deadline.value}</span>
                  <span className="text-[11px] text-zinc-500 ml-2">({getSourceTypeLabel(research.deadline.sourceType)})</span>
                </div>
                <a href={research.deadline.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 text-[11px]">
                  View <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {research.deadline.conflicts.map((conf, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2 rounded border border-amber-200/70 dark:border-amber-800/70">
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{conf.value}</span>
                    <span className="text-[11px] text-zinc-500 ml-2">({getSourceTypeLabel(conf.sourceType)})</span>
                  </div>
                  <a href={conf.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 text-[11px]">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Provenance and Authoritative Source Links */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {research.officialWebsite.value && (
              <a
                href={research.officialWebsite.value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-indigo-600 dark:text-indigo-400 font-medium transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
                Official Website
                <ExternalLink className="h-3 w-3 ml-0.5 opacity-70" />
              </a>
            )}
            {research.registrationUrl.value && (
              <a
                href={research.registrationUrl.value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200 dark:border-indigo-800 transition-colors"
              >
                Apply / Register
                <ExternalLink className="h-3 w-3 ml-0.5 opacity-70" />
              </a>
            )}
          </div>

          {/* Toggle View Sources & Verification Evidence */}
          <button
            onClick={() => setShowSources(!showSources)}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 font-medium transition-colors"
          >
            <Layers className="h-3.5 w-3.5" />
            {research.sourcesDiscovered.length} Sources
            {showSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Expandable Sources Details */}
        {showSources && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-3 space-y-2 text-xs">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300 text-[11px] uppercase tracking-wider">
              Authoritative Web Sources Examined
            </p>
            <div className="space-y-1.5">
              {research.sourcesDiscovered.map((src, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 p-2 rounded bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${getSourceTypeColor(src.sourceType)}`}>
                        {getSourceTypeLabel(src.sourceType)}
                      </span>
                      {src.isOfficial && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          ★ Official
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate mt-1">
                      {src.title}
                    </p>
                    {src.snippet && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                        "{src.snippet}"
                      </p>
                    )}
                  </div>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-zinc-400 hover:text-indigo-600 shrink-0"
                    title="Open Source"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>

            {/* Evidence Snippet toggle */}
            {research.deadline.quoteSnippet && (
              <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700/60">
                <button
                  onClick={() => setShowQuotes(!showQuotes)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 flex items-center gap-1"
                >
                  <Info className="h-3 w-3" />
                  {showQuotes ? 'Hide' : 'Show'} Extracted Evidence Quote
                </button>
                {showQuotes && (
                  <blockquote className="mt-1.5 p-2 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 border-l-2 border-indigo-500">
                    "{research.deadline.quoteSnippet}"
                  </blockquote>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. Action Section: Add to Tracker */}
        {onAddToTracker && (
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
            <button
              onClick={handleAdd}
              disabled={added || isAlreadyTracked}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors ${
                added || isAlreadyTracked
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-default'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500'
              }`}
            >
              {added || isAlreadyTracked ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  In Tracker
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Add to Tracker
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
