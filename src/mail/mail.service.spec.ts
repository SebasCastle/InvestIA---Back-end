import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('does not send when SMTP is not configured', async () => {
    const mail = new MailService({ get: () => '' } as unknown as ConfigService);
    const result = await mail.send({
      to: 'ana@example.com',
      subject: 'Cierre',
      text: 'Hola',
      html: '<p>Hola</p>',
    });
    expect(result).toEqual({ sent: false, reason: 'El correo no está configurado' });
  });
});
