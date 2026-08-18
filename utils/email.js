async function sendEmail({ to, subject, html }, env) {
  const apiKey = env.RESEND_API_KEY || '';
  if (!apiKey || !to) return { ok: false, skipped: true };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'PPAU CME-CPD <noreply@ppau-cme-cpd.org>',
        to: [to],
        subject,
        html
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e) {
    console.error('Email send failed:', e);
    return { ok: false, error: e.message };
  }
}

function certificateEmailHtml({ name, moduleTitle, points, certUrl }) {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#0f766e;">PPAU CME-CPD Certificate</h2>
      <p>Dear ${name},</p>
      <p>Congratulations! You have earned <strong>${points} CPD points</strong> for completing "<strong>${moduleTitle}</strong>".</p>
      <p>Your certificate is ready. You can view and download it here:</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${certUrl}" style="background:#0f766e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">View Certificate</a>
      </p>
      <p style="color:#64748b;font-size:0.85em;">If you did not expect this email, please ignore it.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
      <p style="color:#94a3b8;font-size:0.75em;">PPAU CME-CPD Portal &mdash; Pharmacy Professionals Association of Uganda</p>
    </div>
  `;
}

module.exports = { sendEmail, certificateEmailHtml };
