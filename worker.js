import { render } from './worker/views.bundle.cjs';
import { isValidPpauRegNo, normalizePpauRegNo } from './utils/validate.js';

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
  const flash = data._flash || {};
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

async function sendResendEmail({ to, subject, html }, apiKey, from) {
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from || 'PPAU CME-CPD <noreply@ppau-cme-cpd.org>', to: [to], subject, html })
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const DB = env.DB;

    const cookies = parseCookies(request.headers.get('Cookie'));
    const sessionToken = cookies.session || '';
    let isAdmin = false;

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

    const viewData = { flash: flashData, notifications, notifCount };

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
      const events = await DB.prepare('SELECT * FROM events WHERE is_published = 1 ORDER BY event_date ASC LIMIT 6').all();
      const providers = await DB.prepare('SELECT * FROM cpd_providers WHERE is_active = 1 ORDER BY sort_order ASC').all();
      return htmlRes(renderView('index', { ...viewData, events: events.results || [], providers: providers.results || [] }));
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

      if (passed && contactEmail) {
        const certUrl = `${url.origin}/member/certificate/${certCode}`;
        await sendResendEmail({
          to: contactEmail,
          subject: `Your CPD Certificate — ${mod.title}`,
          html: certEmailHtml({ name: full_name, moduleTitle: mod.title, points: pointsAwarded, certUrl })
        }, env.RESEND_API_KEY, env.EMAIL_FROM);
      }

      return htmlRes(renderView('member/quiz_result', {
        mod, score, passed: !!passed, pointsAwarded, correct: correctCount, total, certCode, full_name, ppau_reg_no, ahpc_reg_no, ...viewData
      }));
    }

    // MEMBER EVENTS (list)
    if (path === '/member/events' && method === 'GET') {
      const events = await DB.prepare('SELECT * FROM events WHERE is_published = 1 ORDER BY event_date ASC').all();
      return htmlRes(renderView('member/events', { ...viewData, events: events.results || [] }));
    }

    // MEMBER EVENT CLAIM
    const eventClaimMatch = path.match(/^\/member\/event\/(\d+)\/claim$/);
    if (eventClaimMatch && method === 'POST') {
      const eventId = parseInt(eventClaimMatch[1]);
      const event = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
      if (!event) return redirect('/member/events');

      const body = await request.formData();
      const full_name = body.get('full_name') || '';
      const ppau_reg_no = normalizePpauRegNo(body.get('ppau_reg_no'));
      const ahpc_reg_no = body.get('ahpc_reg_no') || '';
      const email = body.get('email') || '';

      if (!isValidPpauRegNo(ppau_reg_no)) {
        const resp = redirect('/member/events');
        resp.headers.append('Set-Cookie', flashCookie('danger', 'Invalid PPAU registration number format. Use PPAU-PRO-YYYY-NNNNN.'));
        return resp;
      }

      const certCode = makeCertCode('PPAU-EVT');
      const placeholderEmail = email || `member_${Date.now()}_${Math.random().toString(36).substr(2, 4)}@ppau-cpd.local`;
      const contactEmail = email || null;

      await DB.prepare(
        'INSERT INTO claims (event_id, full_name, ppau_reg_no, ahpc_reg_no, email, contact_email, score, passed, points_awarded, certificate_code, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(eventId, full_name, ppau_reg_no, ahpc_reg_no, placeholderEmail, contactEmail, 100, 1, event.credit_points, certCode, 'approved', 'event').run();

      if (contactEmail) {
        const certUrl = `${url.origin}/member/certificate/${certCode}`;
        await sendResendEmail({
          to: contactEmail,
          subject: `Your CPD Certificate — ${event.title}`,
          html: certEmailHtml({ name: full_name, moduleTitle: event.title, points: event.credit_points, certUrl })
        }, env.RESEND_API_KEY, env.EMAIL_FROM);
      }

      const resp = redirect('/member/events');
      resp.headers.append('Set-Cookie', flashCookie('success', `Points claimed! ${event.credit_points} CPD points awarded. Certificate code: ${certCode}`));
      return resp;
    }

    // MEMBER SELF-LEARNING
    if (path === '/member/self-learning' && method === 'GET') {
      return htmlRes(renderView('member/self_learning', { ...viewData, submissions: [] }));
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

      const resp = redirect('/member/self-learning');
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
      return htmlRes(renderView('admin/events', { ...viewData, events: events.results || [] }));
    }

    if (path === '/admin/events/new' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      return htmlRes(renderView('admin/event_form', { ...viewData, event: null }));
    }
    if (path === '/admin/events/new' && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const body = await request.formData();
      await DB.prepare('INSERT INTO events (title, description, venue, event_date, event_time, credit_points, is_published) VALUES (?, ?, ?, ?, ?, ?, 1)').bind(body.get('title'), body.get('description'), body.get('venue'), body.get('event_date'), body.get('event_time'), parseFloat(body.get('credit_points')) || 0).run();
      const resp = redirect('/admin/events');
      resp.headers.append('Set-Cookie', flashCookie('success', 'Event created.'));
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
      const certCode = makeCertCode('PPAU-SUB');
      await DB.prepare('UPDATE submissions SET status = ?, certificate_code = ?, points_awarded = ? WHERE id = ?').bind('approved', certCode, 5.0, subId).run();
      const resp = redirect('/admin/submissions');
      resp.headers.append('Set-Cookie', flashCookie('success', 'Submission approved.'));
      return resp;
    }

    // ADMIN CLAIMS
    if (path === '/admin/claims' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const claims = await DB.prepare('SELECT c.*, m.title as module_title, e.title as event_title FROM claims c LEFT JOIN modules m ON c.module_id = m.id LEFT JOIN events e ON c.event_id = e.id ORDER BY c.created_at DESC').all();
      return htmlRes(renderView('admin/claims', { ...viewData, claims: claims.results || [] }));
    }

    // ADMIN SETTINGS
    if (path === '/admin/settings' && method === 'GET') {
      if (!isAdmin) return redirect('/login');
      const cpdTarget = await DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'cpd_target'").first();
      const emailApiKey = await DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'email_api_key'").first();
      return htmlRes(renderView('admin/settings', { ...viewData, cpdTarget: cpdTarget?.setting_value || '30', emailApiKey: emailApiKey?.setting_value || '' }));
    }
    if (path === '/admin/settings' && method === 'POST') {
      if (!isAdmin) return redirect('/login');
      const body = await request.formData();
      const cpdTarget = body.get('cpd_target') || '30';
      const emailApiKey = body.get('email_api_key') || '';
      await DB.prepare('INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)').bind('cpd_target', cpdTarget).run();
      await DB.prepare('INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)').bind('email_api_key', emailApiKey).run();
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

    return htmlRes(renderView('404', viewData), 404);
  }
};
