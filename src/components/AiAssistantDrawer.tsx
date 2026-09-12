import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import {
  Bot,
  Send,
  Sparkles,
  Loader2,
  Calendar,
  CheckSquare,
  AlertTriangle,
  Clock,
  Mic,
  MicOff,
  Check,
  X,
  Search,
  FileText,
  Brain,
  Pencil,
  Volume2,
  Info,
} from 'lucide-react';
import { Opportunity, AiActionProposal, ResearchEventResult, ResearchStateStatus } from '../types';
import { GroundedResearchCard } from './GroundedResearchCard';

interface AiAssistantDrawerProps {
  opportunities?: Opportunity[];
  onOpportunityUpdated?: (opp: Opportunity) => void;
  onOpportunityCreated?: (opp: Opportunity) => void;
  onOpenOpportunityDetail?: (oppName: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  userSpokenTranscript?: string;
  proposals?: AiActionProposal[];
  researchResult?: ResearchEventResult;
  researchState?: ResearchStateStatus;
}

type MicState = 'idle' | 'listening' | 'recording' | 'processing' | 'transcribing';

const DEFAULT_SUGGESTED_PROMPTS = [
  'What deadlines are coming up in the next 7 days?',
  'Which events have I registered for?',
  'What should I prioritize and work on today?',
  'Which opportunities require immediate attention?',
  'Show me all CTF competitions and their statuses',
  'I registered for DEF CON CTF 34',
];

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  opportunities = [],
  onOpportunityUpdated,
  onOpportunityCreated,
  onOpenOpportunityDetail,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hello! I am your personal Opportunity Assistant.\n\nTell me what you need, like **\"Add this hackathon and remind me 2 days before\"**, **\"I registered for DEF CON\"**, or **\"What should I focus on today?\"**\n\nWhen I propose a change, just say or type **\"OK\"** or **\"Yes\"** to confirm, or click **[Edit]** / **[Cancel]**.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeProposal, setActiveProposal] = useState<AiActionProposal | null>(null);
  const [editingProposal, setEditingProposal] = useState<AiActionProposal | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', note: '', daysBefore: 2, taskName: '', status: '' });
  const [micState, setMicState] = useState<MicState>('idle');
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(DEFAULT_SUGGESTED_PROMPTS);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const spokenTranscriptRef = useRef<string>('');

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, micState]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, []);

  const handleSend = async (userPrompt?: string, spoken = false) => {
    const textToSend = userPrompt || input.trim();
    if (!textToSend || isLoading) return;

    if (micState !== 'idle') {
      stopVoice();
    }

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      userSpokenTranscript: spoken ? textToSend : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await api.askAssistant(textToSend, activeProposal);

      // If action was executed via natural confirmation
      if (res.actionExecuted) {
        setActiveProposal(null);
        if (res.updatedOpportunity) {
          if (res.actionExecuted.action.type === 'create_opportunity') {
            onOpportunityCreated?.(res.updatedOpportunity);
          } else {
            onOpportunityUpdated?.(res.updatedOpportunity);
          }
        }
        // Mark all proposals in messages as executed
        setMessages((prev) =>
          prev.map((m) => {
            if (!m.proposals) return m;
            return {
              ...m,
              proposals: m.proposals.map((p) =>
                p.id === res.actionExecuted!.action.id ? { ...p, status: 'executed' } : p
              ),
            };
          })
        );
      } else if (res.actionDiscarded) {
        setActiveProposal(null);
        // Mark active proposal as dismissed
        setMessages((prev) =>
          prev.map((m) => {
            if (!m.proposals) return m;
            return {
              ...m,
              proposals: m.proposals.map((p) =>
                p.id === activeProposal?.id ? { ...p, status: 'dismissed' } : p
              ),
            };
          })
        );
      } else if (res.proposals && res.proposals.length > 0) {
        setActiveProposal(res.proposals[0]);
      }

      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        proposals: res.proposals && res.proposals.length > 0 ? res.proposals : undefined,
        researchResult: res.researchResult,
        researchState: res.researchResult?.overallState,
      };
      setMessages((prev) => [...prev, botMsg]);
      if (res.suggestedPrompts && res.suggestedPrompts.length > 0) {
        setSuggestedPrompts(res.suggestedPrompts);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: `Sorry, I ran into an issue connecting with the opportunity knowledge base: ${err.message}. Please verify your network connection.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // User explicitly clicks [Cancel] button
  const handleCancelProposal = (proposalId: string) => {
    setActiveProposal(null);
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.proposals) return m;
        return {
          ...m,
          proposals: m.proposals.map((p) =>
            p.id === proposalId ? { ...p, status: 'dismissed' } : p
          ),
        };
      })
    );

    const cancelAckMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'assistant',
      text: 'Cancelled 👍 No changes were made.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, cancelAckMsg]);
  };

  // User explicitly clicks [Edit] button
  const handleStartEdit = (proposal: AiActionProposal) => {
    setEditingProposal(proposal);
    setEditForm({
      title: proposal.title,
      description: proposal.description,
      note: proposal.payload?.note || '',
      daysBefore: proposal.payload?.daysBefore ?? 2,
      taskName: proposal.payload?.name || proposal.payload?.taskName || '',
      status: proposal.payload?.status || '',
    });
  };

  const handleSaveEdit = () => {
    if (!editingProposal) return;
    const updatedPayload = { ...editingProposal.payload };
    if (editingProposal.type === 'add_note') {
      updatedPayload.note = editForm.note || editForm.description;
    } else if (editingProposal.type === 'create_reminder') {
      updatedPayload.daysBefore = Number(editForm.daysBefore) || 2;
    } else if (editingProposal.type === 'create_task') {
      updatedPayload.name = editForm.taskName || editForm.title;
    } else if (editingProposal.type === 'update_status') {
      updatedPayload.status = editForm.status;
    }

    const modifiedProposal: AiActionProposal = {
      ...editingProposal,
      title: editForm.title,
      description: editForm.description,
      payload: updatedPayload,
    };

    setActiveProposal(modifiedProposal);
    setEditingProposal(null);

    // Update in messages list
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.proposals) return m;
        return {
          ...m,
          proposals: m.proposals.map((p) =>
            p.id === modifiedProposal.id ? modifiedProposal : p
          ),
        };
      })
    );

    const editAckMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'assistant',
      text: `Got it. I updated the proposal to:\n\n**${modifiedProposal.title}**\n${modifiedProposal.description}\n\nShould I do that? Say or type **"OK"** to save, or modify with **[Edit]** / **[Cancel]**.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      proposals: [modifiedProposal],
    };
    setMessages((prev) => [...prev, editAckMsg]);
  };

  // Voice recording & transcription flow
  const startVoice = async () => {
    setMicNotice(null);
    spokenTranscriptRef.current = '';
    audioChunksRef.current = [];

    // Check mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicNotice('Audio recording is not supported in this browser.');
      return;
    }

    try {
      setMicState('listening');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(250);
      setMicState('recording');

      // Also start SpeechRecognition in parallel for rapid transcription
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = false;
          rec.interimResults = true;
          rec.lang = 'en-US';

          rec.onresult = (e: any) => {
            let text = '';
            for (let i = 0; i < e.results.length; i++) {
              text += e.results[i][0].transcript + ' ';
            }
            const clean = text.trim();
            spokenTranscriptRef.current = clean;
            setInput(clean);
          };

          rec.onerror = (e: any) => {
            console.warn('Speech recognition warning:', e.error);
          };

          rec.start();
          recognitionRef.current = rec;
        } catch (recErr) {
          console.warn('SpeechRecognition init error:', recErr);
        }
      }
    } catch (err: any) {
      console.error('Mic access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicNotice('Microphone access was denied. Please allow microphone access in your browser or type your request.');
      } else {
        setMicNotice(err.message || 'Microphone could not be started.');
      }
      setMicState('idle');
    }
  };

  const stopVoice = async () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      setMicState('processing');
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;

      // Allow chunks to finish flushing
      setTimeout(async () => {
        let transcript = spokenTranscriptRef.current.trim() || input.trim();

        // If SpeechRecognition produced nothing, use Gemini multimodal audio transcription
        if (!transcript && audioChunksRef.current.length > 0) {
          setMicState('transcribing');
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const reader = new FileReader();
            const base64Audio: string = await new Promise((resolve) => {
              reader.onloadend = () => {
                const res = reader.result as string;
                resolve(res.includes(',') ? res.split(',')[1] : res);
              };
              reader.readAsDataURL(blob);
            });

            const transResult = await api.transcribeAudio(base64Audio, blob.type || 'audio/webm');
            if (transResult.success && transResult.transcription) {
              transcript = transResult.transcription.trim();
            }
          } catch (transErr: any) {
            console.warn('Audio transcription error:', transErr);
          }
        }

        setMicState('idle');

        if (transcript) {
          setInput(transcript);
          await handleSend(transcript, true);
        } else {
          setMicNotice('No speech was detected. Please try again or type your request.');
        }
      }, 400);
    } else {
      setMicState('idle');
    }
  };

  const toggleVoice = () => {
    if (micState === 'recording' || micState === 'listening') {
      stopVoice();
    } else if (micState === 'idle') {
      startVoice();
    }
  };

  const handleCreateFromResearch = async (oppData: Partial<Opportunity>) => {
    try {
      const created = await api.createOpportunity(oppData);
      onOpportunityCreated?.(created);
      const confirmMsg: ChatMessage = {
        id: String(Date.now()),
        sender: 'assistant',
        text: `✓ Added **${created.name}** to your tracker with all verified dates, tasks, and official website monitoring configured!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch (err: any) {
      console.error('Failed to create from research:', err);
    }
  };

  return (
    <div id="ai-assistant-view" className="space-y-4 max-w-4xl mx-auto h-[calc(100vh-10rem)] md:h-[calc(100vh-8.5rem)] flex flex-col pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-violet-500/20 p-2 text-violet-400 border border-violet-500/30">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Personal Opportunity Assistant</span>
              <span className="rounded bg-violet-950/60 border border-violet-800/60 px-1.5 py-0.2 text-[10px] font-mono text-violet-300">
                VOICE & NATURAL CONFIRMATION
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Grounded in your tracked events, deadlines, tasks, and voice notes. Proposes changes that you confirm naturally.
            </p>
          </div>
        </div>

        {/* Microphone state badge */}
        <div className="flex items-center gap-2">
          {micState === 'recording' && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-xs font-semibold text-red-400 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              Recording…
            </span>
          )}
          {micState === 'transcribing' && (
            <span className="flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-xs font-semibold text-cyan-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Transcribing…
            </span>
          )}
          {micState === 'processing' && (
            <span className="flex items-center gap-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 px-2.5 py-1 text-xs font-semibold text-violet-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing…
            </span>
          )}
          {micState === 'idle' && (
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              Ready
            </span>
          )}
        </div>
      </div>

      {/* Notice / Warning Bar */}
      {micNotice && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-950/30 border border-amber-800/40 p-2.5 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{micNotice}</span>
          </div>
          <button
            onClick={() => setMicNotice(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Suggested Prompts pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-none">
        <span className="text-[11px] text-slate-500 font-medium shrink-0 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-violet-400" />
          Quick Ask:
        </span>
        {suggestedPrompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSend(prompt)}
            disabled={isLoading}
            className="rounded-lg border border-[#1e293b] bg-[#101524] px-2.5 py-1 text-xs text-slate-300 hover:border-violet-500/40 hover:text-violet-300 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 rounded-xl border border-[#1e293b] bg-[#0c101a] p-3 md:p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] md:max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed whitespace-pre-wrap ${
                msg.sender === 'user'
                  ? 'bg-cyan-600 text-white rounded-br-none shadow-md'
                  : 'bg-[#121826] text-slate-200 border border-[#1e293b] rounded-bl-none shadow-sm'
              }`}
            >
              {msg.sender === 'assistant' && (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-400 mb-2">
                  <Bot className="h-3.5 w-3.5" />
                  <span>Opportunity Assistant</span>
                </div>
              )}

              {msg.userSpokenTranscript && (
                <div className="mb-2 pb-2 border-b border-cyan-500/40 text-[11px] text-cyan-100 flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5 shrink-0 text-cyan-200" />
                  <span><strong>You said:</strong> "{msg.userSpokenTranscript}"</span>
                </div>
              )}

              {msg.text}

              {/* Render Grounded Research Card if live research was conducted */}
              {msg.researchResult && (
                <div className="mt-3">
                  <GroundedResearchCard
                    research={msg.researchResult}
                    onAddToTracker={handleCreateFromResearch}
                    isAlreadyTracked={opportunities.some(
                      (o) => o.name.toLowerCase() === msg.researchResult?.eventName.value.toLowerCase()
                    )}
                  />
                </div>
              )}

              {/* Action Proposal Interactive Cards - STRICT NO [OK/SAVE] BUTTON */}
              {msg.proposals && msg.proposals.length > 0 && !msg.researchResult && (
                <div className="mt-3.5 pt-3 border-t border-[#1e293b] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Proposed Action
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Awaiting your confirmation
                    </span>
                  </div>

                  {msg.proposals.map((proposal) => (
                    <div
                      key={proposal.id}
                      className="rounded-xl border border-violet-500/30 bg-[#0c101a] p-3 space-y-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {proposal.title}
                          </span>
                          <span className="rounded bg-violet-950 px-1.5 py-0.2 text-[9px] font-mono text-violet-300 border border-violet-800">
                            {proposal.type.replace('_', ' ')}
                          </span>
                        </div>
                        {proposal.description && (
                          <p className="text-[11px] text-slate-300">
                            {proposal.description}
                          </p>
                        )}
                        {proposal.opportunityName && (
                          <p className="text-[10px] text-cyan-400 font-medium">
                            Target Event: {proposal.opportunityName}
                          </p>
                        )}
                      </div>

                      {proposal.status === 'executed' ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold pt-1">
                          <Check className="h-3.5 w-3.5" />
                          <span>Action Applied to Tracker</span>
                        </div>
                      ) : proposal.status === 'dismissed' ? (
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 italic pt-1">
                          <X className="h-3 w-3" />
                          <span>Discarded</span>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-[#1e293b]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <p className="text-[10px] text-slate-400 italic">
                            Say or type <strong>"OK"</strong>, <strong>"Yes"</strong>, or <strong>"Save it"</strong> to confirm.
                          </p>
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(proposal)}
                              className="flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-950/40 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-900/50 transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelProposal(proposal.id)}
                              className="flex items-center gap-1 rounded-lg border border-[#1e293b] px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-300 hover:border-red-900 transition-colors"
                            >
                              <X className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono">
              {msg.timestamp}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="space-y-2 p-3.5 rounded-xl bg-[#121826] border border-[#1e293b] max-w-[320px]">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              <span>Thinking & checking tracker…</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[11px] text-slate-400">
              <span className="flex items-center gap-1 rounded bg-[#0c101a] px-2 py-1">
                <Search className="h-3 w-3 text-cyan-400 animate-pulse" />
                Opportunities
              </span>
              <span className="flex items-center gap-1 rounded bg-[#0c101a] px-2 py-1">
                <Clock className="h-3 w-3 text-cyan-400" />
                Deadlines
              </span>
              <span className="flex items-center gap-1 rounded bg-[#0c101a] px-2 py-1">
                <Brain className="h-3 w-3 text-violet-400 animate-pulse" />
                Priorities
              </span>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Modal/Dialog for [Edit] flow */}
      {editingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-violet-500/40 bg-[#0c101a] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-bold text-white">Edit Proposed Action</h3>
              </div>
              <button
                onClick={() => setEditingProposal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              {editingProposal.type === 'create_reminder' && (
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Remind me days before deadline:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={editForm.daysBefore}
                    onChange={(e) => setEditForm((f) => ({ ...f, daysBefore: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              )}

              {editingProposal.type === 'add_note' && (
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Note Content</label>
                  <textarea
                    rows={3}
                    value={editForm.note}
                    onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              )}

              {editingProposal.type === 'create_task' && (
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Task Name</label>
                  <input
                    type="text"
                    value={editForm.taskName}
                    onChange={(e) => setEditForm((f) => ({ ...f, taskName: e.target.value }))}
                    className="w-full rounded-lg border border-[#1e293b] bg-[#121826] px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#1e293b] pt-3">
              <button
                type="button"
                onClick={() => setEditingProposal(null)}
                className="rounded-lg border border-[#1e293b] px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
              >
                Update Proposal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Box with Voice First Support */}
      <div className="shrink-0 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2 items-center"
        >
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={
                micState === 'recording'
                  ? 'Listening to you... Speak your request...'
                  : micState === 'transcribing'
                  ? 'Transcribing your audio...'
                  : activeProposal
                  ? 'Say or type "OK", "Yes", "Save it", or "Cancel"…'
                  : 'Ask a question or say "I registered for DEF CON" or "Remind me 2 days before"…'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || micState === 'transcribing'}
              className={`w-full rounded-xl border bg-[#101524] pl-4 pr-12 py-3 text-xs text-white placeholder:text-slate-500 focus:outline-none ${
                micState === 'recording'
                  ? 'border-red-500/80 ring-2 ring-red-500/40 bg-red-950/20'
                  : 'border-[#1e293b] focus:border-violet-500/50'
              }`}
            />
            <button
              type="button"
              onClick={toggleVoice}
              title={micState === 'recording' ? 'Stop recording and process' : 'Speak to Assistant'}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors ${
                micState === 'recording'
                  ? 'text-white bg-red-600 animate-pulse ring-2 ring-red-400'
                  : 'text-slate-400 hover:text-violet-300 hover:bg-violet-950/50'
              }`}
            >
              {micState === 'recording' ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 md:px-5 py-3 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors shrink-0 shadow-md shadow-violet-950/50"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
