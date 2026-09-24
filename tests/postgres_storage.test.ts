import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDbPool } from '../server/db.js';
import { SCHEMA_SQL } from '../server/schema.js';
import {
  loadOpportunities,
  saveOpportunities,
  loadNotifications,
  saveNotifications,
  loadSettings,
  saveSettings,
  loadVoiceNotes,
  saveVoiceNotes,
} from '../server/storage.js';
import { Opportunity, AppNotification, VoiceNote, NotificationSettings } from '../src/types.js';

describe('Step 5: PostgreSQL Database Storage & Persistence Tests', () => {
  it('schema definition contains all required tables and constraints', () => {
    assert.ok(SCHEMA_SQL.includes('CREATE TABLE IF NOT EXISTS opportunities'));
    assert.ok(SCHEMA_SQL.includes('CREATE TABLE IF NOT EXISTS notifications'));
    assert.ok(SCHEMA_SQL.includes('CREATE TABLE IF NOT EXISTS voice_notes'));
    assert.ok(SCHEMA_SQL.includes('CREATE TABLE IF NOT EXISTS settings'));
    assert.ok(SCHEMA_SQL.includes('additional_sources JSONB'));
    assert.ok(SCHEMA_SQL.includes('tasks JSONB'));
    assert.ok(SCHEMA_SQL.includes('tracking JSONB'));
    assert.ok(SCHEMA_SQL.includes('details JSONB'));
  });

  it('storage operations maintain synchronous in-memory read/write interface', () => {
    const oppId = `test_opp_${Date.now()}`;
    const initialCount = loadOpportunities().length;
    
    const newOpp: Opportunity = {
      id: oppId,
      name: 'Postgres Persistence Test Hackathon',
      websiteUrl: 'https://example.com/test-hackathon',
      category: 'hackathon',
      organization: 'Unit Test Org',
      status: 'Interested',
      deadline: '2026-10-31',
      notes: 'Testing storage persistence layer',
      tasks: [{ id: 'task-1', name: 'Submit project repo', completed: false, priority: 'high' }],
      tags: ['ai', 'security'],
      reminderDaysBefore: [14, 7, 3, 1, 0],
      tracking: {
        lastChecked: null,
        status: 'not_checked',
        failedAttemptsCount: 0,
        changeLog: [],
      },
      provenance: { origin: 'manual', verifiedByCheck: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const currentOpps = loadOpportunities();
    saveOpportunities([newOpp, ...currentOpps]);

    const reloadedOpps = loadOpportunities();
    assert.strictEqual(reloadedOpps.length, initialCount + 1);
    const found = reloadedOpps.find((o) => o.id === oppId);
    assert.ok(found);
    assert.strictEqual(found?.name, 'Postgres Persistence Test Hackathon');

    // Clean up
    saveOpportunities(reloadedOpps.filter((o) => o.id !== oppId));
    assert.strictEqual(loadOpportunities().length, initialCount);
  });

  it('notifications storage successfully saves and retrieves notifications', () => {
    const notifId = `test_notif_${Date.now()}`;
    const initialNotifs = loadNotifications();
    
    const newNotif: AppNotification = {
      id: notifId,
      type: 'deadline_reminder',
      title: 'Upcoming Registration Deadline',
      message: 'Registration closes in 3 days',
      timestamp: new Date().toISOString(),
      read: false,
      urgency: 'high',
      details: { daysLeft: 3 },
    };

    saveNotifications([newNotif, ...initialNotifs]);
    const reloaded = loadNotifications();
    const found = reloaded.find((n) => n.id === notifId);
    assert.ok(found);
    assert.strictEqual(found?.title, 'Upcoming Registration Deadline');

    // Clean up
    saveNotifications(reloaded.filter((n) => n.id !== notifId));
  });

  it('settings storage updates and preserves notification settings', () => {
    const current = loadSettings();
    const updated: NotificationSettings = {
      ...current,
      reminder14d: !current.reminder14d,
    };

    saveSettings(updated);
    const reloaded = loadSettings();
    assert.strictEqual(reloaded.reminder14d, updated.reminder14d);

    // Restore original
    saveSettings(current);
  });

  it('voice notes storage saves and retrieves notes with metadata', () => {
    const vnId = `test_vn_${Date.now()}`;
    const currentVns = loadVoiceNotes();

    const newVn: VoiceNote = {
      id: vnId,
      transcription: 'Spoken test transcription for voice note',
      summary: 'Spoken test transcription',
      createdAt: new Date().toISOString(),
    };

    saveVoiceNotes([newVn, ...currentVns]);
    const reloaded = loadVoiceNotes();
    const found = reloaded.find((v) => v.id === vnId);
    assert.ok(found);
    assert.strictEqual(found?.transcription, 'Spoken test transcription for voice note');

    // Clean up
    saveVoiceNotes(reloaded.filter((v) => v.id !== vnId));
  });
});
