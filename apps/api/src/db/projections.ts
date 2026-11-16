import type Database from 'better-sqlite3';
import type { ManualReview, VideoState } from '@savedex/contracts/api';
import type { ExtractResult } from '@savedex/contracts/extractor';
import { reviewState } from '../features/runs/review.js';

export function projectVideoState(db: Database.Database, videoId: number): void {
  const active = db.prepare<[number], { state: 'pending' | 'processing' }>("SELECT state FROM queue_entries WHERE video_id=? AND state IN ('pending','processing')").get(videoId);
  let state: VideoState = active?.state ?? 'idle';
  if (!active) {
    const latest = db.prepare<[number], { state: string; result_json: string | null; manual_review: ManualReview }>('SELECT state,result_json,manual_review FROM runs WHERE video_id=? ORDER BY id DESC LIMIT 1').get(videoId);
    if (latest) {
      state = latest.state === 'error' ? 'error' : latest.state === 'processing' ? 'processing'
        : reviewState(latest.result_json ? JSON.parse(latest.result_json) as ExtractResult : null, latest.manual_review).required ? 'review' : 'completed';
    }
  }
  db.prepare('UPDATE videos SET state=? WHERE id=?').run(state, videoId);
}
