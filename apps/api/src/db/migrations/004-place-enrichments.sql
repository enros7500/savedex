CREATE TABLE place_enrichments (
  place_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
