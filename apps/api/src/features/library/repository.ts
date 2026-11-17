import type Database from 'better-sqlite3';
import type { LibraryFilters, LibraryResult, LibraryItem, RunDetails, RunSummary } from '@savedex/contracts/api';
import { VideoRepository } from '../videos/repository.js';
import { RunRepository } from '../runs/repository.js';
import { getEnrichment, placeKey } from '../place-agent/repository.js';

function summary(run: RunDetails | undefined): RunSummary | null {
  if (!run) return null;
  const { result: _result, resultJson: _json, stderr: _stderr, reviewedAt: _at, workflow: _workflow, ...rest } = run;
  return rest;
}
function checkDay(day: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new Error('Fecha de incorporación no válida');
}
interface ItemRow {
  id: number; video_id: number; run_id: number; extractor_item_id: string;
  type: LibraryItem['type']; name: string; description: string; data_json: string; evidence_ids_json: string;
}
export class LibraryRepository {
  constructor(private readonly db: Database.Database) {}
  getLibrary(filters: LibraryFilters = {}): LibraryResult {
    if (filters.fromDay !== undefined) checkDay(filters.fromDay);
    if (filters.toDay !== undefined) checkDay(filters.toDay);
    if (filters.fromDay && filters.toDay && filters.fromDay > filters.toDay) throw new Error('Intervalo de fechas no válido');
    const search = filters.text?.trim().toLocaleLowerCase('es') ?? '';
    // A read transaction keeps result, latest attempt, items and review coherent across connections.
    return this.db.transaction(() => {
      const videos = new VideoRepository(this.db), runs = new RunRepository(this.db);
      const ids = this.db.prepare<[string | null, string | null, string | null, string | null], { id: number }>('SELECT id FROM videos WHERE (? IS NULL OR added_day>=?) AND (? IS NULL OR added_day<=?) ORDER BY added_at DESC,id DESC').all(filters.fromDay ?? null, filters.fromDay ?? null, filters.toDay ?? null, filters.toDay ?? null);
      const rows: LibraryResult['videos'] = [];
      for (const { id } of ids) {
        const latestAttempt = runs.getLatest(id);
        const run = runs.getLatest(id, true);
        const result = run?.result ?? null;
        const evidenceById = new Map(result?.evidence.map(e => [e.id, e]));
        const items: LibraryItem[] = run ? this.db.prepare<[number], ItemRow>('SELECT * FROM items WHERE run_id=? ORDER BY id').all(run.id).map(item => {
          const evidenceIds = JSON.parse(item.evidence_ids_json) as string[];
          return { id: item.id, videoId: item.video_id, runId: item.run_id, extractorItemId: item.extractor_item_id,
            enrichment: item.type==='place'?getEnrichment(this.db,placeKey(item)):null,
            type: item.type, name: item.name, description: item.description,
            data: JSON.parse(item.data_json) as LibraryItem['data'], evidenceIds,
            evidence: evidenceIds.map(evidenceId => {
              const evidence = evidenceById.get(evidenceId);
              if (!evidence) throw new Error('Evidencia almacenada ausente');
              return evidence;
            }),
          };
        }).filter(item => (!filters.type || item.type === filters.type) && (!search || `${item.name}\n${item.description}`.toLocaleLowerCase('es').includes(search))) : [];
        if ((filters.type || search) && items.length === 0) continue;
        rows.push({ video: videos.getVideo(id), run: summary(run), latestAttempt: summary(latestAttempt), result, items });
      }
      return { videos: rows, totalVideos: rows.length, totalItems: rows.reduce((sum, row) => sum + row.items.length, 0) };
    })();
  }
}
