// Local preview harness — runs worker.js against a local SQLite DB (node:sqlite)
// Usage: node scripts/preview.js [port]
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

(async () => {
  const port = parseInt(process.argv[2] || process.env.PORT || 8788, 10);
  const { DatabaseSync } = await import('node:sqlite');
  const bcryptMod = await import('bcryptjs');
  const bcrypt = bcryptMod.default || bcryptMod;

  const SCRIPT_DIR = __dirname;
  const ROOT = path.join(SCRIPT_DIR, '..');
  const DB_PATH = path.join(os.tmpdir(), 'ppau_preview.db');
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  const db = new DatabaseSync(DB_PATH);
  const schema = fs.readFileSync(path.join(ROOT, 'sql', 'schema.sql'), 'utf8');
  db.exec(schema);

  // Seed data
  const seed = () => {
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
    if (count.c > 0) return;
    const hash = bcrypt.hashSync('ppau-cpd2026', 10);
    db.prepare('INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run('PPAU Admin', 'katodavid233@gmail.com', hash, 'admin');

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const evals = [
      { title: 'POCKET SIZED SMALL SCALE MANUFACTURING', description: 'Enabling pharmacy professionals to do small scale manufacturing in Jik, sanitizers, herbal syrups, jelly, GV Paint, iodine tincture, hydrogen peroxide, creams, ointments, medicated herbal soaps etc.', venue: 'ONLINE (google meet)', event_date: '2026-09-12', event_time: '19:00', credit_points: 4, meet_link: 'https://meet.google.com/abc-defg-hij' },
      { title: 'LIVE SESSION TODAY — SMALL SCALE MANUFACTURING (REVISITED)', description: 'Live Google Meet session today at 12:15 PM. Join to have your attendance recorded automatically, then claim your CPD points after the session ends.', venue: 'ONLINE (google meet)', event_date: todayStr, event_time: '12:15', credit_points: 15, meet_link: 'https://meet.google.com/fca-spwr-cwp' },
      { title: 'FAMILY PLANNING', description: 'FAMILY PLANNING UNDER THE SELF CARE POLICY OF UGANDA. Enabling dispensers to provide family planning services to the public (including injectable family planning services).', venue: 'BLENDED (Physical and Online)', event_date: '2026-12-11', event_time: '09:00', credit_points: 20 },
      { title: 'URINARY TRACT INFECTIONS AS COMMON HEALTH CONDITION', description: 'The CPD will improve early recognition of UTIs, promote appropriate management and referral, strengthen antimicrobial stewardship, and improve patient safety.', venue: 'ONLINE (google meet)', event_date: '2027-02-21', event_time: '19:00', credit_points: 12, meet_link: 'https://meet.google.com/xyz-uvw-rst' }
    ];
    for (const e of evals) {
      db.prepare('INSERT INTO events (title, description, venue, event_date, event_time, credit_points, meet_link, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
        .run(e.title, e.description, e.venue, e.event_date, e.event_time, e.credit_points, e.meet_link || null);
    }

    // Sample claims + attendance for the first (past) event
    db.prepare("INSERT INTO claims (event_id, full_name, ppau_reg_no, ahpc_reg_no, email, contact_email, status, source) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'event')")
      .run(1, 'Jane Atim', 'PPAU-PRO-2026-00001', 'AHPC/DSP/12345', 'jane.atim@gmail.com', 'jane.atim@gmail.com');
    db.prepare("INSERT INTO claims (event_id, full_name, ppau_reg_no, ahpc_reg_no, email, contact_email, status, source) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'event')")
      .run(1, 'Kato David', 'PPAU-PRO-2026-00002', 'AHPC/DSP/12346', 'kato@yahoo.com', 'kato@yahoo.com');
    db.prepare("INSERT INTO claims (event_id, full_name, ppau_reg_no, ahpc_reg_no, email, contact_email, status, source) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'event')")
      .run(1, 'Grace Namuli', 'PPAU-PRO-2026-00003', 'AHPC/DSP/12347', 'grace@gmail.com', 'grace@gmail.com');
    db.prepare("INSERT INTO claims (event_id, full_name, ppau_reg_no, ahpc_reg_no, email, contact_email, status, source) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'event')")
      .run(1, 'Sarah Okello', 'PPAU-PRO-2026-00004', 'AHPC/DSP/12348', 'sarah@example.com', 'sarah@example.com');

    db.prepare('INSERT INTO event_attendance (event_id, full_name, email, joined_at, left_at, duration) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, 'Jane Atim', 'jane.atim@gmail.com', '7:00:10 PM', '7:58:30 PM', '58 min 20 sec');
    db.prepare('INSERT INTO event_attendance (event_id, full_name, email, joined_at, left_at, duration) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, 'Kato David', 'kato@yahoo.com', '7:03:45 PM', '8:00:02 PM', '56 min 17 sec');
    db.prepare('INSERT INTO event_attendance (event_id, full_name, email, joined_at, left_at, duration) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, 'Grace Namuli', 'grace@gmail.com', '7:01:20 PM', '7:59:55 PM', '58 min 35 sec');

    db.prepare('INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)').run('cpd_target', '30');
    console.log('Seeded demo data.');
  };
  seed();

  // D1-like adapter backed by node:sqlite
  const makeAdapter = () => {
    const run = (sql, args) => {
      const stmt = db.prepare(sql);
      return args.length ? stmt.run(...args) : stmt.run();
    };
    const all = (sql, args) => {
      const stmt = db.prepare(sql);
      return args.length ? stmt.all(...args) : stmt.all();
    };
    const first = (sql, args) => {
      const stmt = db.prepare(sql);
      const row = args.length ? stmt.get(...args) : stmt.get();
      return row || null;
    };
    return {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first(cols) {
                const row = first(sql, args);
                if (!row) return null;
                if (cols) {
                  if (Array.isArray(cols)) return cols.reduce((o, c) => { o[c] = row[c]; return o; }, {});
                  return { [cols]: row[cols] };
                }
                return row;
              },
              async all() { return { results: all(sql, args) }; },
              async run() {
                const info = run(sql, args);
                return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
              }
            };
          },
          async first(cols) {
            const row = first(sql, []);
            if (!row) return null;
            if (cols) {
              if (Array.isArray(cols)) return cols.reduce((o, c) => { o[c] = row[c]; return o; }, {});
              return { [cols]: row[cols] };
            }
            return row;
          },
          async all() { return { results: all(sql, []) }; },
          async run() {
            const info = run(sql, []);
            return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
          }
        };
      },
      async exec(sql) { db.exec(sql); return { success: true }; }
    };
  };

  const DB = makeAdapter();
  const env = { DB, R2: null, RESEND_API_KEY: '', EMAIL_FROM: '' };

  const { pathToFileURL } = require('url');
  const worker = (await import(pathToFileURL(path.join(ROOT, 'worker.js')).href)).default;

  const readBody = (req) => new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

  // Convert a Headers instance to a plain object for res.writeHead (set-cookie arrays preserved)
  const headersToObject = (headers) => {
    const out = {};
    for (const [k, v] of headers.entries()) {
      if (k.toLowerCase() === 'set-cookie') {
        if (!out[k]) out[k] = [];
        (Array.isArray(out[k]) ? out[k] : [out[k]]).push(v);
        continue;
      }
      if (k.toLowerCase() === 'content-type' && v.includes(',')) {
        out[k] = v.split(',')[0];
        continue;
      }
      out[k] = v;
    }
    return out;
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const url = `http://localhost:${port}${req.url}`;
        const request = new Request(url, { method: req.method, headers: req.headers });
        const response = await worker.fetch(request, env, {});
        res.writeHead(response.status, headersToObject(response.headers));
        res.write(Buffer.from(await response.arrayBuffer()));
        res.end();
      } else {
        const body = await readBody(req);
        const url = `http://localhost:${port}${req.url}`;
        const request = new Request(url, { method: req.method, headers: req.headers, body });
        const response = await worker.fetch(request, env, {});
        res.writeHead(response.status, headersToObject(response.headers));
        res.write(Buffer.from(await response.arrayBuffer()));
        res.end();
      }
    } catch (e) {
      console.error('Handler error:', e);
      res.writeHead(500);
      res.end(String(e && e.stack || e));
    }
  });

  server.listen(port, () => {
    console.log(`\nPreview running:  http://localhost:${port}`);
    console.log(`Admin login:      http://localhost:${port}/login  (katodavid233@gmail.com / ppau-cpd2026)`);
    console.log(`Member events:    http://localhost:${port}/member/events`);
    console.log(`Attendance demo:  http://localhost:${port}/admin/event/1/attendance`);
    console.log('Database file:    ' + DB_PATH + '\n');
  });
})().catch(e => { console.error(e); process.exit(1); });