CREATE TABLE run_steps (
 id INTEGER PRIMARY KEY,
 run_id INTEGER NOT NULL REFERENCES runs(id),
 event_key TEXT NOT NULL,
 sequence INTEGER,
 event_json TEXT NOT NULL,
 UNIQUE(run_id,event_key)
);
CREATE INDEX run_steps_order ON run_steps(run_id,sequence,id);
