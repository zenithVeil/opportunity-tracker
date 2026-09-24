import { getDbPool } from './db.js';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT,
  additional_sources JSONB DEFAULT '[]'::jsonb,
  registration_url TEXT,
  category TEXT DEFAULT 'hackathon',
  organization TEXT DEFAULT 'Independent',
  deadline TEXT,
  event_date TEXT,
  event_start_date TEXT,
  status TEXT DEFAULT 'Interested',
  notes TEXT DEFAULT '',
  tasks JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  reminder_days_before JSONB DEFAULT '[14, 7, 3, 1, 0]'::jsonb,
  tracking JSONB DEFAULT '{}'::jsonb,
  provenance JSONB,
  verified_fields JSONB,
  sources JSONB,
  last_research_timestamp TEXT,
  research_state TEXT,
  is_sample BOOLEAN DEFAULT false,
  voice_note_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  opportunity_id TEXT,
  opportunity_name TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN DEFAULT false,
  urgency TEXT DEFAULT 'medium',
  action_url TEXT,
  details JSONB
);

CREATE TABLE IF NOT EXISTS voice_notes (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT,
  opportunity_name TEXT,
  transcription TEXT NOT NULL,
  summary TEXT,
  audio_data_url TEXT,
  duration_seconds NUMERIC,
  detected_entities JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  reminder14d BOOLEAN DEFAULT true,
  reminder7d BOOLEAN DEFAULT true,
  reminder3d BOOLEAN DEFAULT true,
  reminder1d BOOLEAN DEFAULT true,
  reminder0d BOOLEAN DEFAULT true,
  notify_on_changes BOOLEAN DEFAULT true,
  notify_on_failures BOOLEAN DEFAULT true,
  notify_on_overdue_tasks BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_voice_notes_created_at ON voice_notes(created_at DESC);
`;

/**
 * Initializes tables if they do not exist.
 * Safe to run repeatedly (uses IF NOT EXISTS).
 */
export async function initializeDatabaseSchema(): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) {
    return false;
  }

  try {
    await pool.query(SCHEMA_SQL);
    console.log('[Postgres] Schema successfully verified/created for opportunities, notifications, voice_notes, settings.');
    return true;
  } catch (err) {
    console.error('[Postgres] Error ensuring database schema:', err);
    throw err;
  }
}
