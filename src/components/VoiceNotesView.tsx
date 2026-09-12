import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Square,
  Sparkles,
  Search,
  Trash2,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertCircle,
  Play,
  Pause,
  Filter,
  Check,
  Plus,
  Loader2,
  Tag,
  Volume2,
} from 'lucide-react';
import { Opportunity, VoiceNote, VoiceAnalysisResult, OpportunityStatus } from '../types';
import { api } from '../services/api';

interface VoiceNotesViewProps {
  opportunities: Opportunity[];
  onOpportunityUpdated: (updated: Opportunity) => void;
  onOpenOpportunityDetail: (opp: Opportunity) => void;
}

export const VoiceNotesView: React.FC<VoiceNotesViewProps> = ({
  opportunities,
  onOpportunityUpdated,
  onOpenOpportunityDetail,
}) => {
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOppFilter, setSelectedOppFilter] = useState<string>('all');

  // Recorder state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [targetOppId, setTargetOppId] = useState<string>('');

  // Audio playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live analysis results from the latest recorded voice note
  const [latestAnalysis, setLatestAnalysis] = useState<{
    note: VoiceNote;
    analysis: VoiceAnalysisResult;
  } | null>(null);
  const [actionApplied, setActionApplied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef<string>('');
  const [liveTranscript, setLiveTranscript] = useState('');

  // Load voice notes
  const loadNotes = async () => {
    try {
      setLoading(true);
      const data = await api.getVoiceNotes(
        searchQuery || undefined,
        selectedOppFilter !== 'all' ? selectedOppFilter : undefined
      );
      setVoiceNotes(data);
    } catch (err) {
      console.error('Failed to load voice notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [searchQuery, selectedOppFilter]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Handle start recording
  const startRecording = async () => {
    setRecorderError(null);
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    audioChunksRef.current = [];
    setRecordDuration(0);
    setLatestAnalysis(null);
    setActionApplied(false);

    // 1. Setup speech recognition for real-time transcription if available
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let fullText = '';
          for (let i = 0; i < event.results.length; i++) {
            fullText += event.results[i][0].transcript + ' ';
          }
          liveTranscriptRef.current = fullText.trim();
          setLiveTranscript(fullText.trim());
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition status:', event.error);
          if (event.error === 'not-allowed') {
            setRecorderError('Microphone permission was denied. Please allow microphone access in browser settings.');
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('SpeechRecognition initialization error:', e);
      }
    }

    // 2. Request user media stream for audio recording
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Audio recording is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Recording start error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setRecorderError('Microphone access denied. Please click the permissions icon in your address bar and allow microphone.');
      } else {
        setRecorderError(err.message || 'Could not start audio recording.');
      }
      setIsRecording(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    }
  };

  // Handle stop recording
  const stopRecording = async () => {
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

    const duration = recordDuration;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      // stop tracks to release hardware
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }

    // Wait a brief moment for chunks to collect
    setTimeout(async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      let audioDataUrl: string | undefined;

      // Convert small audio blob to base64 data URL for playback
      if (audioBlob.size > 0 && audioBlob.size < 4000000) {
        try {
          const reader = new FileReader();
          audioDataUrl = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(audioBlob);
          });
        } catch {
          // ignore
        }
      }

      // Check if transcription was captured
      let transcriptionText = (liveTranscriptRef.current || liveTranscript).trim();

      // If browser speech recognition did not capture text, use Gemini multimodal audio transcription
      if (!transcriptionText && audioDataUrl) {
        try {
          setIsAnalyzing(true);
          const base64Data = audioDataUrl.includes(',') ? audioDataUrl.split(',')[1] : audioDataUrl;
          const mime = audioBlob.type || 'audio/webm';
          const geminiTrans = await api.transcribeAudio(base64Data, mime);
          if (geminiTrans.success && geminiTrans.transcription) {
            transcriptionText = geminiTrans.transcription.trim();
            setLiveTranscript(transcriptionText);
          }
        } catch (transErr) {
          console.warn('Server audio transcription fallback failed:', transErr);
        }
      }

      if (!transcriptionText) {
        setRecorderError('No speech was detected during the recording. Please speak clearly into your microphone.');
        setIsAnalyzing(false);
        return;
      }

      setIsAnalyzing(true);
      try {
        // 1. Analyze transcription with Gemini / Server NLP
        const analysis = await api.analyzeVoice(transcriptionText, targetOppId || undefined);

        // 2. Map target opportunity name
        let matchedOppName: string | undefined;
        let matchedOppId: string | undefined = targetOppId || undefined;

        if (analysis.detectedEvent?.opportunityId) {
          matchedOppId = analysis.detectedEvent.opportunityId;
          const opp = opportunities.find((o) => o.id === matchedOppId);
          matchedOppName = opp?.name || analysis.detectedEvent.name;
        } else if (targetOppId) {
          const opp = opportunities.find((o) => o.id === targetOppId);
          matchedOppName = opp?.name;
        } else if (analysis.detectedEvent?.name) {
          matchedOppName = analysis.detectedEvent.name;
        }

        // 3. Save voice note in backend
        const savedNote = await api.createVoiceNote({
          opportunityId: matchedOppId,
          opportunityName: matchedOppName,
          transcription: transcriptionText,
          audioDataUrl,
          durationSeconds: duration,
        });

        // Attach detected entities
        savedNote.detectedEntities = {
          eventName: matchedOppName,
          status: analysis.detectedStatus,
          tasks: analysis.detectedTasks,
          notes: analysis.detectedNotes,
        };

        setVoiceNotes((prev) => [savedNote, ...prev]);
        setLatestAnalysis({
          note: savedNote,
          analysis,
        });
      } catch (err: any) {
        setRecorderError(`Voice analysis failed: ${err.message}`);
      } finally {
        setIsAnalyzing(false);
      }
    }, 400);
  };

  // Quick action: Apply detected updates to opportunity
  const handleApplyAnalysis = async () => {
    if (!latestAnalysis) return;
    const { analysis, note } = latestAnalysis;
    const targetId = analysis.detectedEvent?.opportunityId || targetOppId;
    if (!targetId) {
      alert('Please select an opportunity to apply these detected tasks and updates.');
      return;
    }

    const opp = opportunities.find((o) => o.id === targetId);
    if (!opp) return;

    try {
      const updates: Partial<Opportunity> = {};

      // 1. Update status if detected
      if (analysis.detectedStatus) {
        updates.status = analysis.detectedStatus;
      }

      // 2. Append new tasks if detected
      if (analysis.detectedTasks && analysis.detectedTasks.length > 0) {
        const newTasks = analysis.detectedTasks.map((t, idx) => ({
          id: `task_voice_${Date.now()}_${idx}`,
          name: t.name,
          completed: false,
          priority: t.priority,
        }));
        updates.tasks = [...opp.tasks, ...newTasks];
      }

      // 3. Append note if detected
      if (analysis.detectedNotes && analysis.detectedNotes !== opp.notes) {
        updates.notes = (opp.notes ? opp.notes + '\n\n' : '') + `[Voice Note ${new Date().toLocaleDateString()}]: ${analysis.detectedNotes}`;
      }

      const updated = await api.updateOpportunity(opp.id, updates);
      onOpportunityUpdated(updated);
      setActionApplied(true);
    } catch (err: any) {
      alert(`Failed to apply updates: ${err.message}`);
    }
  };

  // Audio Playback
  const handleTogglePlay = (note: VoiceNote) => {
    if (!note.audioDataUrl) return;

    if (playingId === note.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(note.audioDataUrl);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      audio.play();
      setPlayingId(note.id);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this voice note?')) return;
    try {
      await api.deleteVoiceNote(id);
      setVoiceNotes((prev) => prev.filter((n) => n.id !== id));
      if (latestAnalysis?.note.id === id) {
        setLatestAnalysis(null);
      }
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const formatDuration = (sec?: number) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div id="voice-notes-view" className="space-y-6 max-w-5xl mx-auto pb-24 md:pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e293b] pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <div className="rounded-lg bg-cyan-500/20 p-2 text-cyan-400 border border-cyan-500/30">
              <Mic className="h-5 w-5" />
            </div>
            <span>Voice Notes & Speech Intelligence</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Capture spoken thoughts, event updates, and action items hands-free. AI automatically extracts statuses and tasks.
          </p>
        </div>
      </div>

      {/* Voice Recorder Card */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-[#0e1628] to-[#090d16] p-5 md:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                <Sparkles className="h-3 w-3" />
                Speech-to-Action Engine
              </span>
              {isRecording && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-500/40 px-2.5 py-0.5 text-xs font-semibold text-red-400 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Recording ({formatDuration(recordDuration)})
                </span>
              )}
            </div>

            <h3 className="text-base font-semibold text-white">
              {isRecording
                ? 'Listening to your voice note...'
                : isAnalyzing
                ? 'Extracting events, deadlines, and tasks...'
                : 'Record a Voice Note'}
            </h3>

            {/* Optional Opportunity Selector */}
            <div className="flex items-center gap-2 max-w-md">
              <span className="text-xs text-slate-400 shrink-0">Attach to:</span>
              <select
                value={targetOppId}
                onChange={(e) => setTargetOppId(e.target.value)}
                disabled={isRecording}
                className="w-full rounded-lg border border-[#1e293b] bg-[#101524] px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="">Auto-detect opportunity from speech</option>
                {opportunities.map((opp) => (
                  <option key={opp.id} value={opp.id}>
                    {opp.name} ({opp.organization})
                  </option>
                ))}
              </select>
            </div>

            {/* Real-time transcription preview */}
            {isRecording && liveTranscript && (
              <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-3 text-xs text-cyan-200 animate-in fade-in">
                <p className="font-mono italic">"{liveTranscript}"</p>
              </div>
            )}

            {recorderError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <p>{recorderError}</p>
              </div>
            )}
          </div>

          {/* Record / Stop Action Button */}
          <div className="flex flex-col items-center justify-center shrink-0">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={isAnalyzing}
                className="relative group flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                <div className="absolute inset-0 rounded-full bg-cyan-400 opacity-20 group-hover:scale-110 transition-transform blur" />
                <Mic className="h-8 w-8 relative z-10" />
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="relative flex items-center justify-center h-20 w-20 rounded-full bg-red-600 text-white shadow-lg shadow-red-900/50 hover:bg-red-500 active:scale-95 transition-all animate-pulse"
              >
                <Square className="h-7 w-7 fill-white" />
              </button>
            )}
            <span className="text-[11px] font-medium text-slate-400 mt-2">
              {isRecording ? 'Tap to Finish' : 'Tap to Speak'}
            </span>
          </div>
        </div>

        {/* Live Analysis Extraction Card (if just recorded) */}
        {latestAnalysis && (
          <div className="mt-6 border-t border-[#1e293b] pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                AI Speech Analysis & Suggested Actions
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                Confidence: {latestAnalysis.analysis.confidence}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Event Detected */}
              <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Detected Event
                </span>
                <p className="text-xs font-medium text-white">
                  {latestAnalysis.analysis.detectedEvent?.name || 'General note'}
                </p>
              </div>

              {/* Status Detected */}
              <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Status Mentioned
                </span>
                <p className="text-xs font-medium text-cyan-300">
                  {latestAnalysis.analysis.detectedStatus || 'None'}
                </p>
              </div>

              {/* Tasks Detected */}
              <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Actionable Tasks
                </span>
                <p className="text-xs font-medium text-emerald-300">
                  {latestAnalysis.analysis.detectedTasks?.length || 0} task(s) detected
                </p>
              </div>
            </div>

            {/* Apply Action Button */}
            {(latestAnalysis.analysis.detectedStatus ||
              (latestAnalysis.analysis.detectedTasks && latestAnalysis.analysis.detectedTasks.length > 0)) && (
              <div className="flex items-center justify-end gap-3 pt-2">
                {actionApplied ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Updates applied successfully to opportunity!
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleApplyAnalysis}
                    className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 transition-colors shadow-md shadow-cyan-950"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Apply Detected Updates to Event</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search voice notes by keyword, summary, or event name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[#1e293b] bg-[#101524] pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500 shrink-0" />
          <select
            value={selectedOppFilter}
            onChange={(e) => setSelectedOppFilter(e.target.value)}
            className="rounded-xl border border-[#1e293b] bg-[#101524] px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Opportunities</option>
            {opportunities.map((opp) => (
              <option key={opp.id} value={opp.id}>
                {opp.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Voice Notes List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-xs text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400 mr-2" />
            <span>Loading voice notes...</span>
          </div>
        ) : voiceNotes.length === 0 ? (
          <div className="rounded-2xl border border-[#1e293b] bg-[#0c101a] p-10 text-center space-y-2">
            <Volume2 className="h-8 w-8 text-slate-600 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-300">No voice notes yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Tap the microphone above to speak a quick thought, update your registration status, or dictate tasks.
            </p>
          </div>
        ) : (
          voiceNotes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-[#1e293b] bg-[#101524] p-4 hover:border-cyan-500/30 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {note.opportunityName ? (
                      <span className="inline-flex items-center gap-1 rounded bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                        <Tag className="h-3 w-3" />
                        {note.opportunityName}
                      </span>
                    ) : (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                        General Thought
                      </span>
                    )}

                    <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(note.createdAt).toLocaleDateString()}{' '}
                      {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    {note.durationSeconds && (
                      <span className="text-[11px] text-slate-500 font-mono">
                        ({formatDuration(note.durationSeconds)})
                      </span>
                    )}
                  </div>

                  {/* Summary / Headline */}
                  {note.summary && (
                    <p className="text-xs font-semibold text-white pt-1">
                      {note.summary}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {note.audioDataUrl && (
                    <button
                      type="button"
                      onClick={() => handleTogglePlay(note)}
                      className="rounded-lg border border-[#1e293b] bg-[#0c101a] p-2 text-cyan-400 hover:bg-cyan-950/40 hover:border-cyan-500/40 transition-colors"
                      title={playingId === note.id ? 'Pause' : 'Play audio'}
                    >
                      {playingId === note.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    className="rounded-lg border border-[#1e293b] bg-[#0c101a] p-2 text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-colors"
                    title="Delete note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Transcription */}
              <p className="text-xs text-slate-300 bg-[#0c101a] rounded-lg p-3 border border-[#1e293b]/60 leading-relaxed font-sans">
                "{note.transcription}"
              </p>

              {/* Extracted Tasks or Status (if stored) */}
              {note.detectedEntities?.tasks && note.detectedEntities.tasks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">
                    Extracted Tasks:
                  </span>
                  {note.detectedEntities.tasks.map((task, i) => (
                    <span
                      key={i}
                      className="rounded bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 text-[10px] text-emerald-300 flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      {task.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
