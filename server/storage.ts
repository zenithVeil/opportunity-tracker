import fs from 'fs';
import path from 'path';

/**
 * Robust, atomic file storage with corrupt file preservation.
 * Prevents partial writes, race conditions, and silent data destruction.
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

  /**
   * Loads data from disk. If the file does not exist, writes the fallback atomically and returns it.
   * If the file is corrupt, backs it up to a .corrupt file to prevent data loss, rather than destroying it.
   */
  load(): T {
    if (!fs.existsSync(this.filePath)) {
      // First boot: write fallback cleanly
      this.save(this.defaultFallback);
      this.memoryCache = this.defaultFallback;
      return this.defaultFallback;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      if (!raw.trim()) {
        // Empty file - preserve it as well
        this.backupCorruptFile('empty');
        return this.defaultFallback;
      }
      const parsed = JSON.parse(raw) as T;
      this.memoryCache = parsed;
      return parsed;
    } catch (err) {
      console.error(`CRITICAL: Corrupted JSON detected at ${this.filePath}:`, err);
      // BACKUP CORRUPT FILE - NEVER OVERWRITE CORRUPT USER DATA
      this.backupCorruptFile('corrupt');
      return this.memoryCache !== null ? this.memoryCache : this.defaultFallback;
    }
  }

  /**
   * Saves data atomically by writing to a temporary file in the same directory,
   * then replacing the target file using atomic rename.
   */
  save(data: T): void {
    const dir = path.dirname(this.filePath);
    const tempFile = path.join(dir, `.${path.basename(this.filePath)}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    try {
      const json = JSON.stringify(data, null, 2);
      fs.writeFileSync(tempFile, json, 'utf-8');
      // Atomic replace
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
