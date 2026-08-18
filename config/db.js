let _sqlite;
function getSqlite() {
  if (!_sqlite) {
    try { _sqlite = require('node:sqlite'); } catch { _sqlite = require('sqlite'); }
  }
  return _sqlite;
}

class D1Adapter {
  constructor(binding) {
    this.binding = binding;
    this._localDb = null;
  }

  _getDb() {
    if (!this._localDb) {
      const sqlite = getSqlite();
      const Database = sqlite.Database || sqlite;
      this._localDb = new Database('data/local.db');
      this._initSchema();
    }
    return this._localDb;
  }

  _initSchema() {
    const db = this._getDb();
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      db.exec(sql);
    }
  }

  async prepare(sql) {
    if (this.binding) {
      return this.binding.prepare(sql);
    }
    const db = this._getDb();
    return {
      bind(...args) {
        return {
          async first(cols) {
            const stmt = db.prepare(sql.replace(/\?/g, (_, i) => `$${i + 1}`));
            const result = stmt.get(...args);
            if (!result) return null;
            if (cols) {
              if (Array.isArray(cols)) {
                return cols.reduce((o, c) => { o[c] = result[c]; return o; }, {});
              }
              return { [cols]: result[cols] };
            }
            return result;
          },
          async all() {
            const stmt = db.prepare(sql.replace(/\?/g, (_, i) => `$${i + 1}`));
            const results = stmt.all(...args);
            return { results };
          },
          async run() {
            const stmt = db.prepare(sql);
            const info = stmt.run(...args);
            return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
          }
        };
      },
      async first(cols) {
        const result = db.prepare(sql).get();
        if (!result) return null;
        if (cols) {
          if (Array.isArray(cols)) {
            return cols.reduce((o, c) => { o[c] = result[c]; return o; }, {});
          }
          return { [cols]: result[cols] };
        }
        return result;
      },
      async all() {
        return { results: db.prepare(sql).all() };
      },
      async run() {
        const info = db.prepare(sql).run();
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      }
    };
  }

  async exec(sql) {
    if (this.binding) {
      return this.binding.exec(sql);
    }
    const db = this._getDb();
    db.exec(sql);
    return { success: true };
  }
}

module.exports = { D1Adapter };
