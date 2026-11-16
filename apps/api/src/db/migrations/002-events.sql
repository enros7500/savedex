CREATE TABLE app_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  revision INTEGER NOT NULL CHECK(revision>=0 AND revision<=9007199254740990)
);
INSERT INTO app_state(singleton,revision) VALUES(1,0);
