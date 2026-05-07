import type Database from 'better-sqlite3';
import type { ScanProgressRow } from '../../shared/types.js';

export class ScanProgressRepository {
  constructor(private readonly db: Database.Database) {}

  create(rootPath: string, totalFiles: number): number {
    const result = this.db.prepare(`
      INSERT INTO scan_progress (root_path, total_files) VALUES (?, ?)
    `).run(rootPath, totalFiles);
    return Number(result.lastInsertRowid);
  }

  updateProgress(id: number, processedFiles: number, skippedFiles: number, lastFilePath: string): void {
    this.db.prepare(`
      UPDATE scan_progress
      SET processed_files = ?, skipped_files = ?, last_file_path = ?
      WHERE id = ?
    `).run(processedFiles, skippedFiles, lastFilePath, id);
  }

  incrementError(id: number): void {
    this.db.prepare(`
      UPDATE scan_progress SET error_count = error_count + 1 WHERE id = ?
    `).run(id);
  }

  complete(id: number): void {
    this.db.prepare(`
      UPDATE scan_progress
      SET status = 'completed', completed_at = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  fail(id: number, errorLog: string): void {
    this.db.prepare(`
      UPDATE scan_progress
      SET status = 'failed', completed_at = datetime('now'), error_log = ?
      WHERE id = ?
    `).run(errorLog, id);
  }

  getLatestRunning(rootPath: string): ScanProgressRow | undefined {
    return this.db.prepare(`
      SELECT * FROM scan_progress
      WHERE root_path = ? AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `).get(rootPath) as ScanProgressRow | undefined;
  }

  getLatest(): ScanProgressRow | undefined {
    return this.db.prepare(`
      SELECT * FROM scan_progress ORDER BY started_at DESC LIMIT 1
    `).get() as ScanProgressRow | undefined;
  }
}
