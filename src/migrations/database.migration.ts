import { Migration } from "@mikro-orm/migrations";

export class DatabaseMigration extends Migration {
	up(): void {
		// source
		this.addSql(`
                CREATE TABLE source (
                  source_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  description TEXT,
                  display_order INTEGER NOT NULL,
                  created_at DATETIME NOT NULL,
                  updated_at DATETIME NOT NULL
                );
                `);
		// language
		this.addSql(`
                CREATE TABLE language (
                  language_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  description TEXT,
                  display_order INTEGER NOT NULL,
                  created_at DATETIME NOT NULL,
                  updated_at DATETIME NOT NULL
                );
                `);
		// tag
		this.addSql(`
                CREATE TABLE tag (
                  tag_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  description TEXT,
                  display_order INTEGER NOT NULL,
                  created_at DATETIME NOT NULL,
                  updated_at DATETIME NOT NULL
                );
                `);
		// note
		this.addSql(`
                CREATE TABLE note (
                  note_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                  internal_id TEXT NOT NULL,
                  title TEXT NOT NULL,
                  body TEXT NOT NULL,
                  date DATETIME NOT NULL,
                  source_id INTEGER NOT NULL,
                  language_id INTEGER NOT NULL,
                  created_at DATETIME NOT NULL,
                  updated_at DATETIME NOT NULL,
                  CONSTRAINT note_source_id_foreign FOREIGN KEY (
                    source_id
                  ) REFERENCES source(source_id) ON DELETE RESTRICT,
                  CONSTRAINT note_language_id_foreign FOREIGN KEY (
                    language_id
                  ) REFERENCES language(language_id) ON DELETE RESTRICT
                ); 
              `);
		this.addSql(`
                CREATE UNIQUE INDEX idx_note_internal_id ON note (internal_id);
                CREATE INDEX idx_note_source_id_internal_id ON note (source_id, internal_id);
                CREATE INDEX idx_note_language_id_source_id_internal_id ON note (language_id, source_id, internal_id);
                CREATE INDEX idx_note_date ON note (date);
                CREATE INDEX idx_note_created_at ON note (created_at);
            `);
		// note tag
		this.addSql(`
                CREATE TABLE note_tag (
                  note_tag_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                  note_id INTEGER NOT NULL,
                  tag_id INTEGER NOT NULL,
                  created_at DATETIME NOT NULL,
                  updated_at DATETIME NOT NULL,
                  CONSTRAINT note_tag_note_id_foreign FOREIGN KEY (
                    note_id
                  ) REFERENCES note (note_id) ON DELETE CASCADE ON UPDATE CASCADE,
                  CONSTRAINT note_tag_tag_id_foreign FOREIGN KEY (
                    tag_id
                  ) REFERENCES tag (tag_id) ON DELETE CASCADE ON UPDATE CASCADE
                ); 
              `);
		this.addSql(`
              CREATE UNIQUE INDEX idx_note_tag_note_id_tag_id ON note_tag (note_id, tag_id);
              CREATE INDEX idx_note_tag_note_id ON note_tag (note_id);
          `);
		// view
		this.addSql(`
                CREATE TABLE view (
                  view_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                  internal_id TEXT NOT NULL,
                  name TEXT NOT NULL,
                  source_id INTEGER NOT NULL,
                  language_id INTEGER NOT NULL,
                  display_order INTEGER NOT NULL,
                  created_at DATETIME NOT NULL,
                  updated_at DATETIME NOT NULL,
                  CONSTRAINT view_source_id_foreign FOREIGN KEY (
                    source_id
                  ) REFERENCES source(source_id) ON DELETE RESTRICT,
                  CONSTRAINT view_language_id_foreign FOREIGN KEY (
                    language_id
                  ) REFERENCES language(language_id) ON DELETE RESTRICT
                ); 
    `);
		this.addSql(`
                CREATE UNIQUE INDEX idx_view_internal_id ON view (internal_id);
                CREATE INDEX idx_view_source_id_language_id ON view (language_id, source_id);
    `);
		// view note
		this.addSql(`
                CREATE TABLE view_note (
                            view_note_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                            view_id INTEGER NOT NULL,
                            note_id INTEGER NOT NULL,
                            display_order INTEGER NOT NULL,
                            created_at DATETIME NOT NULL,
                            updated_at DATETIME NOT NULL,
                            CONSTRAINT view_note_view_id_foreign FOREIGN KEY (
                              view_id
                            ) REFERENCES view (view_id) ON DELETE CASCADE ON UPDATE CASCADE,
                            CONSTRAINT view_note_note_id_foreign FOREIGN KEY (
                              note_id
                            ) REFERENCES note (note_id) ON DELETE CASCADE ON UPDATE CASCADE
                          ); 
    `);
		this.addSql(`
                CREATE UNIQUE INDEX idx_view_id_note_id ON view_note (view_id, note_id);
                CREATE INDEX idx_view_note_view_id ON view_note (view_id);
  `);
		// note fts table
		this.addSql(`
                CREATE VIRTUAL TABLE note_fts5_index USING fts5 (title, body, content='note', content_rowid='note_id', tokenize = 'trigram');
              `);
		// triggers to keep the note fts index up to date.
		this.addSql(`
                CREATE TRIGGER note_after_insert AFTER INSERT ON note BEGIN
                  INSERT INTO note_fts5_index(rowid, title, body) VALUES (new.note_id, new.title, new.body);
                END;
                CREATE TRIGGER note_after_deleted AFTER DELETE ON note BEGIN
                  INSERT INTO note_fts5_index(note_fts5_index, rowid, title, body) VALUES('delete', old.note_id, old.title, old.body);
                END;
                CREATE TRIGGER note_after_update AFTER UPDATE ON note BEGIN
                  INSERT INTO note_fts5_index(note_fts5_index, rowid, title, body) VALUES('delete', old.note_id, old.title, old.body);
                  INSERT INTO note_fts5_index(rowid, title, body) VALUES (new.note_id, new.title, new.body);
                END;
              `);
	}
}
