CREATE TABLE videos (
  id INTEGER PRIMARY KEY,
  normalized_url TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK(platform IN ('instagram','youtube')),
  title TEXT,
  added_at TEXT NOT NULL,
  added_day TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('idle','pending','processing','completed','review','error'))
);
CREATE INDEX videos_added ON videos(added_day, id);

CREATE TABLE batches (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  state TEXT NOT NULL CHECK(state IN ('running','stopping','stopped','completed')),
  summary_json TEXT CHECK(summary_json IS NULL OR json_valid(summary_json)),
  summary_dismissed_at TEXT
);

CREATE TABLE queue_entries (
  id INTEGER PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id),
  mode TEXT NOT NULL CHECK(mode IN ('normal','exhaustive')),
  queue_order INTEGER NOT NULL UNIQUE,
  enqueued_at TEXT NOT NULL,
  batch_id INTEGER REFERENCES batches(id),
  state TEXT NOT NULL CHECK(state IN ('pending','processing','completed','failed','removed')),
  run_id INTEGER REFERENCES runs(id),
  UNIQUE(id, video_id, mode)
);
CREATE UNIQUE INDEX queue_one_live_per_video ON queue_entries(video_id) WHERE state IN ('pending','processing');
CREATE INDEX queue_batch_order ON queue_entries(batch_id, state, queue_order);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id),
  queue_entry_id INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('normal','exhaustive')),
  state TEXT NOT NULL CHECK(state IN ('processing','success','partial','error')),
  completion_kind TEXT CHECK(completion_kind IN ('result','process_error','protocol_error','timeout')),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  stderr TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  exit_code INTEGER,
  error_message TEXT,
  manual_review TEXT NOT NULL DEFAULT 'none' CHECK(manual_review IN ('none','accepted','review')),
  reviewed_at TEXT,
  UNIQUE(id, video_id),
  FOREIGN KEY(queue_entry_id,video_id,mode) REFERENCES queue_entries(id,video_id,mode),
  CHECK((state='processing' AND finished_at IS NULL AND completion_kind IS NULL)
    OR (state<>'processing' AND finished_at IS NOT NULL AND completion_kind IS NOT NULL))
);
CREATE INDEX runs_history ON runs(video_id, id DESC);
CREATE INDEX runs_latest_valid ON runs(video_id, id DESC) WHERE state IN ('success','partial');

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL REFERENCES videos(id),
  extractor_item_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  evidence_ids_json TEXT NOT NULL CHECK(json_valid(evidence_ids_json)),
  FOREIGN KEY(run_id,video_id) REFERENCES runs(id,video_id),
  UNIQUE(run_id, extractor_item_id)
);
CREATE INDEX items_run_type ON items(run_id, type);
