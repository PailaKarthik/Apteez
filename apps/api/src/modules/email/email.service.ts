import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain-text fallback (always sent). */
  text: string;
  /** Rich body (sent alongside text). */
  html: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';
const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Transactional email over Resend's HTTP API (free tier: 100/day).
 * No SMTP ports, no SDK — plain fetch. When RESEND_API_KEY is unset the
 * mailer is inert: sends are skipped with a warning instead of failing,
 * so registration and auth never depend on email being configured.
 */
@Injectable()
export class EmailService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {}

  /** False until the operator provides RESEND_API_KEY (see .env.example). */
  isConfigured(): boolean {
    return Boolean(this.config.get('RESEND_API_KEY', { infer: true })?.trim());
  }

  private from(): string {
    return this.config.get('EMAIL_FROM', { infer: true });
  }

  async send(input: SendEmailInput): Promise<{ id: string | null; skipped: boolean }> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `email.skipped to=${input.to} subject=${input.subject} (RESEND_API_KEY unset)`,
        'Email',
      );
      return { id: null, skipped: true };
    }
    let response: Response;
    try {
      response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.get('RESEND_API_KEY', { infer: true })?.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from(),
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        `email.unreachable to=${input.to} ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        'Email',
      );
      throw new EmailSendError();
    }
    if (!response.ok) {
      // Provider bodies can echo the recipient — never log them.
      this.logger.warn(`email.rejected status=${response.status}`, 'Email');
      throw new EmailSendError();
    }
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof body?.id === 'string' ? body.id : null;
    this.logger.log(`email.sent to=${input.to} id=${id ?? '?'}`, 'Email');
    return { id, skipped: false };
  }

  /** Branded 6-digit verification code mail. */
  async sendVerificationCode(to: string, displayName: string, code: string): Promise<void> {
    const first = displayName.split(' ')[0] || 'solver';
    await this.send({
      to,
      subject: `${code} is your ApteeZ verification code`,
      text: `Hi ${first},\n\nYour ApteeZ verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.\n`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2 style="margin:0 0 8px">Hi ${escapeHtml(first)},</h2><p>Your ApteeZ verification code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${escapeHtml(code)}</p><p style="color:#666">It expires in 10 minutes. If you did not request this, ignore this email.</p></div>`,
    });
  }
}

/** 503 — the mail provider could not be reached or rejected the send. */
export class EmailSendError extends AppError {
  constructor(message = 'Could not send the email. Please try again.') {
    super('EMAIL_SEND_FAILED', message, 503);
    this.name = 'EmailSendError';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
