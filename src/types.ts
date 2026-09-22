export type ActiveView =
  | 'dashboard'
  | 'opportunities'
  | 'deadlines'
  | 'tasks'
  | 'calendar'
  | 'voice'
  | 'notifications'
  | 'assistant'
  | 'settings';

export type OpportunityStatus =
  | 'Interested'
  | 'Planning to register'
  | 'Registered'
  | 'Applied'
  | 'Selected'
  | 'In progress'
  | 'Completed'
  | 'Rejected'
  | 'Not participating';

export type OpportunityCategory =
  | 'hackathon'
  | 'ctf'
  | 'workshop'
  | 'competition'
  | 'program'
  | 'scholarship'
  | 'internship'
  | 'conference'
  | 'fellowship'
  | 'grant'
  | 'other';

export type UrgencyLevel = 'comfortable' | 'approaching' | 'urgent' | 'passed' | 'none';

export interface TaskItem {
  id: string;
  name: string;
  completed: boolean;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  notes?: string;
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  field: string;
  oldVal: string;
  newVal: string;
  description: string;
}

export interface TrackingInfo {
  lastChecked: string | null;
  status: 'not_checked' | 'checking' | 'active' | 'changed' | 'error' | 'healthy';
  statusCode?: number;
  errorMessage?: string;
  contentHash?: string;
  changeSummary?: string;
  lastChangeDetectedAt?: string;
  verifiedInfo?: {
    title?: string;
    detectedDeadline?: string;
    detectedEventDate?: string;
    detectedStatus?: string;
    announcements?: string[];
    summary?: string;
  };
  previousSnapshot?: {
    checkedAt: string;
    title?: string;
    textSnippet?: string;
    detectedDeadline?: string;
  };
  changeLog?: ChangeLogEntry[];
  failedAttemptsCount: number;
}

export type SourceType =
  | 'official_event_website'
  | 'official_registration_page'
  | 'official_rules_documentation'
  | 'official_organization_announcement'
  | 'trusted_secondary_source'
  | 'user_input'
  | 'unverified';

export type VerificationStatus =
  | 'verified'
  | 'unverified'
  | 'conflict'
  | 'unable_to_verify';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface FieldSourceConflict {
  value: string;
  sourceUrl: string;
  sourceTitle?: string;
  sourceType: SourceType;
  quoteSnippet?: string;
}

export interface VerifiedField<T = string> {
  value: T;
  sourceUrl: string;
  sourceType: SourceType;
  sourceTitle?: string;
  lastChecked: string;
  verificationStatus: VerificationStatus;
  confidence: ConfidenceLevel;
  quoteSnippet?: string;
  conflicts?: FieldSourceConflict[];
}

export type ResearchStateStatus =
  | 'idle'
  | 'searching'          // 🔎 Searching
  | 'sources_found'      // 📄 Sources found
  | 'analyzing'          // 🧠 Analyzing
  | 'verified'           // ✓ Verified
  | 'needs_confirmation' // ⚠ Needs confirmation
  | 'unable_to_verify';  // ✕ Unable to verify

export interface ResearchSourceItem {
  url: string;
  title: string;
  sourceType: SourceType;
  retrievedSuccessfully: boolean;
  httpStatus?: number;
  snippet?: string;
  isOfficial?: boolean;
}

export interface ResearchEventResult {
  eventName: VerifiedField<string>;
  deadline: VerifiedField<string>;
  registrationStatus: VerifiedField<'Open' | 'Closed' | 'Upcoming' | 'Unknown' | string>;
  eventDate: VerifiedField<string>;
  officialWebsite: VerifiedField<string>;
  registrationUrl: VerifiedField<string>;
  organization: VerifiedField<string>;
  category: VerifiedField<OpportunityCategory>;
  description: VerifiedField<string>;
  suggestedTasks: Array<{ name: string; priority: 'high' | 'medium' | 'low' }>;
  suggestedTags: string[];

  // Research meta
  overallState: ResearchStateStatus;
  sourcesDiscovered: ResearchSourceItem[];
  sourcesRetrievedCount: number;
  retrievalTimestamp: string;
  query: string;
  reasoningNotes?: string;
  unverifiedWarning?: string;
}

export type InformationOrigin =
  | 'user_provided'
  | 'live_retrieved'
  | 'verified'
  | 'ai_knowledge';

export interface ProvenanceInfo {
  origin: 'manual' | 'extracted' | 'verified' | InformationOrigin;
  verifiedByCheck?: boolean;
  extractedAt?: string;
  sourceUrl?: string;
  sourceType?: SourceType;
  verificationStatus?: VerificationStatus;
  confidence?: ConfidenceLevel;
  quoteSnippet?: string;
}

export interface VoiceNote {
  id: string;
  opportunityId?: string;
  opportunityName?: string;
  transcription: string;
  summary?: string;
  audioDataUrl?: string;
  durationSeconds?: number;
  detectedEntities?: {
    eventName?: string;
    status?: OpportunityStatus;
    tasks?: Array<{ name: string; priority: 'low' | 'medium' | 'high' }>;
    notes?: string;
  };
  createdAt: string;
}

export interface Opportunity {
  id: string;
  name: string;
  websiteUrl: string;
  registrationUrl?: string;
  category: OpportunityCategory;
  organization: string;
  deadline: string; // YYYY-MM-DD or ISO
  eventDate?: string; // YYYY-MM-DD
  eventStartDate?: string; // Alias for eventDate
  status: OpportunityStatus;
  notes: string;
  tasks: TaskItem[];
  tags: string[];
  reminderDaysBefore?: number[]; // e.g., [14, 7, 3, 1, 0]
  tracking: TrackingInfo;
  provenance?: ProvenanceInfo;

  // Grounded Research & Field-Level Verification
  verifiedFields?: {
    deadline?: VerifiedField<string>;
    registrationStatus?: VerifiedField<string>;
    eventDate?: VerifiedField<string>;
    websiteUrl?: VerifiedField<string>;
    registrationUrl?: VerifiedField<string>;
    organization?: VerifiedField<string>;
  };
  sources?: ResearchSourceItem[];
  lastResearchTimestamp?: string;
  researchState?: ResearchStateStatus;

  isSample?: boolean;
  voiceNoteCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  type:
    | 'deadline_reminder'
    | 'website_changed'
    | 'website_change'
    | 'website_error'
    | 'check_failure'
    | 'task_overdue'
    | 'overdue_task'
    | 'system';
  opportunityId?: string;
  opportunityName?: string;
  title: string;
  message: string;
  timestamp?: string;
  createdAt?: string;
  read: boolean;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  actionUrl?: string;
  details?: {
    summary?: string;
    [key: string]: any;
  };
}

export interface NotificationSettings {
  reminder14d: boolean;
  reminder7d: boolean;
  reminder3d: boolean;
  reminder1d: boolean;
  reminder0d: boolean;
  notifyOnChanges: boolean;
  notifyOnFailures: boolean;
  notifyOnOverdueTasks: boolean;
}

export interface ExtractedOpportunityData {
  name: string;
  organization: string;
  category: OpportunityCategory;
  description?: string;
  summary?: string;
  deadline: string;
  eventDate?: string;
  eventStartDate?: string;
  registrationUrl?: string;
  suggestedTags?: string[];
  tags?: string[];
  suggestedTasks?: Array<{
    name: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  tasks?: Array<{
    name: string;
    priority: 'low' | 'medium' | 'high';
  }>;
}

export type AiActionType =
  | 'update_status'
  | 'create_task'
  | 'complete_task'
  | 'create_opportunity'
  | 'add_note'
  | 'create_reminder';

export interface AiActionProposal {
  id: string;
  type: AiActionType;
  title: string;
  description: string;
  opportunityId?: string;
  opportunityName?: string;
  payload: any;
  status: 'pending' | 'applied' | 'dismissed';
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  userSpokenTranscript?: string;
  proposals?: AiActionProposal[];
  suggestedPrompts?: string[];
  isVoiceInput?: boolean;
  isInitialAck?: boolean;
  researchResult?: ResearchEventResult;
  researchState?: ResearchStateStatus;
  researchSteps?: string[];
}

export interface VoiceAnalysisResult {
  transcription: string;
  detectedEvent?: {
    name: string;
    opportunityId?: string;
    matchedExisting: boolean;
  };
  detectedStatus?: OpportunityStatus;
  detectedTasks: Array<{
    name: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  detectedNotes?: string;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface QuickCaptureClassification {
  type: 'opportunity_url' | 'new_opportunity' | 'task' | 'voice_note' | 'note';
  title: string;
  summary: string;
  suggestedOpportunity?: Partial<Opportunity>;
  suggestedTask?: {
    name: string;
    priority: 'low' | 'medium' | 'high';
    opportunityId?: string;
    opportunityName?: string;
  };
  suggestedNote?: {
    text: string;
    opportunityId?: string;
    opportunityName?: string;
  };
}
