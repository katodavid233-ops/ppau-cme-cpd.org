import { render } from './worker/views.bundle.cjs';
import { isValidPpauRegNo, normalizePpauRegNo, isValidAhpcRegNo } from './utils/validate.js';

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.woff2': 'font/woff2'
};

function parseCookies(header) {
  const obj = {};
  if (!header) return obj;
  header.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) obj[k.trim()] = decodeURIComponent(v.join('='));
  });
  return obj;
}

function setCookie(name, value, maxAge = 86400 * 7) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function renderView(name, data = {}) {
  const flash = data.flash || data._flash || {};
  return render(name, { ...data, flash });
}

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function htmlRes(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function flashCookie(type, message) {
  return '_flash=' + encodeURIComponent(JSON.stringify({ type, message })) + '; Path=/; Max-Age=5';
}

async function sendResendEmail({ to, subject, html }, DB, env) {
  const apiKey = (await getSetting(DB, 'email_api_key', '')) || (env && env.RESEND_API_KEY) || '';
  const from = (await getSetting(DB, 'email_from', '')) || (env && env.EMAIL_FROM) || 'PPAU CME-CPD <noreply@ppau-cme-cpd.org>';
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html })
    });
  } catch (e) { console.error('Email failed:', e); }
}

function certEmailHtml({ name, moduleTitle, points, certUrl }) {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="color:#0f766e;">PPAU CME-CPD Certificate</h2>
    <p>Dear ${name},</p>
    <p>Congratulations! You have earned <strong>${points} CPD points</strong> for completing "<strong>${moduleTitle}</strong>".</p>
    <p>Your certificate is ready:</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${certUrl}" style="background:#0f766e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">View Certificate</a>
    </p>
    <p style="color:#64748b;font-size:0.85em;">If you did not expect this email, please ignore it.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
    <p style="color:#94a3b8;font-size:0.75em;">PPAU CME-CPD Portal &mdash; Pharmacy Professionals Association of Uganda</p>
  </div>`;
}

function makeCertCode(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

function submissionConfirmationEmailHtml({ name, title, activityType = 'self_learning', points = 0, score = null, passMark = null, passed = null, certUrl = null, hasEvidence = false }) {
  const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let nextSteps = '';
  if (activityType === 'module') {
    nextSteps = passed
      ? `<p>Congratulations &mdash; you scored <strong>${esc(score)}%</strong> (pass mark ${esc(passMark)}%) and have been awarded <strong>${points} CPD points</strong>.</p>`
      : `<p>You scored <strong>${esc(score)}%</strong>. The pass mark is ${esc(passMark)}%, so no CPD points were awarded for this attempt. You are welcome to retake the quiz at any time.</p>`;
  } else if (activityType === 'event') {
    nextSteps = `<p><strong>What happens next:</strong> an administrator will verify your attendance and award your CPD points. You will receive another email once your claim has been processed.</p>`;
  } else {
    nextSteps = `${hasEvidence ? '<p>Your evidence file has been attached and will be reviewed by our team.</p>' : ''}
    <p><strong>What happens next:</strong> an administrator will review your activity and award CPD points. You will receive another email once your submission has been approved or if further information is needed.</p>
    <p style="color:#64748b;font-size:0.85em;">Please do not submit the same activity again — this will delay processing.</p>`;
  }

  const certHtml = certUrl
    ? `<p>Your certificate is ready:</p>
       <p style="text-align:center;margin:24px 0;">
         <a href="${certUrl}" style="background:#0f766e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">View Certificate</a>
       </p>`
    : '';

  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="color:#0f766e;">PPAU CME-CPD — Submission Confirmed</h2>
    <p>Dear ${esc(name)},</p>
    <p>We have received your CPD activity submission for "<strong>${esc(title)}</strong>".</p>
    ${nextSteps}
    ${certHtml}
    <p style="color:#64748b;font-size:0.85em;">If you did not expect this email, please ignore it.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
    <p style="color:#94a3b8;font-size:0.75em;">PPAU CME-CPD Portal &mdash; Pharmacy Professionals Association of Uganda</p>
  </div>`;
}

function submissionDecisionEmailHtml({ name, title, points, note, status, certUrl }) {
  const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const approved = status === 'approved';
  const statusLine = approved
    ? `<p>We are pleased to inform you that your CPD activity "<strong>${esc(title)}</strong>" has been <strong>approved</strong>. You have been awarded <strong>${points} CPD points</strong>.</p>`
    : `<p>Thank you for submitting your CPD activity "<strong>${esc(title)}</strong>". After review, we are unable to award CPD points at this time.</p>`;
  const noteHtml = note
    ? `<blockquote style="border-left:4px solid #0f766e;margin:16px 0;padding:8px 16px;background:#f1f5f9;border-radius:6px;color:#334155;">${esc(note)}</blockquote>`
    : '';
  const certHtml = approved
    ? `<p>Your certificate is ready:</p>
       <p style="text-align:center;margin:24px 0;">
         <a href="${certUrl}" style="background:#0f766e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">View Certificate</a>
       </p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="color:#0f766e;">PPAU CME-CPD Update</h2>
    <p>Dear ${esc(name)},</p>
    ${statusLine}
    ${noteHtml}
    ${certHtml}
    <p style="color:#64748b;font-size:0.85em;">If you did not expect this email, please ignore it.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
    <p style="color:#94a3b8;font-size:0.75em;">PPAU CME-CPD Portal &mdash; Pharmacy Professionals Association of Uganda</p>
  </div>`;
}

function normalizeMatch(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      row.push(field); field = '';
      if (row.some(c => c.trim())) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.trim() || row.length) {
    row.push(field);
    if (row.some(c => c.trim())) rows.push(row);
  }
  return rows;
}

function parseAttendanceCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  let nameIdx = -1;
  let firstNameIdx = -1;
  let lastNameIdx = -1;
  let emailIdx = -1;
  let joinIdx = -1;
  let leftIdx = -1;
  let durIdx = -1;
  header.forEach((h, i) => {
    if (firstNameIdx === -1 && (h === 'first name' || h === 'firstname' || h === 'first_name')) firstNameIdx = i;
    if (lastNameIdx === -1 && (h === 'last name' || h === 'lastname' || h === 'last_name')) lastNameIdx = i;
    if (nameIdx === -1 && h.includes('name') && i !== firstNameIdx && i !== lastNameIdx) nameIdx = i;
    if (emailIdx === -1 && h.includes('email')) emailIdx = i;
    if (joinIdx === -1 && (h.includes('join') || (h.includes('time') && !h.includes('duration')))) joinIdx = i;
    if (leftIdx === -1 && (h.includes('left') || h.includes('exit') || h.includes('end') || h.includes('leave'))) leftIdx = i;
    if (durIdx === -1 && h.includes('duration')) durIdx = i;
  });
  const attendees = [];
  for (const r of rows.slice(1)) {
    let fullName = (nameIdx >= 0 && r[nameIdx]) ? String(r[nameIdx]).trim() : '';
    if (!fullName && (firstNameIdx >= 0 || lastNameIdx >= 0)) {
      const first = (firstNameIdx >= 0 && r[firstNameIdx]) ? String(r[firstNameIdx]).trim() : '';
      const last = (lastNameIdx >= 0 && r[lastNameIdx]) ? String(r[lastNameIdx]).trim() : '';
      fullName = [first, last].filter(Boolean).join(' ');
    }
    const email = (emailIdx >= 0 && r[emailIdx]) ? String(r[emailIdx]).trim() : '';
    if (!fullName && !email) continue;
    attendees.push({
      full_name: fullName,
      email,
      joined_at: (joinIdx >= 0 && r[joinIdx]) ? String(r[joinIdx]).trim() : '',
      left_at: (leftIdx >= 0 && r[leftIdx]) ? String(r[leftIdx]).trim() : '',
      duration: (durIdx >= 0 && r[durIdx]) ? String(r[durIdx]).trim() : ''
    });
  }
  return attendees;
}

async function ensureSchema(DB) {
  try {
    const cols = await DB.prepare('PRAGMA table_info(events)').all();
    const has = (c) => (cols.results || []).some(x => x.name === c);
    if (!has('meet_link')) {
      await DB.prepare('ALTER TABLE events ADD COLUMN meet_link TEXT').run();
    }
    if (!has('event_end_time')) {
      await DB.prepare('ALTER TABLE events ADD COLUMN event_end_time TEXT').run();
    }
    const subCols = await DB.prepare('PRAGMA table_info(submissions)').all();
    const hasSub = (c) => (subCols.results || []).some(x => x.name === c);
    if (!hasSub('admin_note')) {
      await DB.prepare('ALTER TABLE submissions ADD COLUMN admin_note TEXT').run();
    }
    await DB.prepare(`CREATE TABLE IF NOT EXISTS event_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      joined_at TEXT,
      left_at TEXT,
      duration TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
    const attCols = await DB.prepare('PRAGMA table_info(event_attendance)').all();
    const hasAtt = (c) => (attCols.results || []).some(x => x.name === c);
    if (!hasAtt('status')) {
      await DB.prepare("ALTER TABLE event_attendance ADD COLUMN status TEXT DEFAULT 'pending'").run();
    }
  } catch (e) { console.error('ensureSchema:', e); }
}

function parseEventTime(timeStr) {
  if (!timeStr) return { h: 23, m: 59 };
  const t = timeStr.trim();
  const pmam = t.match(/am|pm/i);
  let hours = 23, mins = 59;
  const colon = t.indexOf(':');
  const dot = t.indexOf('.');
  if (colon >= 0) {
    const parts = t.split(':');
    hours = parseInt(parts[0], 10) || 0;
    const rest = parts[1] || '';
    mins = parseInt(rest.replace(/[^0-9]/g, ''), 10) || 0;
  } else if (dot >= 0) {
    const parts = t.split('.');
    hours = parseInt(parts[0], 10) || 0;
    const rest = parts[1] || '';
    mins = parseInt(rest.replace(/[^0-9]/g, ''), 10) || 0;
  } else {
    const num = parseInt(t.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) { hours = num; mins = 0; }
  }
  if (pmam) {
    const isPm = /pm/i.test(pmam[0]);
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
  }
  return { h: Math.min(23, Math.max(0, hours)), m: Math.min(59, Math.max(0, mins)) };
}

function eventEndDate(e) {
  if (!e.event_date) return null;
  const { h, m } = parseEventTime(e.event_end_time || e.event_time);
  return new Date(`${e.event_date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:59+03:00`);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = parseInt(parts[2], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[0], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return dateStr;
  return `${d} ${MONTHS[m] || parts[1]} ${y}`;
}

function formatEventTime(timeStr) {
  if (!timeStr) return '';
  const { h, m } = parseEventTime(timeStr);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatEventDateTime(dateStr, timeStr) {
  const date = formatEventDate(dateStr);
  const time = formatEventTime(timeStr);
  if (date && time) return `${date} at ${time} EAT`;
  if (date) return date;
  return '';
}

function formatEventTimeRange(timeStr, endTimeStr) {
  if (!timeStr) return '';
  const start = formatEventTime(timeStr);
  const end = endTimeStr ? formatEventTime(endTimeStr) : '';
  return end ? `${start} – ${end} EAT` : `${start} EAT`;
}

function attendanceScore(claim, a) {
  const cEmail = normalizeMatch(claim.contact_email || claim.email);
  const cName = normalizeMatch(claim.full_name);
  const aEmail = normalizeMatch(a.email);
  const aName = normalizeMatch(a.full_name);
  if (cEmail && aEmail && cEmail === aEmail) return 3;
  if (cName && aName && cName === aName) return 2;
  if (cName && aName) {
    const cTokens = cName.split(' ').filter(t => t.length > 1);
    const aTokens = aName.split(' ').filter(t => t.length > 1);
    const overlap = cTokens.filter(t => aTokens.includes(t)).length;
    const ratio = overlap / Math.max(cTokens.length, aTokens.length, 1);
    if (overlap > 0 && ratio >= 0.5) return 1;
  }
  return 0;
}

function findAttendanceMatch(claim, attendees) {
  let best = null;
  let bestScore = 0;
  for (const a of (attendees || [])) {
    if (a.status === 'rejected') continue;
    const s = attendanceScore(claim, a);
    if (s >= 2 && s > bestScore) { best = a; bestScore = s; }
  }
  return best;
}

function findAttendanceCandidates(claim, attendees, limit = 4) {
  return (attendees || [])
    .filter(a => a.status !== 'rejected')
    .map(a => ({ a, s: attendanceScore(claim, a) }))
    .filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map(x => x.a);
}

function matchesClaimToAttendance(claim, attendees) {
  return !!findAttendanceMatch(claim, attendees);
}

async function findClaimForAttendance(DB, eventId, att) {
  if (!att || (!att.email && !att.full_name)) return null;
  if (att.email) {
    const byEmail = await DB.prepare('SELECT * FROM claims WHERE event_id = ? AND contact_email = ? ORDER BY id DESC LIMIT 1').bind(eventId, att.email).first();
    if (byEmail) return byEmail;
  }
  if (att.full_name) {
    const all = await DB.prepare('SELECT * FROM claims WHERE event_id = ?').bind(eventId).all();
    const name = normalizeMatch(att.full_name);
    return (all.results || []).find(c => name && normalizeMatch(c.full_name) === name) || null;
  }
  return null;
}

function formatAttendanceTime(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
    try {
      return new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Kampala', hour12: true });
    } catch (e) { return iso; }
  }
  return iso;
}

function durationMinutes(fromVal, toVal) {
  const a = Date.parse(fromVal);
  const b = Date.parse(toVal);
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

function formatDurationFromCols(joined_at, left_at, duration) {
  if (duration) return String(duration);
  const mins = durationMinutes(joined_at, left_at);
  return mins === null ? '' : `${mins} min`;
}

function parseDurationMinutes(value) {
  if (value == null) return NaN;
  const s = String(value);
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m/);
  if (h || m) return (h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0);
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

async function getSetting(DB, key, def) {
  try {
    const r = await DB.prepare('SELECT setting_value FROM settings WHERE setting_key = ?').bind(key).first();
    return r && r.setting_value != null ? r.setting_value : def;
  } catch (e) { return def; }
}

async function autoApproveClaim(DB, claim, event, minMinutes, opts) {
  const attendance = await DB.prepare('SELECT * FROM event_attendance WHERE event_id = ?').bind(claim.event_id).all();
  const rec = findAttendanceMatch(claim, attendance.results || []);
  if (!rec) return 'nomatch';
  let mins = parseDurationMinutes(rec.duration);
  if (!isFinite(mins)) mins = durationMinutes(rec.joined_at, rec.left_at);
  if (mins === null || !isFinite(mins)) return 'noduration';
  if (mins < minMinutes) return 'short';
  const certCode = makeCertCode('PPAU-EVT');
  await DB.prepare('UPDATE claims SET status = ?, score = ?, passed = ?, points_awarded = ?, certificate_code = ? WHERE id = ?')
    .bind('approved', 100, 1, event.credit_points, certCode, claim.id).run();
  if (claim.contact_email && opts && opts.origin) {
    const certUrl = `${opts.origin}/member/certificate/${certCode}`;
    await sendResendEmail({
      to: claim.contact_email,
      subject: `Your CPD Certificate — ${event.title}`,
      html: certEmailHtml({ name: claim.full_name, moduleTitle: event.title, points: event.credit_points, certUrl })
    }, DB, opts.env);
  }
  return 'approved';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const DB = env.DB;

    const cookies = parseCookies(request.headers.get('Cookie'));
    const sessionToken = cookies.session || '';
    let isAdmin = false;

    await ensureSchema(DB);

    if (sessionToken) {
      try {
        const user = await DB.prepare('SELECT id, full_name, email, role FROM users WHERE id = ?').bind(parseInt(sessionToken)).first();
        if (user && user.role === 'admin') isAdmin = true;
      } catch (e) {}
    }

    let flashData = {};
    if (cookies._flash) {
      try { flashData = JSON.parse(decodeURIComponent(cookies._flash)); } catch (e) {}
    }

    // Fetch notifications for navbar
    let notifications = [];
    let notifCount = 0;
    try {
      const notifResult = await DB.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10').all();
      notifications = notifResult.results || [];
      const countResult = await DB.prepare('SELECT COUNT(*) as count FROM notifications').first();
      notifCount = countResult?.count || 0;
    } catch (e) { /* table may not exist yet */ }

    const viewData = { flash: flashData, notifications, notifCount, isAdmin };

    // Static files — serve from R2 or public asset bundle
    if (path.startsWith('/css/') || path.startsWith('/js/') || path.startsWith('/images/')) {
      if (env.R2) {
        const key = path.slice(1);
        const obj = await env.R2.get(key);
        if (obj) {
          const ext = path.match(/\.\w+$/)?.[0] || '.html';
          return new Response(obj.body, {
            headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' }
          });
        }
      }
      return new Response('Not found', { status: 404 });
    }

    // ======== ROUTES ========

    // HOME
    if (path === '/' && method === 'GET') {
      const upcomingEvents = await DB.prepare('SELECT * FROM events WHERE is_published = 1 ORDER BY event_date ASC').all();
      const now = new Date();
      const upcomingOnly = (upcomingEvents.results || [])
        .filter(e => !e.event_date || now < eventEndDate(e))
        .slice(0, 3);
      const providers = await DB.prepare('SELECT * FROM cpd_providers WHERE is_active = 1 ORDER BY sort_order ASC').all().catch(() => ({ results: [] }));
      const evRows = upcomingOnly.map(e => ({
        ...e,
        date_display: formatEventDate(e.event_date),
        time_display: formatEventTime(e.event_time),
        datetime_display: formatEventDateTime(e.event_date, e.event_time)
      }));
      return htmlRes(renderView('index', { ...viewData, events: evRows, providers: providers.results || [] }));
    }

    // CPD ARTICLES
    if (path === '/cpd-articles' && method === 'GET') {
      return htmlRes(renderView('cpd-articles', viewData));
    }

    // LOGIN
    if (path === '/login' && method === 'GET') {
      return htmlRes(renderView('auth/login', viewData));
    }
    if (path === '/login' && method === 'POST') {
      const body = await request.formData();
      const email = body.get('email');
      const password = body.get('password');
      const bcrypt = await import('bcryptjs');
      const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (!user || !bcrypt.default.compareSync(password, user.password_hash)) {
        const resp = redirect('/login');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Invalid email or password.'));
        return resp;
      }
      const resp = redirect('/admin');
      resp.headers.append('Set-Cookie', setCookie('session', String(user.id)));
      return resp;
    }

    // LOGOUT
    if (path === '/logout' && method === 'GET') {
      const resp = redirect('/');
      resp.headers.append('Set-Cookie', 'session=; Path=/; Max-Age=0');
      return resp;
    }

    // MEMBER START
    if (path === '/member/start' && method === 'GET') {
      return htmlRes(renderView('member/start', viewData));
    }

    // MEMBER MODULES (list)
    if (path === '/member/modules' && method === 'GET') {
      const style = url.searchParams.get('style') || '';
      let modules;
      if (style) {
        modules = await DB.prepare('SELECT m.*, s.name as style_name, s.slug as style FROM modules m LEFT JOIN cpd_styles s ON m.style_id = s.id WHERE m.is_published = 1 AND s.slug = ? ORDER BY m.id ASC').bind(style).all();
      } else {
        modules = await DB.prepare('SELECT m.*, s.name as style_name, s.slug as style FROM modules m LEFT JOIN cpd_styles s ON m.style_id = s.id WHERE m.is_published = 1 ORDER BY m.id ASC').all();
      }
      return htmlRes(renderView('member/modules', { ...viewData, modules: modules.results || [], currentStyle: style }));
    }

    // MEMBER MODULE DETAIL
    const moduleMatch = path.match(/^\/member\/module\/(\d+)$/);
    if (moduleMatch && method === 'GET') {
      const moduleId = parseInt(moduleMatch[1]);
      const mod = await DB.prepare('SELECT m.*, s.name as style_name, s.slug as style FROM modules m LEFT JOIN cpd_styles s ON m.style_id = s.id WHERE m.id = ?').bind(moduleId).first();
      if (!mod) return redirect('/member/modules');
      return htmlRes(renderView('member/module_detail', { ...viewData, mod }));
    }

    // MEMBER QUIZ
    const quizMatch = path.match(/^\/member\/module\/(\d+)\/quiz$/);
    if (quizMatch && method === 'GET') {
      const moduleId = parseInt(quizMatch[1]);
      const mod = await DB.prepare('SELECT m.*, s.name as style_name, s.slug as style FROM modules m LEFT JOIN cpd_styles s ON m.style_id = s.id WHERE m.id = ?').bind(moduleId).first();
      if (!mod) return redirect('/member/modules');
      const questions = await DB.prepare('SELECT * FROM questions WHERE module_id = ? ORDER BY id ASC').bind(moduleId).all();
      return htmlRes(renderView('member/quiz', { ...viewData, mod, questions: questions.results || [] }));
    }

    // MEMBER QUIZ SUBMIT
    if (quizMatch && method === 'POST') {
      const moduleId = parseInt(quizMatch[1]);
      const mod = await DB.prepare('SELECT m.*, s.name as style_name, s.slug as style FROM modules m LEFT JOIN cpd_styles s ON m.style_id = s.id WHERE m.id = ?').bind(moduleId).first();
      if (!mod) return redirect('/member/modules');

      const body = await request.formData();
      const full_name = body.get('full_name') || '';
      const ppau_reg_no = normalizePpauRegNo(body.get('ppau_reg_no'));
      const ahpc_reg_no = body.get('ahpc_reg_no') || '';
      const email = body.get('email') || '';

      if (!isValidPpauRegNo(ppau_reg_no)) {
        const resp = redirect(`/member/module/${moduleId}/quiz`);
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Invalid PPAU registration number format. Use PPAU-PRO-YYYY-NNNNN.'));
        return resp;
      }
      if (!isValidAhpcRegNo(ahpc_reg_no)) {
        const resp = redirect(`/member/module/${moduleId}/quiz`);
        resp.headers.append('Set-Cookie', flashCookie('danger', 'AHPC Registration Number must be digits only.'));
        return resp;
      }

      const questions = await DB.prepare('SELECT * FROM questions WHERE module_id = ?').bind(moduleId).all();
      let correctCount = 0;
      const total = (questions.results || []).length;
      for (const q of (questions.results || [])) {
        const answer = body.get(`q_${q.id}`);
        if (answer && answer.toLowerCase() === q.correct.toLowerCase()) correctCount++;
      }

      const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
      const passed = score >= mod.pass_mark ? 1 : 0;
      const pointsAwarded = passed ? mod.credit_points : 0;
      const certCode = makeCertCode('PPAU-CME');
      const placeholderEmail = email || `member_${Date.now()}_${Math.random().toString(36).substr(2, 4)}@ppau-cpd.local`;
      const contactEmail = email || null;

      await DB.prepare(
        'INSERT INTO claims (module_id, full_name, ppau_reg_no, ahpc_reg_no, email, contact_email, score, passed, points_awarded, certificate_code, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(moduleId, full_name, ppau_reg_no, ahpc_reg_no, placeholderEmail, contactEmail, score, passed, pointsAwarded, certCode, passed ? 'approved' : 'pending', 'module').run();

      if (contactEmail) {
        const certUrl = passed ? `${url.origin}/member/certificate/${certCode}` : null;
        await sendResendEmail({
          to: contactEmail,
          subject: `Submission confirmed — ${mod.title}`,
          html: submissionConfirmationEmailHtml({ name: full_name, title: mod.title, activityType: 'module', points: pointsAwarded, score, passMark: mod.pass_mark, passed: !!passed, certUrl })
        }, DB, env);
      }

      return htmlRes(renderView('member/quiz_result', {
        mod, score, passed: !!passed, pointsAwarded, correct: correctCount, total, certCode, full_name, ppau_reg_no, ahpc_reg_no, ...viewData
      }));
    }

    // MEMBER EVENTS (list)
    if (path === '/member/events' && method === 'GET') {
      const events = await DB.prepare('SELECT * FROM events WHERE is_published = 1 ORDER BY event_date ASC').all();
      const now = new Date();
      const rows = (events.results || []).map(e => {
        let ended = true;
        if (e.event_date) {
          ended = now >= eventEndDate(e);
        }
        return {
          ...e,
          ended,
          date_display: formatEventDate(e.event_date),
          time_display: formatEventTimeRange(e.event_time, e.event_end_time),
          datetime_display: formatEventDateTime(e.event_date, e.event_time)
        };
      });
      const upcoming = rows.filter(e => !e.ended);
      const past = rows.filter(e => e.ended);
      return htmlRes(renderView('member/events', { ...viewData, events: rows, upcoming, past }));
    }

    // MEMBER EVENT JOIN (auto-records attendance, opens Meet)
    const eventJoinMatch = path.match(/^\/member\/event\/(\d+)\/join$/);
    if (eventJoinMatch && method === 'GET') {
      const eventId = parseInt(eventJoinMatch[1]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      if (!event) return redirect('/member/events');
      if (event.event_date && new Date() >= eventEndDate(event)) {
        const resp = redirect('/member/events');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'This session has ended and can no longer be joined. You can still claim your CPD points.'));
        return resp;
      }
      return htmlRes(renderView('member/join', { ...viewData, event, time_display: formatEventTimeRange(event.event_time, event.event_end_time) }));
    }
    if (eventJoinMatch && method === 'POST') {
      const eventId = parseInt(eventJoinMatch[1]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      if (!event) return redirect('/member/events');
      if (event.event_date && new Date() >= eventEndDate(event)) {
        const resp = redirect('/member/events');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'This session has ended and can no longer be joined. You can still claim your CPD points.'));
        return resp;
      }

      const body = await request.formData();
      const full_name = (body.get('full_name') || '').trim();
      const email = (body.get('email') || '').trim().toLowerCase();

      if (!email) {
        const resp = redirect(`/member/event/${eventId}/join`);
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Email is required so we can record your attendance.'));
        return resp;
      }

      const existing = await DB.prepare('SELECT id FROM event_attendance WHERE event_id = ? AND email = ?').bind(eventId, email).first();
      const joinedAtIso = new Date().toISOString();
      if (!existing) {
        await DB.prepare('INSERT INTO event_attendance (event_id, full_name, email, joined_at) VALUES (?, ?, ?, ?)')
          .bind(eventId, full_name || email, email, joinedAtIso).run();
      }

      const joinedAtDisplay = formatAttendanceTime(joinedAtIso);
      return htmlRes(renderView('member/join', { ...viewData, event, time_display: formatEventTimeRange(event.event_time, event.event_end_time), joined: true, full_name, email, joined_at: joinedAtDisplay }));
    }

    // MEMBER EVENT LEAVE (best-effort beacon sent when the member closes the join tab)
    const eventLeaveMatch = path.match(/^\/member\/event\/(\d+)\/leave$/);
    if (eventLeaveMatch && method === 'POST') {
      const eventId = parseInt(eventLeaveMatch[1]);
      const body = await request.formData();
      const email = (body.get('email') || '').trim().toLowerCase();
      if (email) {
        const row = await DB.prepare('SELECT id, joined_at FROM event_attendance WHERE event_id = ? AND email = ? AND left_at IS NULL ORDER BY id DESC LIMIT 1').bind(eventId, email).first();
        if (row) {
          const leftIso = new Date().toISOString();
          const mins = durationMinutes(row.joined_at, leftIso);
          await DB.prepare('UPDATE event_attendance SET left_at = ?, duration = ? WHERE id = ?')
            .bind(leftIso, mins !== null ? `${mins} min` : null, row.id).run();
        }
      }
      return new Response(null, { status: 204 });
    }

    // MEMBER EVENT CLAIM
    const eventClaimMatch = path.match(/^\/member\/event\/(\d+)\/claim$/);
    if (eventClaimMatch && method === 'POST') {
      const eventId = parseInt(eventClaimMatch[1]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      if (!event) return redirect('/member/events');

      if (event.event_date) {
        const now = new Date();
        const eventEnd = eventEndDate(event);
        if (now < eventEnd) {
          const resp = redirect('/member/events');
          resp.headers.append('Set-Cookie', flashCookie('danger', 'You can only claim points after this event has ended.'));
          return resp;
        }
      }

      const body = await request.formData();
      const full_name = body.get('full_name') || '';
      const ppau_reg_no = normalizePpauRegNo(body.get('ppau_reg_no'));
      const ahpc_reg_no = body.get('ahpc_reg_no') || '';
      const email = (body.get('email') || '').trim().toLowerCase();

      if (!isValidPpauRegNo(ppau_reg_no)) {
        const resp = redirect('/member/events');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Invalid PPAU registration number format. Use PPAU-PRO-YYYY-NNNNN.'));
        return resp;
      }
      if (!isValidAhpcRegNo(ahpc_reg_no)) {
        const resp = redirect('/member/events');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'AHPC Registration Number must be digits only.'));
        return resp;
      }

      if (!email) {
        const resp = redirect('/member/events');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Email is required so we can verify your attendance.'));
        return resp;
      }

      const existing = await DB.prepare('SELECT id FROM claims WHERE event_id = ? AND contact_email = ?').bind(eventId, email).first();
      if (existing) {
        const resp = redirect('/member/events');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'You have already claimed points for this event with that email.'));
        return resp;
      }

      await DB.prepare(
        'INSERT INTO claims (event_id, full_name, ppau_reg_no, ahpc_reg_no, email, contact_email, score, passed, points_awarded, certificate_code, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(eventId, full_name, ppau_reg_no, ahpc_reg_no, email, email, null, 0, 0, null, 'pending', 'event').run();

      await sendResendEmail({
        to: email,
        subject: `Claim received — ${event.title}`,
        html: submissionConfirmationEmailHtml({ name: full_name || email, title: event.title, activityType: 'event' })
      }, DB, env);

      const resp = redirect('/member/events');
      resp.headers.append('Set-Cookie', flashCookie('success', 'Claim received! An administrator will verify your attendance and approve your CPD points and certificate.'));
      return resp;
    }

    // MEMBER SELF-LEARNING
    if (path === '/member/self-learning' && method === 'GET') {
      const reg = normalizePpauRegNo(url.searchParams.get('reg') || '');
      let mySubmissions = [];
      if (reg) {
        const result = await DB.prepare('SELECT * FROM submissions WHERE ppau_reg_no = ? ORDER BY created_at DESC').bind(reg).all();
        mySubmissions = result.results || [];
      }
      return htmlRes(renderView('member/self_learning', { ...viewData, submissions: mySubmissions, lookupReg: reg }));
    }
    if (path === '/member/self-learning' && method === 'POST') {
      const body = await request.formData();
      const full_name = body.get('full_name') || '';
      const ppau_reg_no = normalizePpauRegNo(body.get('ppau_reg_no'));
      const ahpc_reg_no = body.get('ahpc_reg_no') || '';
      const email = body.get('email') || '';
      const title = body.get('title') || '';
      const description = body.get('description') || '';

      if (!isValidPpauRegNo(ppau_reg_no)) {
        const resp = redirect('/member/self-learning');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Invalid PPAU registration number format. Use PPAU-PRO-YYYY-NNNNN.'));
        return resp;
      }
      if (!isValidAhpcRegNo(ahpc_reg_no)) {
        const resp = redirect('/member/self-learning');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'AHPC Registration Number must be digits only.'));
        return resp;
      }
      if (!email || !email.includes('@')) {
        const resp = redirect('/member/self-learning');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'A valid email address is required.'));
        return resp;
      }

      let evidenceFile = null;
      const file = body.get('evidence_file');
      if (file && file.size > 0 && env.R2) {
        const key = `evidence/${Date.now()}_${file.name}`;
        await env.R2.put(key, file, { httpMetadata: { contentType: file.type } });
        evidenceFile = key;
      }

      await DB.prepare(
        'INSERT INTO submissions (full_name, ppau_reg_no, ahpc_reg_no, email, title, description, evidence_file) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(full_name, ppau_reg_no, ahpc_reg_no, email, title, description, evidenceFile).run();

      if (email) {
        await sendResendEmail({
          to: email,
          subject: `Submission confirmed — ${title}`,
          html: submissionConfirmationEmailHtml({ name: full_name, title, activityType: 'self_learning', hasEvidence: !!evidenceFile })
        }, DB, env);
      }

      const resp = redirect(`/member/self-learning?reg=${encodeURIComponent(ppau_reg_no)}`);
      resp.headers.append('Set-Cookie', flashCookie('success', 'Submission received! Our team will review it and award points.'));
      return resp;
    }

    // MEMBER CERTIFICATE
    const certMatch = path.match(/^\/member\/certificate\/([\w-]+)$/);
    if (certMatch && method === 'GET') {
      const code = certMatch[1];
      const claim = await DB.prepare('SELECT c.*, m.title as module_title, e.title as event_title FROM claims c LEFT JOIN modules m ON c.module_id = m.id LEFT JOIN events e ON c.event_id = e.id WHERE c.certificate_code = ?').bind(code).first();
      const submission = await DB.prepare('SELECT * FROM submissions WHERE certificate_code = ?').bind(code).first();
      const item = claim || submission;
      if (!item) return redirect('/');
      return htmlRes(renderView('member/certificate', { ...viewData, item, certCode: code }));
    }

    // ADMIN DASHBOARD
    if (path === '/admin' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const totalModules = await DB.prepare('SELECT COUNT(*) as count FROM modules').first();
      const totalEvents = await DB.prepare('SELECT COUNT(*) as count FROM events').first();
      const totalClaims = await DB.prepare("SELECT COUNT(*) as count FROM claims WHERE status = 'approved'").first();
      const totalUsers = await DB.prepare('SELECT COUNT(*) as count FROM users').first();
      const pendingSubmissions = await DB.prepare("SELECT COUNT(*) as count FROM submissions WHERE status = 'pending'").first();
      const recentClaims = await DB.prepare('SELECT * FROM claims ORDER BY created_at DESC LIMIT 10').all();
      return htmlRes(renderView('admin/dashboard', {
        totalModules: totalModules?.count || 0,
        totalEvents: totalEvents?.count || 0,
        totalClaims: totalClaims?.count || 0,
        totalUsers: totalUsers?.count || 0,
        pendingSubmissions: pendingSubmissions?.count || 0,
        recentClaims: recentClaims.results || [],
        ...viewData
      }));
    }

    // ADMIN MODULES
    if (path === '/admin/modules' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const modules = await DB.prepare('SELECT m.*, s.name as style_name FROM modules m LEFT JOIN cpd_styles s ON m.style_id = s.id ORDER BY m.id ASC').all();
      return htmlRes(renderView('admin/modules', { ...viewData, modules: modules.results || [] }));
    }

    // ADMIN ADD MODULE
    if (path === '/admin/modules/new' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const styles = await DB.prepare('SELECT * FROM cpd_styles').all();
      return htmlRes(renderView('admin/module_form', { ...viewData, mod: null, styles: styles.results || [] }));
    }
    if (path === '/admin/modules/new' && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const body = await request.formData();
      const title = body.get('title') || '';
      const summary = body.get('summary') || '';
      const content = body.get('content') || '';
      const style_id = parseInt(body.get('style_id')) || 1;
      const credit_points = parseFloat(body.get('credit_points')) || 0;
      const duration_mins = parseInt(body.get('duration_mins')) || 30;
      const pass_mark = parseInt(body.get('pass_mark')) || 70;

      const info = await DB.prepare('INSERT INTO modules (title, summary, content, style_id, credit_points, duration_mins, pass_mark, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, 1)').bind(title, summary, content, style_id, credit_points, duration_mins, pass_mark).run();

      const questionsJson = body.get('questions') || '[]';
      try {
        const questions = JSON.parse(questionsJson);
        for (const q of questions) {
          await DB.prepare('INSERT INTO questions (module_id, question, option_a, option_b, option_c, option_d, correct) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(info.meta.last_row_id, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option.toLowerCase()).run();
        }
      } catch (e) {}

      const resp = redirect('/admin/modules');
      resp.headers.append('Set-Cookie', flashCookie('success', 'Module created.'));
      return resp;
    }

    // ADMIN EVENTS
    if (path === '/admin/events' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const events = await DB.prepare('SELECT * FROM events ORDER BY event_date ASC').all();
      const now = new Date();
      const rows = (events.results || []).map(e => ({ ...e, ended: !e.event_date || now >= eventEndDate(e) }));
      return htmlRes(renderView('admin/events', { ...viewData, events: rows }));
    }

    if (path === '/admin/events/new' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      return htmlRes(renderView('admin/event_form', { ...viewData, event: null }));
    }
    if (path === '/admin/events/new' && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const body = await request.formData();
      await DB.prepare('INSERT INTO events (title, description, venue, event_date, event_time, event_end_time, credit_points, meet_link, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').bind(body.get('title'), body.get('description'), body.get('venue'), body.get('event_date'), body.get('event_time'), body.get('event_end_time'), parseFloat(body.get('credit_points')) || 0, body.get('meet_link')).run();
      const resp = redirect('/admin/events');
      resp.headers.append('Set-Cookie', flashCookie('success', 'Event created.'));
      return resp;
    }

    // ADMIN ATTENDANCE OVERVIEW (section under Admin)
    if (path === '/admin/attendance' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const events = await DB.prepare('SELECT * FROM events ORDER BY event_date DESC').all();
      const minMinutes = parseInt(await getSetting(DB, 'attendance_min_minutes', '30')) || 30;
      const rows = [];
      for (const e of (events.results || [])) {
        const att = await DB.prepare('SELECT COUNT(*) as c FROM event_attendance WHERE event_id = ?').bind(e.id).first();
        const pend = await DB.prepare("SELECT COUNT(*) as c FROM claims WHERE event_id = ? AND source = 'event' AND status = 'pending'").bind(e.id).first();
        const appr = await DB.prepare("SELECT COUNT(*) as c FROM claims WHERE event_id = ? AND source = 'event' AND status = 'approved'").bind(e.id).first();
        rows.push({ ...e, ended: !e.event_date || new Date() >= eventEndDate(e), attendanceCount: att?.c || 0, pendingClaims: pend?.c || 0, approvedClaims: appr?.c || 0 });
      }
      return htmlRes(renderView('admin/attendance', { ...viewData, events: rows, minMinutes }));
    }

    // ADMIN EVENT ATTENDANCE
    const attendanceMatch = path.match(/^\/admin\/event\/(\d+)\/attendance$/);
    if (attendanceMatch && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(attendanceMatch[1]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      if (!event) return redirect('/admin/events');
      const claims = await DB.prepare('SELECT * FROM claims WHERE event_id = ? ORDER BY created_at DESC').bind(eventId).all();
      const attendance = await DB.prepare('SELECT * FROM event_attendance WHERE event_id = ? ORDER BY id DESC').bind(eventId).all();
      const attendees = (attendance.results || []).map(a => ({
        ...a,
        joined_display: formatAttendanceTime(a.joined_at),
        left_display: formatAttendanceTime(a.left_at),
        duration_display: formatDurationFromCols(a.joined_at, a.left_at, a.duration)
      }));
      const claimRows = (claims.results || []).map(c => {
        const attendanceRecord = findAttendanceMatch(c, attendees);
        const attendanceCandidates = findAttendanceCandidates(c, attendees);
        return {
          ...c,
          matched: !!attendanceRecord,
          attendanceRecord,
          attendanceCandidates
        };
      });
      const minMinutes = parseInt(await getSetting(DB, 'attendance_min_minutes', '30')) || 30;
      return htmlRes(renderView('admin/event_attendance', { ...viewData, event, claims: claimRows, attendance: attendees, minMinutes }));
    }

    // ADMIN ATTENDANCE EXPORT (CSV download)
    const attendanceExportMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/export$/);
    if (attendanceExportMatch && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(attendanceExportMatch[1]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      if (!event) return redirect('/admin/attendance');
      const attendance = await DB.prepare('SELECT * FROM event_attendance WHERE event_id = ? ORDER BY id ASC').bind(eventId).all();
      const csvSafe = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const header = ['Name', 'Email', 'Joined (EAT)', 'Left (EAT)', 'Duration'];
      const lines = (attendance.results || []).map(a => [
        csvSafe(a.full_name),
        csvSafe(a.email),
        csvSafe(formatAttendanceTime(a.joined_at)),
        csvSafe(formatAttendanceTime(a.left_at)),
        csvSafe(formatDurationFromCols(a.joined_at, a.left_at, a.duration))
      ].join(','));
      const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
      const datePart = (event.event_date || 'date').replace(/-/g, '');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="attendance_event_${eventId}_${datePart}.csv"`
        }
      });
    }

    // Upload attendance report (CSV from Google Meet)
    const attendanceUploadMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/upload$/);
    if (attendanceUploadMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(attendanceUploadMatch[1]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      if (!event) return redirect('/admin/events');

      const body = await request.formData();
      const file = body.get('attendance_file');
      if (!file || !file.size) {
        const resp = redirect(`/admin/event/${eventId}/attendance`);
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Please choose a CSV file to upload.'));
        return resp;
      }

      const text = await file.text();
      const attendees = parseAttendanceCsv(text);
      let added = 0;
      for (const a of attendees) {
        const existing = await DB.prepare('SELECT id FROM event_attendance WHERE event_id = ? AND email = ?').bind(eventId, a.email || `__${a.full_name}`).first();
        if (existing) continue;
        await DB.prepare('INSERT INTO event_attendance (event_id, full_name, email, joined_at, left_at, duration) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(eventId, a.full_name, a.email, a.joined_at, a.left_at, a.duration).run();
        added++;
      }

      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('success', `Imported ${added} attendee(s) from the attendance report.`));
      return resp;
    }

    // Manually add an attendee
    const attendanceAddMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/add$/);
    if (attendanceAddMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(attendanceAddMatch[1]);
      const body = await request.formData();
      const full_name = body.get('full_name') || '';
      const email = (body.get('email') || '').trim();
      if (!full_name) {
        const resp = redirect(`/admin/event/${eventId}/attendance`);
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Attendee name is required.'));
        return resp;
      }
      await DB.prepare('INSERT INTO event_attendance (event_id, full_name, email) VALUES (?, ?, ?)').bind(eventId, full_name, email || null).run();
      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('success', 'Attendee added.'));
      return resp;
    }

    // Remove an attendee
    const attendanceDeleteMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/(\d+)\/delete$/);
    if (attendanceDeleteMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(attendanceDeleteMatch[1]);
      await DB.prepare('DELETE FROM event_attendance WHERE id = ? AND event_id = ?').bind(parseInt(attendanceDeleteMatch[2]), eventId).run();
      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('success', 'Attendee removed.'));
      return resp;
    }

    // Approve an attendance record -> awards the event's CPD points
    const attendanceApproveMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/record\/(\d+)\/approve$/);
    if (attendanceApproveMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(attendanceApproveMatch[1]);
      const attId = parseInt(attendanceApproveMatch[2]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      const att = await DB.prepare('SELECT * FROM event_attendance WHERE id = ? AND event_id = ?').bind(attId, eventId).first();
      if (!event || !att) return redirect(`/admin/event/${eventId}/attendance`);
      await DB.prepare("UPDATE event_attendance SET status = 'approved' WHERE id = ?").bind(attId).run();

      const certCode = makeCertCode('PPAU-EVT');
      const claim = await findClaimForAttendance(DB, eventId, att);
      if (claim) {
        await DB.prepare("UPDATE claims SET status = ?, score = ?, passed = ?, points_awarded = ?, certificate_code = ?, full_name = ?, email = ?, contact_email = ? WHERE id = ?")
          .bind('approved', 100, 1, event.credit_points, certCode, att.full_name || claim.full_name, att.email || claim.email, att.email || claim.contact_email, claim.id).run();
      } else {
        await DB.prepare("INSERT INTO claims (event_id, full_name, ppau_reg_no, ahpc_reg_no, email, contact_email, score, passed, points_awarded, certificate_code, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(eventId, att.full_name || att.email || 'Attendee', '', '', att.email || null, att.email || null, 100, 1, event.credit_points, certCode, 'approved', 'event').run();
      }

      if (att.email) {
        const certUrl = `${url.origin}/member/certificate/${certCode}`;
        await sendResendEmail({
          to: att.email,
          subject: `Your CPD Certificate — ${event.title}`,
          html: certEmailHtml({ name: att.full_name || att.email, moduleTitle: event.title, points: event.credit_points, certUrl })
        }, DB, env);
      }

      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('success', `Attendance approved. ${event.credit_points} CPD points awarded to ${att.full_name}. Certificate sent by email.`));
      return resp;
    }

    // Reject an attendance record (also rejects any matched claim)
    const attendanceRejectMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/record\/(\d+)\/reject$/);
    if (attendanceRejectMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(attendanceRejectMatch[1]);
      const attId = parseInt(attendanceRejectMatch[2]);
      await DB.prepare("UPDATE event_attendance SET status = 'rejected' WHERE id = ? AND event_id = ?").bind(attId, eventId).run();
      const att = await DB.prepare('SELECT * FROM event_attendance WHERE id = ? AND event_id = ?').bind(attId, eventId).first();
      const claim = att ? await findClaimForAttendance(DB, eventId, att) : null;
      let rejectedClaim = false;
      if (claim && claim.status !== 'rejected') {
        await DB.prepare("UPDATE claims SET status = 'rejected', certificate_code = NULL, points_awarded = 0, passed = 0, score = NULL WHERE id = ?").bind(claim.id).run();
        rejectedClaim = true;
      }
      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('warning', `Attendance rejected.${rejectedClaim ? ' The matched claim was also rejected and its CPD points revoked.' : ' This record will no longer match any claim.'}`));
      return resp;
    }

    // Verify/approve claims against attendance (auto-match)
    const attendanceVerifyMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/verify$/);
    if (attendanceVerifyMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(attendanceVerifyMatch[1]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      if (!event) return redirect('/admin/events');

      const attendance = await DB.prepare('SELECT * FROM event_attendance WHERE event_id = ?').bind(eventId).all();
      const attendees = attendance.results || [];
      const pending = await DB.prepare("SELECT * FROM claims WHERE event_id = ? AND source = 'event' AND status = 'pending'").bind(eventId).all();

      const minMinutes = parseInt(await getSetting(DB, 'attendance_min_minutes', '30')) || 30;
      let approved = 0, short = 0, nomatch = 0;
      for (const c of (pending.results || [])) {
        const result = await autoApproveClaim(DB, c, event, minMinutes, { origin: url.origin, env });
        if (result === 'approved') approved++;
        else if (result === 'short') short++;
        else if (result === 'nomatch') nomatch++;
      }
      const leftPending = (pending.results || []).length - approved - short - nomatch;

      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('success', `Auto-verify (≥${minMinutes} min): ${approved} approved, ${short} too short, ${nomatch} no match, ${leftPending} still pending.`));
      return resp;
    }

    // Manually approve a single claim
    const claimApproveMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/approve\/(\d+)$/);
    if (claimApproveMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(claimApproveMatch[1]);
      const claimId = parseInt(claimApproveMatch[2]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      const claim = await DB.prepare('SELECT * FROM claims WHERE id = ? AND event_id = ?').bind(claimId, eventId).first();
      if (!event || !claim) return redirect(`/admin/event/${eventId}/attendance`);
      const certCode = makeCertCode('PPAU-EVT');
      await DB.prepare('UPDATE claims SET status = ?, score = ?, passed = ?, points_awarded = ?, certificate_code = ? WHERE id = ?')
        .bind('approved', 100, 1, event.credit_points, certCode, claimId).run();
      if (claim.contact_email) {
        const certUrl = `${url.origin}/member/certificate/${certCode}`;
        await sendResendEmail({
          to: claim.contact_email,
          subject: `Your CPD Certificate — ${event.title}`,
          html: certEmailHtml({ name: claim.full_name, moduleTitle: event.title, points: event.credit_points, certUrl })
        }, DB, env);
      }
      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('success', 'Claim approved.'));
      return resp;
    }

    // Manually reject a single claim
    const claimRejectMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/reject\/(\d+)$/);
    if (claimRejectMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(claimRejectMatch[1]);
      const claimId = parseInt(claimRejectMatch[2]);
      await DB.prepare("UPDATE claims SET status = 'rejected', certificate_code = NULL, points_awarded = 0, passed = 0, score = NULL WHERE id = ? AND event_id = ?").bind(claimId, eventId).run();
      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('warning', 'Claim rejected. You can still approve it again from the list.'));
      return resp;
    }

    // Revoke an auto/manual approval (back to pending)
    const claimRevokeMatch = path.match(/^\/admin\/event\/(\d+)\/attendance\/revoke\/(\d+)$/);
    if (claimRevokeMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const eventId = parseInt(claimRevokeMatch[1]);
      const claimId = parseInt(claimRevokeMatch[2]);
      await DB.prepare("UPDATE claims SET status = 'pending', certificate_code = NULL, points_awarded = 0, passed = 0, score = NULL WHERE id = ? AND event_id = ?").bind(claimId, eventId).run();
      const resp = redirect(`/admin/event/${eventId}/attendance`);
      resp.headers.append('Set-Cookie', flashCookie('warning', 'Approval revoked — claim is pending again.'));
      return resp;
    }

    // Admin clear all completed (ended) sessions and their claims/attendance
    if (path === '/admin/events/clear-completed' && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const allEvents = await DB.prepare('SELECT * FROM events').all();
      const now = new Date();
      let removed = 0;
      let claimsDeleted = 0;
      let attendanceDeleted = 0;
      for (const e of (allEvents.results || [])) {
        if (!e.event_date || now < eventEndDate(e)) continue;
        const att = await DB.prepare('DELETE FROM event_attendance WHERE event_id = ?').bind(e.id).run();
        const cl = await DB.prepare('DELETE FROM claims WHERE event_id = ?').bind(e.id).run();
        await DB.prepare('DELETE FROM events WHERE id = ?').bind(e.id).run();
        removed++;
        claimsDeleted += cl?.meta?.changes || 0;
        attendanceDeleted += att?.meta?.changes || 0;
      }
      const resp = redirect('/admin/events');
      resp.headers.append('Set-Cookie', flashCookie('success', `Removed ${removed} completed session(s) (${claimsDeleted} claim(s), ${attendanceDeleted} attendance record(s) deleted).`));
      return resp;
    }

    // Admin save minimum attendance duration for auto-approval
    if (path === '/admin/settings/attendance-minutes' && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const body = await request.formData();
      const val = parseInt(body.get('minutes'));
if (isFinite(val) && val >= 0) {
        await DB.prepare('INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)').bind('attendance_min_minutes', String(val)).run();
      }
      const resp = redirect('/admin/events');
      resp.headers.append('Set-Cookie', flashCookie('success', `Auto-approval minimum duration set to ${isFinite(val) && val >= 0 ? val : 'unchanged'} minute(s).`));
      return resp;
    }

    // ADMIN SUBMISSIONS
    if (path === '/admin/submissions' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const submissions = await DB.prepare('SELECT * FROM submissions ORDER BY created_at DESC').all();
      return htmlRes(renderView('admin/submissions', { ...viewData, submissions: submissions.results || [] }));
    }

    const approveMatch = path.match(/^\/admin\/submission\/(\d+)\/approve$/);
    if (approveMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const subId = parseInt(approveMatch[1]);
      const sub = await DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(subId).first();
      if (!sub) return redirect('/admin/submissions');
      const body = await request.formData();
      const points = parseFloat(body.get('points'));
      const note = (body.get('note') || '').trim();
      const awarded = isFinite(points) && points > 0 ? points : 5.0;
      const certCode = makeCertCode('PPAU-SUB');
      await DB.prepare('UPDATE submissions SET status = ?, certificate_code = ?, points_awarded = ?, admin_note = ? WHERE id = ?')
        .bind('approved', certCode, awarded, note, subId).run();
      const certUrl = `${url.origin}/member/certificate/${certCode}`;
      if (sub.email) {
        await sendResendEmail({
          to: sub.email,
          subject: `Your CPD points approved — ${sub.title}`,
          html: submissionDecisionEmailHtml({ name: sub.full_name, title: sub.title, points: awarded, note, status: 'approved', certUrl })
        }, DB, env);
      }
      const resp = redirect('/admin/submissions');
      resp.headers.append('Set-Cookie', flashCookie('success', `Submission approved — ${awarded} CPD points awarded${sub.email ? ' and email sent to the member' : ''}.`));
      return resp;
    }

    const rejectMatch = path.match(/^\/admin\/submission\/(\d+)\/reject$/);
    if (rejectMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const subId = parseInt(rejectMatch[1]);
      const sub = await DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(subId).first();
      if (!sub) return redirect('/admin/submissions');
      const body = await request.formData();
      const note = (body.get('note') || '').trim();
      await DB.prepare("UPDATE submissions SET status = 'rejected', certificate_code = NULL, points_awarded = 0, admin_note = ? WHERE id = ?")
        .bind(note, subId).run();
      if (sub.email) {
        await sendResendEmail({
          to: sub.email,
          subject: `Update on your CPD points submission — ${sub.title}`,
          html: submissionDecisionEmailHtml({ name: sub.full_name, title: sub.title, points: 0, note, status: 'rejected' })
        }, DB, env);
      }
      const resp = redirect('/admin/submissions');
      resp.headers.append('Set-Cookie', flashCookie('warning', 'Submission rejected and the member notified by email.'));
      return resp;
    }

    const evidenceMatch = path.match(/^\/admin\/submission\/(\d+)\/evidence$/);
    if (evidenceMatch && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const subId = parseInt(evidenceMatch[1]);
      const sub = await DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(subId).first();
      if (!sub || !sub.evidence_file) return redirect('/admin/submissions');
      if (!env.R2) return new Response('Storage not available.', { status: 404 });
      const obj = await env.R2.get(sub.evidence_file);
      if (!obj) return new Response('Evidence file not found.', { status: 404 });
      const contentType = (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream';
      const filename = sub.evidence_file.split('/').pop() || 'evidence';
      const disposition = (contentType.startsWith('image/') || contentType === 'application/pdf') ? 'inline' : 'attachment';
      return new Response(obj.body, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"`,
          'Cache-Control': 'private, max-age=300'
        }
      });
    }

    // ADMIN CLAIMS
    if (path === '/admin/claims' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const claims = await DB.prepare('SELECT c.*, m.title as module_title, e.title as event_title FROM claims c LEFT JOIN modules m ON c.module_id = m.id LEFT JOIN events e ON c.event_id = e.id ORDER BY c.created_at DESC').all();
      return htmlRes(renderView('admin/claims', { ...viewData, claims: claims.results || [] }));
    }

    // ADMIN: export per-member CPD points summary (CSV download)
    // One row per member with total awarded points and a details column of every
    // approved activity with the date the activity/session was done.
    if (path === '/admin/export/member-cpd-summary.csv' && method === 'GET') {
      if (!isAdmin) return redirect('/login');

      const claims = await DB.prepare(
        "SELECT c.*, m.title AS module_title, e.title AS event_title, e.event_date AS event_date FROM claims c LEFT JOIN modules m ON c.module_id = m.id LEFT JOIN events e ON c.event_id = e.id WHERE c.status = 'approved' AND c.points_awarded > 0 ORDER BY c.created_at ASC"
      ).all();

      const submissions = await DB.prepare(
        "SELECT s.* FROM submissions s WHERE s.status = 'approved' AND s.points_awarded > 0 ORDER BY s.created_at ASC"
      ).all();

      const members = new Map();

      const memberKey = (row) => normalizeMatch(row.ppau_reg_no || `${row.full_name || ''}|${(row.contact_email || row.email) || ''}`);

      const ensureMember = (row) => {
        const key = memberKey(row);
        if (!members.has(key)) {
          members.set(key, {
            key,
            full_name: (row.full_name || '').trim(),
            ppau_reg_no: (row.ppau_reg_no || '').trim(),
            ahpc_reg_no: (row.ahpc_reg_no || '').trim(),
            email: ((row.contact_email || row.email) || '').trim(),
            total: 0,
            count: 0,
            module_pts: 0,
            event_pts: 0,
            self_pts: 0,
            details: []
          });
        }
        const m = members.get(key);
        if (row.full_name) m.full_name = (row.full_name || '').trim();
        if (row.ppau_reg_no) m.ppau_reg_no = (row.ppau_reg_no || '').trim();
        if (row.ahpc_reg_no) m.ahpc_reg_no = (row.ahpc_reg_no || '').trim();
        const email = (row.contact_email || row.email) || '';
        if (email) m.email = email;
        return m;
      };

      const addItem = (m, info) => {
        m.total += info.points;
        m.count += 1;
        if (info.type === 'Module') m.module_pts += info.points;
        else if (info.type === 'Event') m.event_pts += info.points;
        else m.self_pts += info.points;
        m.details.push(`[${info.date || ''}] ${info.type}: ${info.title} (${info.points} pts)`);
      };

      for (const c of (claims.results || [])) {
        const points = Number(c.points_awarded) || 0;
        const type = c.source === 'event' ? 'Event' : 'Module';
        const title = type === 'Event' ? (c.event_title || 'CPD Event') : (c.module_title || 'CPD Module');
        const date = (type === 'Event' && c.event_date) ? String(c.event_date).slice(0, 10) : String(c.created_at || '').slice(0, 10);
        addItem(ensureMember(c), { type, title, points, date });
      }

      for (const s of (submissions.results || [])) {
        const points = Number(s.points_awarded) || 0;
        const date = String(s.created_at || '').slice(0, 10);
        addItem(ensureMember(s), { type: 'Self-Learning', title: s.title || 'Self-Learning Activity', points, date });
      }

      const csvSafe = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const header = ['Full Name', 'PPAU Reg No', 'AHPC Reg No', 'Email', 'Total CPD Points', 'Activities Count', 'Module Points', 'Event Points', 'Self-Learning Points', 'Activity Details (Date | Type | Title | Points)'];
      const lines = [...members.values()]
        .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
        .map(m => [
          csvSafe(m.full_name),
          csvSafe(m.ppau_reg_no),
          csvSafe(m.ahpc_reg_no),
          csvSafe(m.email),
          m.total,
          m.count,
          m.module_pts,
          m.event_pts,
          m.self_pts,
          csvSafe(m.details.join(' | '))
        ].join(','));
      const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="cpd_points_summary_${datePart}.csv"`
        }
      });
    }

    // ADMIN SETTINGS
    if (path === '/admin/settings' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const cpdTarget = await DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'cpd_target'").first();
      const emailApiKey = await DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'email_api_key'").first();
      const emailFrom = await DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'email_from'").first();
      return htmlRes(renderView('admin/settings', { ...viewData, cpdTarget: cpdTarget?.setting_value || '30', emailApiKey: emailApiKey?.setting_value || '', emailFrom: emailFrom?.setting_value || '' }));
    }
    if (path === '/admin/settings' && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const body = await request.formData();
      const cpdTarget = body.get('cpd_target') || '30';
      const emailApiKey = body.get('email_api_key') || '';
      const emailFrom = body.get('email_from') || '';
      await DB.prepare('INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)').bind('cpd_target', cpdTarget).run();
      await DB.prepare('INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)').bind('email_api_key', emailApiKey).run();
      await DB.prepare('INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)').bind('email_from', emailFrom).run();
      const resp = redirect('/admin/settings');
      resp.headers.append('Set-Cookie', flashCookie('success', 'Settings updated.'));
      return resp;
    }

    // ADMIN USERS
    if (path === '/admin/users' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const users = await DB.prepare('SELECT id, full_name, email, role, ppau_reg_no, created_at FROM users ORDER BY id ASC').all();
      return htmlRes(renderView('admin/users', { ...viewData, users: users.results || [] }));
    }

    // API: verify certificate
    if (path.startsWith('/api/verify/')) {
      const code = path.replace('/api/verify/', '');
      const claim = await DB.prepare('SELECT c.*, m.title as module_title FROM claims c LEFT JOIN modules m ON c.module_id = m.id WHERE c.certificate_code = ?').bind(code).first();
      if (claim) return jsonRes({ valid: true, name: claim.full_name, module: claim.module_title, points: claim.points_awarded, date: claim.created_at });
      const sub = await DB.prepare('SELECT * FROM submissions WHERE certificate_code = ?').bind(code).first();
      if (sub) return jsonRes({ valid: true, name: sub.full_name, module: sub.title, points: sub.points_awarded, date: sub.created_at });
      return jsonRes({ valid: false }, 404);
    }

    // ADMIN NOTIFICATIONS
    if (path === '/admin/notifications' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const allNotifs = await DB.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all();
      return htmlRes(renderView('admin/notifications', { ...viewData, allNotifications: allNotifs.results || [] }));
    }
    if (path === '/admin/notifications/new' && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const body = await request.formData();
      const title = body.get('title') || '';
      const message = body.get('message') || '';
      const type = body.get('type') || 'info';
      if (title && message) {
        await DB.prepare('INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)').bind(title, message, type).run();
      }
      const resp = redirect('/admin/notifications');
      resp.headers.append('Set-Cookie', flashCookie('success', 'Notification created.'));
      return resp;
    }
    const delNotifMatch = path.match(/^\/admin\/notification\/(\d+)\/delete$/);
    if (delNotifMatch && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      await DB.prepare('DELETE FROM notifications WHERE id = ?').bind(parseInt(delNotifMatch[1])).run();
      const resp = redirect('/admin/notifications');
      resp.headers.append('Set-Cookie', flashCookie('success', 'Notification deleted.'));
      return resp;
    }

    // API: notifications JSON
    if (path === '/api/notifications' && method === 'GET') {
      const allNotifs = await DB.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20').all();
      return jsonRes({ notifications: allNotifs.results || [], count: allNotifs.results?.length || 0 });
    }

    // API: member CPD points (key-protected) — powers the ppau.info member portal
    // GET /api/member/cpd-points?reg=PPAU-PRO-2026-NNNNN
    // Requires header: X-CPD-Api-Key: <CPD_API_KEY>
    if (path === '/api/member/cpd-points' && method === 'GET') {
      if (!env.CPD_API_KEY || request.headers.get('X-CPD-Api-Key') !== env.CPD_API_KEY) {
        return jsonRes({ error: 'Unauthorized' }, 401);
      }
      const reg = normalizePpauRegNo(url.searchParams.get('reg') || '');
      if (!reg) return jsonRes({ error: 'Missing reg number' }, 400);

      const claims = await DB.prepare(
        "SELECT c.*, m.title as module_title, e.title as event_title, e.event_date FROM claims c LEFT JOIN modules m ON c.module_id = m.id LEFT JOIN events e ON c.event_id = e.id WHERE c.ppau_reg_no = ? AND c.status = 'approved' AND c.points_awarded > 0 ORDER BY c.created_at ASC"
      ).bind(reg).all();

      const submissions = await DB.prepare(
        "SELECT s.* FROM submissions s WHERE s.ppau_reg_no = ? AND s.status = 'approved' AND s.points_awarded > 0 ORDER BY s.created_at ASC"
      ).bind(reg).all();

      const items = [];
      for (const c of (claims.results || [])) {
        items.push({
          type: 'claim',
          source: c.source || 'module',
          title: c.event_title || c.module_title || 'CPD Activity',
          points: c.points_awarded,
          date: c.created_at,
          event_date: c.event_date || null,
          passed: !!c.passed,
          score: c.score,
          certificate_code: c.certificate_code || null
        });
      }
      for (const s of (submissions.results || [])) {
        items.push({
          type: 'submission',
          source: 'self_learning',
          title: s.title || 'Self-Learning Activity',
          points: s.points_awarded,
          date: s.created_at,
          event_date: null,
          passed: true,
          score: null,
          certificate_code: s.certificate_code || null
        });
      }

      items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const total = items.reduce((sum, it) => sum + (Number(it.points) || 0), 0);

      const targetSetting = await DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'cpd_target'").first();
      const target = parseFloat(targetSetting?.setting_value) || 30;
      const percent = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;

      return jsonRes({ ppau_reg_no: reg, total_points: total, target, percent, count: items.length, items });
    }

    return htmlRes(renderView('404', viewData), 404);
  }
};
