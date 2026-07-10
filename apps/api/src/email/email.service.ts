import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Thin email abstraction.
 *
 * - When `RESEND_API_KEY` is configured, messages are delivered through the
 *   Resend SDK (from the `EMAIL_FROM` address).
 * - Otherwise (local dev / tests) the payload is logged — including any links
 *   embedded in the text — so developers can copy them straight from the
 *   console instead of wiring up a real mail provider.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async send(options: SendEmailOptions): Promise<void> {
    if (this.resend) {
      const from =
        this.config.get<string>('EMAIL_FROM') ?? 'no-reply@guendlkofen.app';
      const { error } = await this.resend.emails.send({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      if (error) {
        throw new Error(`Resend failed to send email: ${error.message}`);
      }
      return;
    }

    // No provider configured — log everything so devs can copy links.
    this.logger.log(
      `Email (not sent, no RESEND_API_KEY configured)\n` +
        `  to:      ${options.to}\n` +
        `  subject: ${options.subject}\n` +
        `  text:\n${options.text}`,
    );
  }
}
