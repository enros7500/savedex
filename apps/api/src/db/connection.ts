import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function openDatabase(filename: string): Database.Database {
  if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new Database(filename);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('journal_mode = WAL');
    db.transaction(() => {
      const version = db.pragma('user_version', { simple: true }) as number;
      const migrations = ['001-initial.sql', '002-events.sql', '003-run-steps.sql', '004-place-enrichments.sql'];
      if (version > migrations.length) throw new Error('La base de datos requiere una versión más reciente de Savedex');
      for (let index = version; index < migrations.length; index++) {
        db.exec(readFileSync(new URL(`./migrations/${migrations[index]}`, import.meta.url), 'utf8'));
        db.pragma(`user_version = ${index + 1}`);
      }
    }).immediate();
    return db;
  } catch (error) { db.close(); throw error; }
}
