import fs from 'fs';
import path from 'path';
import { getDbPool } from './db.js';
import {
  Opportunity,
  AppNotification,
  NotificationSettings,
  VoiceNote,
} from '../src/types.js';

/**
 * Robust, atomic file storage with corrupt file preservation.
 * Kept for testing and as a local file fallback.
 */
export class JsonFileStorage<T> {
  private filePath: string;
  private defaultFallback: T;
  private memoryCache: T | null = null;

  constructor(filePath: string, defaultFallback: T) {
    this.filePath = filePath;
    this.defaultFallback = defaultFallback;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load(): T {
    if (!fs.existsSync(this.filePath)) {
      this.save(this.defaultFallback);
      this.memoryCache = this.defaultFallback;
      return this.defaultFallback;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      if (!raw.trim()) {
        this.backupCorruptFile('empty');
        return this.defaultFallback;
      }
      const parsed = JSON.parse(raw) as T;
      this.memoryCache = parsed;
      return parsed;
    } catch (err) {
      console.error(`CRITICAL: Corrupted JSON detected at ${this.filePath}:`, err);
      this.backupCorruptFile('corrupt');
      return this.memoryCache !== null ? this.memoryCache : this.defaultFallback;
    }
  }

  save(data: T): void {
    const dir = path.dirname(this.filePath);
    const tempFile = path.join(dir, `.${path.basename(this.filePath)}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    try {
      const json = JSON.stringify(data, null, 2);
      fs.writeFileSync(tempFile, json, 'utf-8');
      fs.renameSync(tempFile, this.filePath);
      this.memoryCache = data;
    } catch (err) {
      console.error(`Failed to save atomic JSON to ${this.filePath}:`, err);
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch {}
      throw err;
    }
  }

  private backupCorruptFile(reason: string): void {
    try {
      const backupPath = `${this.filePath}.${reason}.${Date.now()}`;
      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, backupPath);
        console.warn(`Preserved corrupted file to: ${backupPath}`);
      }
    } catch (backupErr) {
      console.error(`Failed to preserve corrupt file ${this.filePath}:`, backupErr);
    }
  }
}

// In-memory cache layer for fast, synchronous read access across all handlers,
// backed by Postgres read-through and asynchronous write-through persistence.
let cachedOpportunities: Opportunity[] | null = null;
let cachedNotifications: AppNotification[] | null = null;
let cachedVoiceNotes: VoiceNote[] | null = null;
let cachedSettings: NotificationSettings | null = null;

let isInitialized = false;

// Fallback JSON stores (used if DATABASE_URL is not set, e.g. standalone test environments)
let fileOppStorage: JsonFileStorage<Opportunity[]> | null = null;
let fileNotifStorage: JsonFileStorage<AppNotification[]> | null = null;
let fileSettingsStorage: JsonFileStorage<NotificationSettings> | null = null;
let fileVoiceStorage: JsonFileStorage<VoiceNote[]> | null = null;

export function configureStorageFallbacks(options: {
  opportunitiesFile: string;
  notificationsFile: string;
  settingsFile: string;
  voiceNotesFile: string;
  initialOpportunities: Opportunity[];
  initialNotifications: AppNotification[];
  defaultSettings: NotificationSettings;
  initialVoiceNotes: VoiceNote[];
}) {
  fileOppStorage = new JsonFileStorage<Opportunity[]>(
    options.opportunitiesFile,
    options.initialOpportunities
  );
  fileNotifStorage = new JsonFileStorage<AppNotification[]>(
    options.notificationsFile,
    options.initialNotifications
  );
  fileSettingsStorage = new JsonFileStorage<NotificationSettings>(
    options.settingsFile,
    options.defaultSettings
  );
  fileVoiceStorage = new JsonFileStorage<VoiceNote[]>(
    options.voiceNotesFile,
    options.initialVoiceNotes
  );
}

/**
 * Initializes storage from Postgres (or file fallback).
 * Loads initial state into the in-memory cache.
 */
export async function initializeStorage(defaults: {
  initialOpportunities: Opportunity[];
  initialNotifications: AppNotification[];
  defaultSettings: NotificationSettings;
  initialVoiceNotes: VoiceNote[];
}): Promise<void> {
  const pool = getDbPool();

  if (pool) {
    try {
      // 1. Load opportunities
      const oppResult = await pool.query(
        'SELECT * FROM opportunities ORDER BY created_at DESC'
      );
      if (oppResult.rows.length > 0) {
        cachedOpportunities = oppResult.rows.map(mapRowToOpportunity);
      } else {
        // Seed default sample opportunities if database table is completely empty
        cachedOpportunities = [...defaults.initialOpportunities];
        await persistAllOpportunitiesToDb(cachedOpportunities);
      }

      // 2. Load notifications
      const notifResult = await pool.query(
        'SELECT * FROM notifications ORDER BY timestamp DESC'
      );
      if (notifResult.rows.length > 0) {
        cachedNotifications = notifResult.rows.map(mapRowToNotification);
      } else {
        cachedNotifications = [...defaults.initialNotifications];
        await persistAllNotificationsToDb(cachedNotifications);
      }

      // 3. Load voice notes
      const vnResult = await pool.query(
        'SELECT * FROM voice_notes ORDER BY created_at DESC'
      );
      if (vnResult.rows.length > 0) {
        cachedVoiceNotes = vnResult.rows.map(mapRowToVoiceNote);
      } else {
        cachedVoiceNotes = [...defaults.initialVoiceNotes];
        await persistAllVoiceNotesToDb(cachedVoiceNotes);
      }

      // 4. Load settings
      const settingsResult = await pool.query(
        'SELECT * FROM settings WHERE id = $1',
        ['default']
      );
      if (settingsResult.rows.length > 0) {
        cachedSettings = mapRowToSettings(settingsResult.rows[0]);
      } else {
        cachedSettings = { ...defaults.defaultSettings };
        await persistSettingsToDb(cachedSettings);
      }

      isInitialized = true;
      console.log('[Storage] Connected to Postgres. Loaded entities into active cache.');
      return;
    } catch (err) {
      console.error('[Storage] Error during Postgres storage init, falling back to local files:', err);
    }
  }

  // Fallback to local files if Postgres is not configured or fails
  if (fileOppStorage) cachedOpportunities = fileOppStorage.load();
  if (fileNotifStorage) cachedNotifications = fileNotifStorage.load();
  if (fileSettingsStorage) cachedSettings = fileSettingsStorage.load();
  if (fileVoiceStorage) cachedVoiceNotes = fileVoiceStorage.load();
  isInitialized = true;
}

// -------------------------------------------------------------
// EXACT SIGNATURE IMPLEMENTATIONS MAINTAINING BACKWARD COMPATIBILITY
// -------------------------------------------------------------

export function loadOpportunities(): Opportunity[] {
  if (cachedOpportunities !== null) {
    return cachedOpportunities;
  }
  if (fileOppStorage) {
    cachedOpportunities = fileOppStorage.load();
    return cachedOpportunities;
  }
  return [];
}

export function saveOpportunities(items: Opportunity[]): void {
  cachedOpportunities = items;

  // Persist to file if available
  if (fileOppStorage) {
    try {
      fileOppStorage.save(items);
    } catch (err) {
      console.error('[Storage] Error saving to file fallback:', err);
    }
  }

  // Persist to Postgres
  const pool = getDbPool();
  if (pool) {
    persistAllOpportunitiesToDb(items).catch((err) => {
      console.error('[Storage] Background write to Postgres opportunities table failed:', err);
    });
  }
}

export function loadNotifications(): AppNotification[] {
  if (cachedNotifications !== null) {
    return cachedNotifications;
  }
  if (fileNotifStorage) {
    cachedNotifications = fileNotifStorage.load();
    return cachedNotifications;
  }
  return [];
}

export function saveNotifications(items: AppNotification[]): void {
  cachedNotifications = items;

  if (fileNotifStorage) {
    try {
      fileNotifStorage.save(items);
    } catch (err) {
      console.error('[Storage] Error saving notifications to file fallback:', err);
    }
  }

  const pool = getDbPool();
  if (pool) {
    persistAllNotificationsToDb(items).catch((err) => {
      console.error('[Storage] Background write to Postgres notifications table failed:', err);
    });
  }
}

export function loadSettings(): NotificationSettings {
  if (cachedSettings !== null) {
    return cachedSettings;
  }
  if (fileSettingsStorage) {
    cachedSettings = fileSettingsStorage.load();
    return cachedSettings;
  }
  return {
    reminder14d: true,
    reminder7d: true,
    reminder3d: true,
    reminder1d: true,
    reminder0d: true,
    notifyOnChanges: true,
    notifyOnFailures: true,
    notifyOnOverdueTasks: true,
  };
}

export function saveSettings(settings: NotificationSettings): void {
  cachedSettings = settings;

  if (fileSettingsStorage) {
    try {
      fileSettingsStorage.save(settings);
    } catch (err) {
      console.error('[Storage] Error saving settings to file fallback:', err);
    }
  }

  const pool = getDbPool();
  if (pool) {
    persistSettingsToDb(settings).catch((err) => {
      console.error('[Storage] Background write to Postgres settings table failed:', err);
    });
  }
}

export function loadVoiceNotes(): VoiceNote[] {
  if (cachedVoiceNotes !== null) {
    return cachedVoiceNotes;
  }
  if (fileVoiceStorage) {
    cachedVoiceNotes = fileVoiceStorage.load();
    return cachedVoiceNotes;
  }
  return [];
}

export function saveVoiceNotes(items: VoiceNote[]): void {
  cachedVoiceNotes = items;

  if (fileVoiceStorage) {
    try {
      fileVoiceStorage.save(items);
    } catch (err) {
      console.error('[Storage] Error saving voice notes to file fallback:', err);
    }
  }

  const pool = getDbPool();
  if (pool) {
    persistAllVoiceNotesToDb(items).catch((err) => {
      console.error('[Storage] Background write to Postgres voice_notes table failed:', err);
    });
  }
}

// -------------------------------------------------------------
// POSTGRES PERSISTENCE & ROW MAPPING HELPERS
// -------------------------------------------------------------

async function persistAllOpportunitiesToDb(items: Opportunity[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert all current opportunities
    const query = `
      INSERT INTO opportunities (
        id, name, website_url, additional_sources, registration_url,
        category, organization, deadline, event_date, event_start_date,
        status, notes, tasks, tags, reminder_days_before, tracking,
        provenance, verified_fields, sources, last_research_timestamp,
        research_state, is_sample, voice_note_count, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24, $25
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        website_url = EXCLUDED.website_url,
        additional_sources = EXCLUDED.additional_sources,
        registration_url = EXCLUDED.registration_url,
        category = EXCLUDED.category,
        organization = EXCLUDED.organization,
        deadline = EXCLUDED.deadline,
        event_date = EXCLUDED.event_date,
        event_start_date = EXCLUDED.event_start_date,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        tasks = EXCLUDED.tasks,
        tags = EXCLUDED.tags,
        reminder_days_before = EXCLUDED.reminder_days_before,
        tracking = EXCLUDED.tracking,
        provenance = EXCLUDED.provenance,
        verified_fields = EXCLUDED.verified_fields,
        sources = EXCLUDED.sources,
        last_research_timestamp = EXCLUDED.last_research_timestamp,
        research_state = EXCLUDED.research_state,
        is_sample = EXCLUDED.is_sample,
        voice_note_count = EXCLUDED.voice_note_count,
        updated_at = EXCLUDED.updated_at;
    `;

    for (const opp of items) {
      await client.query(query, [
        opp.id,
        opp.name,
        opp.websiteUrl || null,
        JSON.stringify(opp.additionalSources || []),
        opp.registrationUrl || null,
        opp.category || 'hackathon',
        opp.organization || 'Independent',
        opp.deadline || null,
        opp.eventDate || null,
        opp.eventStartDate || null,
        opp.status || 'Interested',
        opp.notes || '',
        JSON.stringify(opp.tasks || []),
        JSON.stringify(opp.tags || []),
        JSON.stringify(opp.reminderDaysBefore || [14, 7, 3, 1, 0]),
        JSON.stringify(opp.tracking || {}),
        opp.provenance ? JSON.stringify(opp.provenance) : null,
        opp.verifiedFields ? JSON.stringify(opp.verifiedFields) : null,
        opp.sources ? JSON.stringify(opp.sources) : null,
        opp.lastResearchTimestamp || null,
        opp.researchState || null,
        Boolean(opp.isSample),
        opp.voiceNoteCount || 0,
        opp.createdAt || new Date().toISOString(),
        opp.updatedAt || new Date().toISOString(),
      ]);
    }

    // Delete records removed from items
    const ids = items.map((i) => i.id);
    if (ids.length > 0) {
      await client.query(
        'DELETE FROM opportunities WHERE id NOT IN (' + ids.map((_, idx) => `$${idx + 1}`).join(',') + ')',
        ids
      );
    } else {
      await client.query('DELETE FROM opportunities');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function persistAllNotificationsToDb(items: AppNotification[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO notifications (
        id, type, opportunity_id, opportunity_name, title,
        message, timestamp, created_at, read, urgency, action_url, details
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (id) DO UPDATE SET
        read = EXCLUDED.read,
        title = EXCLUDED.title,
        message = EXCLUDED.message,
        urgency = EXCLUDED.urgency,
        details = EXCLUDED.details;
    `;

    for (const notif of items) {
      await client.query(query, [
        notif.id,
        notif.type,
        notif.opportunityId || null,
        notif.opportunityName || null,
        notif.title,
        notif.message,
        notif.timestamp || new Date().toISOString(),
        notif.createdAt || notif.timestamp || new Date().toISOString(),
        Boolean(notif.read),
        notif.urgency || 'medium',
        notif.actionUrl || null,
        notif.details ? JSON.stringify(notif.details) : null,
      ]);
    }

    const ids = items.map((i) => i.id);
    if (ids.length > 0) {
      await client.query(
        'DELETE FROM notifications WHERE id NOT IN (' + ids.map((_, idx) => `$${idx + 1}`).join(',') + ')',
        ids
      );
    } else {
      await client.query('DELETE FROM notifications');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function persistAllVoiceNotesToDb(items: VoiceNote[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO voice_notes (
        id, opportunity_id, opportunity_name, transcription,
        summary, audio_data_url, duration_seconds, detected_entities, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )
      ON CONFLICT (id) DO UPDATE SET
        opportunity_id = EXCLUDED.opportunity_id,
        opportunity_name = EXCLUDED.opportunity_name,
        transcription = EXCLUDED.transcription,
        summary = EXCLUDED.summary,
        audio_data_url = EXCLUDED.audio_data_url,
        duration_seconds = EXCLUDED.duration_seconds,
        detected_entities = EXCLUDED.detected_entities;
    `;

    for (const vn of items) {
      await client.query(query, [
        vn.id,
        vn.opportunityId || null,
        vn.opportunityName || null,
        vn.transcription,
        vn.summary || null,
        vn.audioDataUrl || null,
        vn.durationSeconds || null,
        vn.detectedEntities ? JSON.stringify(vn.detectedEntities) : null,
        vn.createdAt || new Date().toISOString(),
      ]);
    }

    const ids = items.map((i) => i.id);
    if (ids.length > 0) {
      await client.query(
        'DELETE FROM voice_notes WHERE id NOT IN (' + ids.map((_, idx) => `$${idx + 1}`).join(',') + ')',
        ids
      );
    } else {
      await client.query('DELETE FROM voice_notes');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function persistSettingsToDb(settings: NotificationSettings): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;

  const query = `
    INSERT INTO settings (
      id, reminder14d, reminder7d, reminder3d, reminder1d, reminder0d,
      notify_on_changes, notify_on_failures, notify_on_overdue_tasks, updated_at
    ) VALUES (
      'default', $1, $2, $3, $4, $5, $6, $7, $8, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      reminder14d = EXCLUDED.reminder14d,
      reminder7d = EXCLUDED.reminder7d,
      reminder3d = EXCLUDED.reminder3d,
      reminder1d = EXCLUDED.reminder1d,
      reminder0d = EXCLUDED.reminder0d,
      notify_on_changes = EXCLUDED.notify_on_changes,
      notify_on_failures = EXCLUDED.notify_on_failures,
      notify_on_overdue_tasks = EXCLUDED.notify_on_overdue_tasks,
      updated_at = NOW();
  `;

  await pool.query(query, [
    settings.reminder14d ?? true,
    settings.reminder7d ?? true,
    settings.reminder3d ?? true,
    settings.reminder1d ?? true,
    settings.reminder0d ?? true,
    settings.notifyOnChanges ?? true,
    settings.notifyOnFailures ?? true,
    settings.notifyOnOverdueTasks ?? true,
  ]);
}

function mapRowToOpportunity(row: any): Opportunity {
  return {
    id: row.id,
    name: row.name,
    websiteUrl: row.website_url || '',
    additionalSources: Array.isArray(row.additional_sources) ? row.additional_sources : [],
    registrationUrl: row.registration_url || '',
    category: row.category || 'hackathon',
    organization: row.organization || 'Independent',
    deadline: row.deadline || '',
    eventDate: row.event_date || '',
    eventStartDate: row.event_start_date || undefined,
    status: row.status || 'Interested',
    notes: row.notes || '',
    tasks: Array.isArray(row.tasks) ? row.tasks : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    reminderDaysBefore: Array.isArray(row.reminder_days_before)
      ? row.reminder_days_before
      : [14, 7, 3, 1, 0],
    tracking: typeof row.tracking === 'object' && row.tracking !== null ? row.tracking : {
      lastChecked: null,
      status: 'not_checked',
      failedAttemptsCount: 0,
      changeLog: [],
      sources: {},
    },
    provenance: row.provenance || { origin: 'manual', verifiedByCheck: false },
    verifiedFields: row.verified_fields || undefined,
    sources: row.sources || undefined,
    lastResearchTimestamp: row.last_research_timestamp || undefined,
    researchState: row.research_state || undefined,
    isSample: Boolean(row.is_sample),
    voiceNoteCount: Number(row.voice_note_count) || 0,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function mapRowToNotification(row: any): AppNotification {
  return {
    id: row.id,
    type: row.type,
    opportunityId: row.opportunity_id || undefined,
    opportunityName: row.opportunity_name || undefined,
    title: row.title,
    message: row.message,
    timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    read: Boolean(row.read),
    urgency: row.urgency || 'medium',
    actionUrl: row.action_url || undefined,
    details: row.details || undefined,
  };
}

function mapRowToVoiceNote(row: any): VoiceNote {
  return {
    id: row.id,
    opportunityId: row.opportunity_id || undefined,
    opportunityName: row.opportunity_name || undefined,
    transcription: row.transcription || '',
    summary: row.summary || undefined,
    audioDataUrl: row.audio_data_url || undefined,
    durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : undefined,
    detectedEntities: row.detected_entities || undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

function mapRowToSettings(row: any): NotificationSettings {
  return {
    reminder14d: Boolean(row.reminder14d),
    reminder7d: Boolean(row.reminder7d),
    reminder3d: Boolean(row.reminder3d),
    reminder1d: Boolean(row.reminder1d),
    reminder0d: Boolean(row.reminder0d),
    notifyOnChanges: Boolean(row.notify_on_changes),
    notifyOnFailures: Boolean(row.notify_on_failures),
    notifyOnOverdueTasks: Boolean(row.notify_on_overdue_tasks),
  };
}
