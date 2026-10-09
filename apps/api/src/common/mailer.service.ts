import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { config } from '../app.config';

export interface OutboundMail {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound mail. SMTP is only contacted when it is configured: without SMTP_HOST the message is
 * logged instead, so development and test never depend on a mail server while production -- which
 * must set the SMTP variables -- delivers for real.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: Transporter;

  get configured(): boolean {
    return Boolean(config.smtp.host);
  }

  private getTransporter(): Transporter | undefined {
    if (!this.configured) return undefined;
    if (!this.transporter) {
      const { host, port, secure, user, password } = config.smtp;
      this.transporter = createTransport({
        host,
        port,
        secure,
        ...(user && password ? { auth: { user, pass: password } } : {}),
      });
    }
    return this.transporter;
  }

  /** Resolves to the delivery error message, or undefined when the message was handed off. */
  async send(mail: OutboundMail): Promise<string | undefined> {
    if (!mail.to.length) return 'No recipients are configured';
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn(
        `SMTP is not configured; not sending "${mail.subject}" to ${mail.to.join(', ')}`,
      );
      return 'SMTP is not configured';
    }
    try {
      await transporter.sendMail({
        from: config.smtp.from,
        to: mail.to.join(', '),
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      });
      return undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown mail delivery failure';
      this.logger.error(`Failed to deliver "${mail.subject}": ${message}`);
      return message;
    }
  }
}
