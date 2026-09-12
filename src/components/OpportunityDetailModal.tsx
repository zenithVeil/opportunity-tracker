import React, { useState } from 'react';
import {
  Opportunity,
  OpportunityStatus,
  OpportunityCategory,
  TaskItem,
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
  X,
  Globe,
  ExternalLink,
  Calendar,
  Clock,
  CheckCircle2,
  Square,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Radio,
  FileText,
  ShieldCheck,
  Tag,
  Save,
  Check,
  Search,
} from 'lucide-react';
import { FieldVerificationBadge } from './FieldVerificationBadge';

interface OpportunityDetailModalProps {
  opportunity: Opportunity | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Opportunity>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCheckWebsite: (id: string) => Promise<void>;
  isChecking: boolean;
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

export const OpportunityDetailModal: React.FC<OpportunityDetailModalProps> = ({
  opportunity,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onCheckWebsite,
  isChecking,
}) => {
  if (!isOpen || !opportunity) return null;

  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'tracking' | 'notes'>('overview');
  const [status, setStatus] = useState<OpportunityStatus>(opportunity.status);
  const [name, setName] = useState(opportunity.name);
  const [organization, setOrganization] = useState(opportunity.organization);
  const [category, setCategory] = useState<OpportunityCategory>(opportunity.category);
  const [websiteUrl, setWebsiteUrl] = useState(opportunity.websiteUrl || '');
  const [registrationUrl, setRegistrationUrl] = useState(opportunity.registrationUrl || '');
  const [deadline, setDeadline] = useState(opportunity.deadline);
  const [eventStartDate, setEventStartDate] = useState(opportunity.eventStartDate || '');
  const [notes, setNotes] = useState(opportunity.notes || '');
  const [tasks, setTasks] = useState<TaskItem[]>(opportunity.tasks || []);
  const [tags, setTags] = useState<string[]>(opportunity.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New task input state
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');

  const urgency = getUrgencyLevel(opportunity.deadline);
  const urgencyConfig = getUrgencyBadgeConfig(urgency);
  const statusConfig = getStatusBadgeConfig(status);
  const catConfig = getCategoryConfig(category);
  const countdown = formatCountdown(opportunity.deadline);

  const completedTasks = tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Toggle task
  const handleToggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  };

  // Add task
  const handleAddTask = () => {
    if (!newTaskName.trim()) return;
    const newTask: TaskItem = {
      id: String(Date.now()),
      name: newTaskName.trim(),
      completed: false,
      priority: newTaskPriority,
    };
    setTasks((prev) => [...prev, newTask]);
    setNewTaskName('');
  };

  // Delete task
  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  // Add tag
  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const clean = tagInput.trim().toLowerCase();
    if (!tags.includes(clean)) {
      setTags((prev) => [...prev, clean]);
    }
    setTagInput('');
  };

  // Remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  // Save all edits
  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdate(opportunity.id, {
        name,
        organization,
        category,
        status,
        websiteUrl: websiteUrl.trim(),
        registrationUrl: registrationUrl.trim(),
        deadline: deadline ? new Date(deadline).toISOString() : opportunity.deadline,
        eventStartDate: eventStartDate ? new Date(eventStartDate).toISOString() : undefined,
        notes,
        tasks,
        tags,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert('Failed to update opportunity');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete opportunity
  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete "${opportunity.name}" from your tracker?`)) {
      await onDelete(opportunity.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div
        id="opportunity-detail-modal"
        className="relative w-full max-w-3xl rounded-2xl border border-[#1e293b] bg-[#0c101a] shadow-2xl overflow-hidden my-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#1a2333] px-6 py-4 bg-[#0e1422]">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase border ${catConfig.colorClass}`}>
                {catConfig.label}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {opportunity.organization}
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OpportunityStatus)}
                className={`rounded px-2.5 py-0.5 text-xs font-semibold border focus:outline-none cursor-pointer ${statusConfig.badgeClass}`}
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-[#0c101a] text-slate-200">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {opportunity.name}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#162033] hover:text-white transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Provenance & Verification Strip */}
        <div className="px-6 py-2.5 bg-[#090d16] border-b border-[#162033] flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
              <span>Data Origin:</span>
              <span className="text-slate-200 font-medium capitalize">
                {opportunity.provenance?.origin || 'manual'}
              </span>
            </div>

            {opportunity.provenance?.verifiedByCheck ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded">
                <Check className="h-3 w-3" /> Live Verified
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded">
                Unverified by check
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {opportunity.websiteUrl && (
              <a
                href={opportunity.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-cyan-400 hover:underline text-xs"
              >
                <span>Visit Site</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {opportunity.registrationUrl && (
              <a
                href={opportunity.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-emerald-400 hover:underline text-xs"
              >
                <span>Registration Portal</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-[#1a2333] px-6 bg-[#0c101a] text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-cyan-500 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Overview & Fields
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`py-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'tasks'
                ? 'border-cyan-500 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <span>Checklist & Tasks</span>
            <span className="rounded bg-[#162033] px-1.5 py-0.2 text-[10px] font-mono text-cyan-400">
              {completedTasks}/{totalTasks}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('tracking')}
            className={`py-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'tracking'
                ? 'border-cyan-500 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <span>Website Monitor</span>
            {opportunity.tracking.status === 'changed' && (
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'notes'
                ? 'border-cyan-500 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Notes & Info
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
          {/* TAB 1: OVERVIEW & FIELDS */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Countdown callout card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-[#1e293b] bg-[#101627] p-4 text-xs">
                <div>
                  <div className="text-slate-400">Registration Deadline</div>
                  <div className="font-mono text-sm font-bold text-white mt-0.5">
                    {formatDate(deadline)}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400">Urgency Status</div>
                  <div className="mt-0.5">
                    <span className={`inline-block font-semibold px-2 py-0.5 rounded ${urgencyConfig.badgeClass}`}>
                      {urgencyConfig.label} ({countdown})
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-slate-400">Event Start Date</div>
                  <div className="font-mono text-sm font-bold text-cyan-300 mt-0.5">
                    {eventStartDate ? formatDate(eventStartDate) : 'Not specified'}
                  </div>
                </div>
              </div>

              {/* Editable form fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Opportunity Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Organization</label>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as OpportunityCategory)}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                  >
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-medium">Registration Deadline</label>
                    <FieldVerificationBadge
                      field={opportunity.verifiedFields?.deadline}
                      fallbackOrigin={opportunity.provenance?.origin}
                    />
                  </div>
                  <input
                    type="datetime-local"
                    value={deadline.slice(0, 16)}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-medium">Website URL</label>
                    <FieldVerificationBadge
                      field={opportunity.verifiedFields?.websiteUrl}
                      fallbackOrigin={opportunity.provenance?.origin}
                    />
                  </div>
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-medium">Registration URL</label>
                    <FieldVerificationBadge
                      field={opportunity.verifiedFields?.registrationUrl}
                      fallbackOrigin={opportunity.provenance?.origin}
                    />
                  </div>
                  <input
                    type="url"
                    value={registrationUrl}
                    onChange={(e) => setRegistrationUrl(e.target.value)}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              {/* Source Disagreement / Conflict Warning */}
              {opportunity.verifiedFields?.deadline?.conflicts &&
                opportunity.verifiedFields.deadline.conflicts.length > 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 text-xs text-amber-200">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-300 mb-1">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>Conflicting Deadlines Detected Across Web Sources</span>
                    </div>
                    <p className="text-[11px] text-amber-200/80 mb-2">
                      Multiple sources report disagreeing dates for this event. Both dates are recorded below so you don't miss the earliest cutoff:
                    </p>
                    <div className="space-y-1 text-[11px] font-mono bg-[#0c101a] p-2.5 rounded-lg border border-amber-500/20">
                      <div>
                        • Primary recorded: <span className="text-amber-300 font-bold">{opportunity.deadline}</span>
                        {opportunity.verifiedFields.deadline.sourceUrl && (
                          <span className="text-slate-400"> (from {opportunity.verifiedFields.deadline.sourceUrl})</span>
                        )}
                      </div>
                      {opportunity.verifiedFields.deadline.conflicts.map((c, i) => (
                        <div key={i}>
                          • Discrepancy: <span className="text-amber-400 font-bold">{c.value}</span>{' '}
                          <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline text-cyan-400">
                            ({c.sourceUrl})
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Source Provenance & Research Trace Card */}
              <div className="rounded-xl border border-[#1e293b] bg-[#0d121e] p-3.5 text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span className="font-semibold text-white">Source Verification & Provenance</span>
                  </div>
                  {opportunity.lastResearchTimestamp && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      Verified {new Date(opportunity.lastResearchTimestamp).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#121826] p-2.5 rounded-lg border border-[#1e293b]">
                    <span className="text-slate-400 block mb-0.5">Primary Source Type</span>
                    <span className="text-white font-medium capitalize">
                      {opportunity.verifiedFields?.deadline?.sourceType?.replace(/_/g, ' ') ||
                        opportunity.provenance?.sourceType?.replace(/_/g, ' ') ||
                        'User Entered'}
                    </span>
                  </div>
                  <div className="bg-[#121826] p-2.5 rounded-lg border border-[#1e293b]">
                    <span className="text-slate-400 block mb-0.5">Verification Status</span>
                    <span className="text-emerald-400 font-medium">
                      {opportunity.verifiedFields?.deadline?.verificationStatus === 'verified'
                        ? '✓ Verified against official source'
                        : opportunity.provenance?.verificationStatus === 'verified'
                        ? '✓ Verified'
                        : '⚠ Unverified / User Provided'}
                    </span>
                  </div>
                </div>

                {opportunity.sources && opportunity.sources.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      Authoritative Sources Discovered ({opportunity.sources.length}):
                    </span>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {opportunity.sources.map((src, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-[11px] bg-[#121826] px-2.5 py-1.5 rounded border border-[#1e293b]"
                        >
                          <span className="text-slate-300 truncate max-w-[260px] font-medium">
                            {src.title || src.url}
                          </span>
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:underline flex items-center gap-1 text-[10px] shrink-0"
                          >
                            <span>Open</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tags Editor */}
              <div>
                <label className="block text-slate-300 font-medium text-xs mb-1">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded bg-[#162033] px-2 py-0.5 text-xs font-mono text-cyan-300 border border-[#1e293b]"
                    >
                      #{tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a new tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="flex-1 rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="rounded-lg bg-[#162238] px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                  >
                    Add Tag
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CHECKLIST & TASKS */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#1e293b] bg-[#101627] p-3">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span>Task Completion</span>
                  <span className="font-mono text-cyan-400">{completedTasks} of {totalTasks} ({progressPercent}%)</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#1a2333] overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 rounded-full transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Add task bar */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New task description..."
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTask();
                    }
                  }}
                  className="flex-1 rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                />
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as any)}
                  className="rounded-lg border border-[#1e293b] bg-[#121826] px-2.5 py-2 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddTask}
                  className="flex items-center gap-1 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-black hover:bg-cyan-400"
                >
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Add</span>
                </button>
              </div>

              {/* Tasks List */}
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                      task.completed
                        ? 'border-[#1a2333] bg-[#0c101a]/60 opacity-60'
                        : 'border-[#1e293b] bg-[#121826]'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTask(task.id)}
                        className="text-slate-400 hover:text-cyan-400"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <Square className="h-5 w-5 hover:text-cyan-300" />
                        )}
                      </button>

                      <span
                        className={`text-xs font-medium ${
                          task.completed ? 'line-through text-slate-500' : 'text-slate-200'
                        }`}
                      >
                        {task.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          task.priority === 'high'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : task.priority === 'medium'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {task.priority}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: WEBSITE MONITORING */}
          {activeTab === 'tracking' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#1e293b] bg-[#101627] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-cyan-400" />
                    <span className="text-sm font-bold text-white">Live Website Monitor</span>
                  </div>

                  {opportunity.websiteUrl && (
                    <button
                      onClick={() => onCheckWebsite(opportunity.id)}
                      disabled={isChecking}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                      <span>{isChecking ? 'Checking...' : 'Check Website Now'}</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-[#1a2333]">
                  <div>
                    <span className="text-slate-400">Current Monitoring State:</span>
                    <div className="font-semibold text-white mt-0.5 capitalize flex items-center gap-2">
                      {opportunity.tracking.status === 'changed' ? (
                        <span className="text-amber-400 flex items-center gap-1">
                          <Radio className="h-3 w-3" /> Changes Detected
                        </span>
                      ) : opportunity.tracking.status === 'healthy' ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Healthy & Synced
                        </span>
                      ) : opportunity.tracking.status === 'error' ? (
                        <span className="text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Check Failed
                        </span>
                      ) : (
                        <span className="text-slate-400">Not monitored yet</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400">Last Verified Check:</span>
                    <div className="font-mono text-slate-200 mt-0.5">
                      {opportunity.tracking.lastChecked
                        ? formatRelativeTime(opportunity.tracking.lastChecked)
                        : 'Never'}
                    </div>
                  </div>
                </div>

                {opportunity.tracking.errorMessage && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-2.5 text-xs text-rose-300">
                    <span className="font-bold">Error:</span> {opportunity.tracking.errorMessage}
                  </div>
                )}
              </div>

              {/* Change diff / Snapshot summary */}
              {opportunity.tracking.changeSummary && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <Radio className="h-4 w-4" />
                    <span>Website Change Diff Detected by Server</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {opportunity.tracking.changeSummary}
                  </p>
                  {opportunity.tracking.lastChangeDetectedAt && (
                    <div className="text-[11px] text-slate-400 font-mono">
                      Detected: {formatDate(opportunity.tracking.lastChangeDetectedAt)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: NOTES & INFORMATION */}
          {activeTab === 'notes' && (
            <div className="space-y-3">
              <label className="block text-xs text-slate-300 font-medium">
                Personal Notes, Rules, & Requirements
              </label>
              <textarea
                rows={8}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write markdown or plain notes on judging criteria, prize pools, submission format, travel allowances, or team notes..."
                className="w-full rounded-xl border border-[#1e293b] bg-[#121826] p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none font-mono"
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#1a2333] px-6 py-4 bg-[#0e1422]">
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Opportunity</span>
          </button>

          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium animate-in fade-in">
                <Check className="h-3.5 w-3.5" /> Saved changes!
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
