/**
 * Branded transactional auth emails (password reset, etc.).
 */

import { escapeHtml, sanitizeHeader } from './emailSafety.js'

const DEFAULT_FROM = 'KnockScout <noreply@knockscout.com>'

export function getAuthFromAddress() {
  return (
    process.env.AUTH_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    DEFAULT_FROM
  )
}

export function buildPasswordResetEmailHtml({ resetLink, recipientEmail }) {
  const safeEmail = escapeHtml(recipientEmail || '')
  const safeLink = escapeHtml(resetLink)

  const bodyHtml = `
<p style="margin:0 0 16px;">Hi${safeEmail ? ` (${safeEmail})` : ''},</p>
<p style="margin:0 0 20px;">We received a request to reset your KnockScout password. Tap the button below to choose a new password. This link expires in one hour.</p>
<p style="margin:0 0 24px;text-align:center;">
  <a href="${safeLink}" style="display:inline-block;background:#2563eb;color:#ffffff !important;text-decoration:none;font-weight:600;font-size:15px;line-height:1;padding:14px 28px;border-radius:8px;">Reset password</a>
</p>
<p style="margin:0 0 12px;font-size:13px;color:#71717a;">If the button does not work, copy and paste this link into your browser:</p>
<p style="margin:0 0 20px;font-size:13px;line-height:1.5;word-break:break-all;">
  <a href="${safeLink}" style="color:#2563eb;text-decoration:underline;">${safeLink}</a>
</p>
<p style="margin:0;font-size:13px;color:#71717a;">If you did not request a password reset, you can ignore this email — your password will stay the same.</p>`

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
<tr>
<td style="padding:24px 28px;border-bottom:1px solid #e4e4e7;">
<div style="font-size:20px;font-weight:700;color:#18181b;line-height:1.2;">KnockScout</div>
<div style="font-size:13px;color:#71717a;margin-top:4px;">Password reset</div>
</td>
</tr>
<tr>
<td style="padding:24px 28px;font-size:15px;line-height:1.6;color:#3f3f46;">
${bodyHtml}
</td>
</tr>
<tr>
<td style="padding:16px 28px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;line-height:1.5;">
KnockScout &middot; <a href="https://knockscout.app" style="color:#71717a;">knockscout.app</a>
</td>
</tr>
</table>
</body>
</html>`
}

export function buildPasswordResetSubject() {
  return sanitizeHeader('Reset your KnockScout password', 120)
}
