import React, { useState } from 'react';
import {
  Opportunity,
  OpportunityCategory,
  OpportunityStatus,
  TaskItem,
  ResearchEventResult,
} from '../types';
import { api } from '../services/api';
import {
  X,
  Sparkles,
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  Calendar,
  Tag,
  AlertCircle,
  Search,
  FileText,
  Brain,
  ShieldCheck,
  Link2,
} from 'lucide-react';
import { GroundedResearchCard } from './GroundedResearchCard';
import { FieldVerificationBadge } from './FieldVerificationBadge';

interface AddOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (opp: Opportunity) => void;
  initialUrl?: string;
}

const CATEGORIES: OpportunityCategory[] = [
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

const STATUSES: OpportunityStatus[] = [
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

export const AddOpportunityModal: React.FC<AddOpportunityModalProps> = ({
  isOpen,
  onClose,
  onAdded,
  initialUrl,
}) => {
  const [activeMode, setActiveMode] = useState<'smart_extract' | 'manual'>('smart_extract');
  const [extractUrl, setExtractUrl] = useState(initialUrl || '');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractNotice, setExtractNotice] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState(initialUrl || '');
  const [additionalSources, setAdditionalSources] = useState<string[]>([]);

  React.useEffect(() => {
    if (initialUrl) {
      setExtractUrl(initialUrl);
      setWebsiteUrl(initialUrl);
    }
  }, [initialUrl]);
  const [registrationUrl, setRegistrationUrl] = useState('');
  const [category, setCategory] = useState<OpportunityCategory>('hackathon');
  const [organization, setOrganization] = useState('');
  const [deadline, setDeadline] = useState('2026-09-30T23:59');
  const [eventStartDate, setEventStartDate] = useState('2026-10-15T09:00');
  const [status, setStatus] = useState<OpportunityStatus>('Interested');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('ai, security');
  const [tasks, setTasks] = useState<
    Array<{ id: string; name: string; priority: 'low' | 'medium' | 'high' }>
  >([
    { id: '1', name: 'Review guidelines and rules', priority: 'medium' },
    { id: '2', name: 'Submit registration form', priority: 'high' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAiExtracted, setHasAiExtracted] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchEventResult | null>(null);

  if (!isOpen) return null;

  // Handle Smart URL Extraction with Grounded Research
  const handleExtract = async () => {
    if (!extractUrl.trim()) return;
    setIsExtracting(true);
    setExtractNotice(null);
    setResearchResult(null);

    try {
      const res = await api.extractFromUrl(extractUrl.trim());
      const ext = res.extracted;

      setName(ext.name || name || 'Extracted Opportunity');
      setWebsiteUrl(extractUrl.trim());
      if (ext.registrationUrl) setRegistrationUrl(ext.registrationUrl);
      if (ext.organization) setOrganization(ext.organization);
      if (ext.category && CATEGORIES.includes(ext.category as any)) {
        setCategory(ext.category as OpportunityCategory);
      }
      if (ext.deadline) setDeadline(ext.deadline);
      if (ext.eventStartDate) setEventStartDate(ext.eventStartDate);
      if (ext.summary) setNotes(ext.summary);
      if (Array.isArray(ext.additionalSources) && ext.additionalSources.length > 0) {
        setAdditionalSources(ext.additionalSources.slice(0, 5));
      }
      if (ext.tags && ext.tags.length > 0) {
        setTagsInput(ext.tags.join(', '));
      }
      if (ext.tasks && ext.tasks.length > 0) {
        setTasks(
          ext.tasks.map((t, i) => ({
            id: String(Date.now() + i),
            name: t.name,
            priority: t.priority || 'medium',
          }))
        );
      }

      if (res.researchResult) {
        setResearchResult(res.researchResult);
      }

      setHasAiExtracted(true);
      setExtractNotice(
        res.verifiedFetch
          ? 'Live website inspected & grounded: Information verified against official page.'
          : 'Heuristic data populated. Please verify the dates below.'
      );
    } catch (err: any) {
      setExtractNotice(`Could not fetch website automatically: ${err.message || 'Check URL'}. You can still fill in the details manually below.`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Quick preset tasks
  const addPresetPack = (type: 'hackathon' | 'ctf' | 'internship' | 'conference') => {
    if (type === 'hackathon') {
      setTasks([
        { id: 'h1', name: 'Form team & decide on project domain', priority: 'high' },
        { id: 'h2', name: 'Register on portal & verify team roster', priority: 'high' },
        { id: 'h3', name: 'Brainstorm architecture & tech stack', priority: 'medium' },
        { id: 'h4', name: 'Prepare project pitch deck & GitHub repo', priority: 'medium' },
      ]);
    } else if (type === 'ctf') {
      setTasks([
        { id: 'c1', name: 'Register team & exchange Discord invites', priority: 'high' },
        { id: 'c2', name: 'Test reversing & pwn toolkits (Ghidra, pwntools)', priority: 'medium' },
        { id: 'c3', name: 'Organize category roles (crypto, web, foren)', priority: 'medium' },
        { id: 'c4', name: 'Set up private shared notes workspace', priority: 'low' },
      ]);
    } else if (type === 'internship') {
      setTasks([
        { id: 'i1', name: 'Tailor resume for role requirements', priority: 'high' },
        { id: 'i2', name: 'Complete online application form', priority: 'high' },
        { id: 'i3', name: 'Practice LeetCode / technical screening questions', priority: 'high' },
        { id: 'i4', name: 'Request referral from contacts', priority: 'medium' },
      ]);
    } else if (type === 'conference') {
      setTasks([
        { id: 'cf1', name: 'Draft CFP abstract and outline', priority: 'high' },
        { id: 'cf2', name: 'Submit presentation before deadline', priority: 'high' },
        { id: 'cf3', name: 'Apply for student travel grant', priority: 'medium' },
        { id: 'cf4', name: 'Book travel and lodging', priority: 'low' },
      ]);
    }
  };

  const handleAddTask = () => {
    setTasks((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', priority: 'medium' },
    ]);
  };

  const handleRemoveTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleTaskChange = (id: string, field: 'name' | 'priority', val: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: val } : t))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);

    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const formattedTasks: TaskItem[] = tasks
        .filter((t) => t.name.trim())
        .map((t) => ({
          id: t.id || String(Date.now()),
          name: t.name.trim(),
          completed: false,
          priority: t.priority,
        }));

      const newOpp = await api.createOpportunity({
        name: name.trim(),
        websiteUrl: websiteUrl.trim(),
        additionalSources: additionalSources.map((s) => s.trim()).filter(Boolean).slice(0, 5),
        registrationUrl: registrationUrl.trim(),
        category,
        organization: organization.trim() || 'Independent',
        deadline: deadline ? new Date(deadline).toISOString() : new Date().toISOString(),
        eventStartDate: eventStartDate ? new Date(eventStartDate).toISOString() : undefined,
        status,
        notes: notes.trim(),
        tags: parsedTags,
        tasks: formattedTasks,
        verifiedFields: researchResult ? {
          deadline: researchResult.deadline,
          registrationStatus: researchResult.registrationStatus,
          eventDate: researchResult.eventDate,
          websiteUrl: researchResult.officialWebsite,
          registrationUrl: researchResult.registrationUrl,
          organization: researchResult.organization,
        } : undefined,
        sources: researchResult?.sourcesDiscovered,
        researchState: researchResult?.overallState,
        provenance: researchResult ? {
          origin: 'verified',
          sourceUrl: researchResult.officialWebsite.value || extractUrl,
          sourceType: researchResult.deadline.sourceType,
          verificationStatus: researchResult.deadline.verificationStatus,
          confidence: researchResult.deadline.confidence,
          extractedAt: researchResult.retrievalTimestamp,
        } : {
          origin: 'manual',
          verificationStatus: 'unverified',
          confidence: 'high',
        },
      });

      onAdded(newOpp);
      onClose();
    } catch (err: any) {
      alert(`Error creating opportunity: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div
        id="add-opportunity-modal"
        className="relative w-full max-w-2xl rounded-2xl border border-[#1e293b] bg-[#0c101a] shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1a2333] px-6 py-4 bg-[#0e1422]">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-cyan-500/20 p-2 text-cyan-400 border border-cyan-500/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Add New Opportunity</h2>
              <p className="text-xs text-slate-400">
                Track hackathons, CTFs, workshops, internships, and grants.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#162033] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Smart Extract Strip */}
        <div className="p-6 border-b border-[#1a2333] bg-[#090d16]">
          <label className="block text-xs font-semibold text-cyan-300 mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Smart URL Extractor (Auto-inspect page)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="url"
                placeholder="Paste event website URL (e.g. https://ethglobal.com or https://devpost.com/...)"
                value={extractUrl}
                onChange={(e) => setExtractUrl(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleExtract}
              disabled={isExtracting || !extractUrl.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50 transition-colors shrink-0"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Researching...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto-Fill</span>
                </>
              )}
            </button>
          </div>

          {/* Research Progress Pipeline */}
          {isExtracting && (
            <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Running Source-Grounded Research Pipeline</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-[11px] text-slate-300">
                <div className="flex items-center gap-1 rounded bg-[#101524] px-2 py-1 border border-cyan-500/30">
                  <Search className="h-3 w-3 text-cyan-400 animate-spin" />
                  <span>🔎 Searching</span>
                </div>
                <div className="flex items-center gap-1 rounded bg-[#101524] px-2 py-1">
                  <FileText className="h-3 w-3 text-cyan-400" />
                  <span>📄 Sources</span>
                </div>
                <div className="flex items-center gap-1 rounded bg-[#101524] px-2 py-1">
                  <Brain className="h-3 w-3 text-violet-400" />
                  <span>🧠 Analyzing</span>
                </div>
                <div className="flex items-center gap-1 rounded bg-[#101524] px-2 py-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  <span>✓ Verifying</span>
                </div>
              </div>
            </div>
          )}

          {extractNotice && !isExtracting && (
            <div className="mt-2.5 rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-2.5 text-xs text-cyan-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
              <span>{extractNotice}</span>
            </div>
          )}

          {/* Render Grounded Research Card if research result was retrieved */}
          {researchResult && (
            <div className="mt-3">
              <GroundedResearchCard research={researchResult} isAlreadyTracked={false} />
            </div>
          )}
        </div>

        {/* Opportunity Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Name & Organization */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                Opportunity Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. DEF CON CTF Qualifier 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                Organization / Host *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Order of the Overflow / Google"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* URLs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                Official Website URL
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                Registration / Portal URL (Optional)
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={registrationUrl}
                onChange={(e) => setRegistrationUrl(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Multi-source Monitoring URLs */}
          <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Additional Monitored Sources ({additionalSources.length}/5)</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Secondary pages to track for updates & announcements (e.g. Devpost, CTFtime, Twitter/X, Luma).
                </p>
              </div>

              {additionalSources.length < 5 && (
                <button
                  type="button"
                  onClick={() => setAdditionalSources((prev) => [...prev, ''])}
                  className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-900/40 hover:border-cyan-400 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Add Source</span>
                </button>
              )}
            </div>

            {additionalSources.length > 0 && (
              <div className="space-y-2 pt-1">
                {additionalSources.map((src, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={src}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAdditionalSources((prev) => {
                            const updated = [...prev];
                            updated[idx] = val;
                            return updated;
                          });
                        }}
                        className="w-full rounded-lg border border-[#1e293b] bg-[#121826] pl-8 pr-3 py-1.5 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setAdditionalSources((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors shrink-0"
                      title="Remove source"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as OpportunityCategory)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                My Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OpportunityStatus)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Deadlines & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                Registration Deadline *
              </label>
              <input
                type="datetime-local"
                required
                value={deadline.slice(0, 16)}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                Event Start Date (Optional)
              </label>
              <input
                type="datetime-local"
                value={eventStartDate ? eventStartDate.slice(0, 16) : ''}
                onChange={(e) => setEventStartDate(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-slate-300 font-medium mb-1">
              Tags (Comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g. security, ctf, binary-exploitation, pwn"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-300 font-medium mb-1">
              Notes & Information
            </label>
            <textarea
              rows={3}
              placeholder="Eligibility criteria, submission tracks, prizes, travel stipends, team member requirements..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none resize-none"
            />
          </div>

          {/* Tasks Checklist & Preset Packs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-300 font-medium">
                Important Tasks / Checklist ({tasks.length})
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-500">Preset Packs:</span>
                <button
                  type="button"
                  onClick={() => addPresetPack('hackathon')}
                  className="rounded bg-[#162033] px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-[#1e2d47]"
                >
                  Hackathon
                </button>
                <button
                  type="button"
                  onClick={() => addPresetPack('ctf')}
                  className="rounded bg-[#162033] px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-[#1e2d47]"
                >
                  CTF
                </button>
                <button
                  type="button"
                  onClick={() => addPresetPack('internship')}
                  className="rounded bg-[#162033] px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-[#1e2d47]"
                >
                  Internship
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Task description..."
                    value={task.name}
                    onChange={(e) => handleTaskChange(task.id, 'name', e.target.value)}
                    className="flex-1 rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                  <select
                    value={task.priority}
                    onChange={(e) => handleTaskChange(task.id, 'priority', e.target.value)}
                    className="rounded-lg border border-[#1e293b] bg-[#121826] px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveTask(task.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddTask}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium mt-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Task</span>
              </button>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1a2333]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Opportunity</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
