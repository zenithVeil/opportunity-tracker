import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Zap,
  Link as LinkIcon,
  CheckSquare,
  FileText,
  Mic,
  ArrowRight,
  Loader2,
  Sparkles,
  Check,
  AlertCircle,
  Square,
} from 'lucide-react';
import { Opportunity, QuickCaptureClassification } from '../types';
import { api } from '../services/api';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  opportunities: Opportunity[];
  onOpportunityCreated: (opp: Opportunity) => void;
  onOpportunityUpdated: (opp: Opportunity) => void;
  onOpenFullAddModal: (prefillUrl?: string) => void;
}

type CaptureTab = 'universal' | 'url' | 'voice';

export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({
  isOpen,
  onClose,
  opportunities,
  onOpportunityCreated,
  onOpportunityUpdated,
  onOpenFullAddModal,
}) => {
  const [activeTab, setActiveTab] = useState<CaptureTab>('universal');
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Classification result
  const [classification, setClassification] = useState<QuickCaptureClassification | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      setTextInput('');
      setClassification(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      if (isRecording) {
        stopVoiceRecording();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Classify universal input
  const handleUniversalCapture = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || isProcessing) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessing(true);

    const isUrl = /^https?:\/\//i.test(textInput.trim());

    if (isUrl) {
      // Direct link extraction
      try {
        const res = await api.extractFromUrl(textInput.trim());
        const extracted = res.extracted;
        const taskList = (extracted.suggestedTasks || extracted.tasks || []) as any[];
        const newOpp: Partial<Opportunity> = {
          name: extracted.name || 'Extracted Opportunity',
          websiteUrl: textInput.trim(),
          category: (extracted.category as any) || 'hackathon',
          organization: extracted.organization || 'Independent',
          deadline: extracted.deadline || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          eventDate: extracted.eventDate,
          status: 'Interested',
          notes: extracted.description || extracted.summary || '',
          tags: extracted.suggestedTags || extracted.tags || [],
          tasks: taskList.map((t: any, idx: number) => ({
            id: `task_init_${idx}`,
            name: typeof t === 'string' ? t : t?.name || 'Complete registration item',
            completed: false,
            priority: (typeof t === 'object' && t?.priority) || 'medium',
          })),
        };
        const created = await api.createOpportunity(newOpp);
        onOpportunityCreated(created);
        setSuccessMessage(`Created opportunity "${created.name}" from URL!`);
        setTimeout(() => onClose(), 1200);
      } catch (err: any) {
        // Offer to open full form
        setErrorMessage(`Could not auto-extract from URL: ${err.message}. Opening manual form...`);
        setTimeout(() => {
          onClose();
          onOpenFullAddModal(textInput.trim());
        }, 1500);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    try {
      const result = await api.classifyQuickCapture(textInput.trim());
      setClassification(result);
    } catch (err: any) {
      setErrorMessage(`Capture failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Apply classified result
  const handleApplyClassified = async () => {
    if (!classification) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      if (classification.type === 'new_opportunity' && classification.suggestedOpportunity) {
        const oppData = classification.suggestedOpportunity;
        const created = await api.createOpportunity({
          name: oppData.name || 'Quick Captured Opportunity',
          category: oppData.category || 'hackathon',
          deadline: oppData.deadline || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          websiteUrl: oppData.websiteUrl || '',
          status: 'Interested',
          organization: 'Independent',
        });
        onOpportunityCreated(created);
        setSuccessMessage(`Added opportunity "${created.name}"!`);
        setTimeout(() => onClose(), 1000);
      } else if (classification.type === 'task' && classification.suggestedTask) {
        const taskData = classification.suggestedTask;
        const targetId = taskData.opportunityId || opportunities[0]?.id;
        const opp = opportunities.find((o) => o.id === targetId);
        if (!opp) {
          throw new Error('No active opportunity found to attach task to.');
        }
        const updated = await api.updateOpportunity(opp.id, {
          tasks: [
            ...opp.tasks,
            {
              id: `task_qc_${Date.now()}`,
              name: taskData.name || textInput,
              completed: false,
              priority: taskData.priority || 'medium',
            },
          ],
        });
        onOpportunityUpdated(updated);
        setSuccessMessage(`Added task to "${opp.name}"!`);
        setTimeout(() => onClose(), 1000);
      } else if (classification.type === 'note' && classification.suggestedNote) {
        const noteData = classification.suggestedNote;
        const targetId = noteData.opportunityId || opportunities[0]?.id;
        const opp = opportunities.find((o) => o.id === targetId);
        if (!opp) {
          throw new Error('No active opportunity found to attach note to.');
        }
        const updated = await api.updateOpportunity(opp.id, {
          notes: (opp.notes ? opp.notes + '\n\n' : '') + `[Quick Note ${new Date().toLocaleDateString()}]: ${noteData.text}`,
        });
        onOpportunityUpdated(updated);
        setSuccessMessage(`Added note to "${opp.name}"!`);
        setTimeout(() => onClose(), 1000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply capture');
    } finally {
      setIsProcessing(false);
    }
  };

  // Voice recording
  const startVoiceRecording = async () => {
    setVoiceTranscript('');
    setRecordDuration(0);
    setErrorMessage(null);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        rec.onresult = (evt: any) => {
          let str = '';
          for (let i = 0; i < evt.results.length; i++) {
            str += evt.results[i][0].transcript + ' ';
          }
          setVoiceTranscript(str.trim());
          setTextInput(str.trim());
        };
        rec.start();
        recognitionRef.current = rec;
      } catch (e) {
        console.warn(e);
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordDuration((p) => p + 1), 1000);
    } catch (err: any) {
      setErrorMessage('Microphone access denied. Please allow microphone permissions.');
      setIsRecording(false);
    }
  };

  const stopVoiceRecording = () => {
    if (!isRecording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-[#1e293b] bg-[#0c101a] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e293b] p-4 bg-[#101524]">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-cyan-500/20 p-2 text-cyan-400 border border-cyan-500/30">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>Quick Capture</span>
                <span className="rounded bg-cyan-950 text-[10px] font-mono text-cyan-400 px-1.5 py-0.2 border border-cyan-800">
                  AI CLASSIFIED
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Paste any URL, dictate a voice note, or type an action item.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1e293b] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#1e293b] bg-[#090d16] px-4 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('universal')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'universal'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Universal AI</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'url'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            <span>Event Link</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'voice'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
            <span>Voice Mic</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {activeTab === 'voice' ? (
            <div className="text-center py-6 space-y-4">
              <div className="flex justify-center">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="h-16 w-16 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-900/50 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Mic className="h-7 w-7" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="h-16 w-16 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-900/50 animate-pulse hover:bg-red-500 transition-all"
                  >
                    <Square className="h-6 w-6 fill-white" />
                  </button>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-300">
                {isRecording ? `Recording... (${recordDuration}s) Tap to finish` : 'Tap to speak your note or task'}
              </p>
              {voiceTranscript && (
                <div className="text-left rounded-xl border border-cyan-500/30 bg-[#101524] p-3 text-xs text-cyan-200">
                  <p className="italic font-mono">"{voiceTranscript}"</p>
                </div>
              )}
              {voiceTranscript && !isRecording && (
                <button
                  type="button"
                  onClick={() => handleUniversalCapture()}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 text-xs font-bold text-white hover:bg-cyan-500 transition-colors shadow-md shadow-cyan-950"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span>Analyze Speech & Classify</span>
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleUniversalCapture} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  {activeTab === 'url'
                    ? 'Opportunity Website / Registration URL'
                    : 'Paste a link, write a task, or drop a quick thought'}
                </label>
                <textarea
                  rows={3}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={
                    activeTab === 'url'
                      ? 'https://devpost.com/hackathons/example or https://ctftime.org/event/...'
                      : 'e.g. "Review rules and submit team credentials for DEF CON by Friday" or paste any event URL'
                  }
                  className="w-full rounded-xl border border-[#1e293b] bg-[#101524] p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none font-sans"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFullAddModal();
                  }}
                  className="text-xs text-slate-400 hover:text-cyan-400 underline underline-offset-4"
                >
                  Open full add modal
                </button>

                <button
                  type="submit"
                  disabled={isProcessing || !textInput.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors shadow-md shadow-cyan-950"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{activeTab === 'url' ? 'Extract & Save' : 'Classify with AI'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Error / Success feedback */}
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-300">
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Classification result preview */}
          {classification && !successMessage && (
            <div className="rounded-xl border border-cyan-500/30 bg-[#101524] p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  Classification: {classification.type.replace('_', ' ')}
                </span>
                <span className="text-xs font-semibold text-white">{classification.title}</span>
              </div>

              <p className="text-xs text-slate-300">{classification.summary}</p>

              {classification.type === 'task' && classification.suggestedTask && (
                <div className="rounded-lg bg-[#0c101a] p-2.5 border border-[#1e293b] text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">
                      Task: {classification.suggestedTask.name}
                    </span>
                    <span className="rounded bg-amber-950 text-amber-300 text-[10px] px-1.5 py-0.2 uppercase font-mono">
                      {classification.suggestedTask.priority}
                    </span>
                  </div>
                </div>
              )}

              {classification.type === 'new_opportunity' && classification.suggestedOpportunity && (
                <div className="rounded-lg bg-[#0c101a] p-2.5 border border-[#1e293b] text-xs space-y-1">
                  <span className="font-semibold text-white">
                    Event: {classification.suggestedOpportunity.name}
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Category: {classification.suggestedOpportunity.category} • Deadline: {classification.suggestedOpportunity.deadline}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleApplyClassified}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-600 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 transition-colors shadow-md shadow-cyan-950"
              >
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                <span>Confirm & Save to Tracker</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
