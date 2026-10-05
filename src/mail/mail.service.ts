import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('MAIL_FROM');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (!host || !from) {
      return false;
    }
    if (user && !pass) {
      return false;
    }
    return true;
  }

  async send(message: MailMessage): Promise<{ sent: boolean; reason?: string }> {
    if (!this.configured()) {
      return { sent: false, reason: 'El correo no está configurado' };
    }

    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    try {
      const transport = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      await transport.sendMail({
        from: this.config.get<string>('MAIL_FROM'),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { sent: true };
    } catch (error) {
      this.logger.warn(`No se pudo enviar correo a ${message.to}: ${error instanceof Error ? error.message : 'error'}`);
      return { sent: false, reason: 'No se pudo enviar el correo' };
    }
  }
}
