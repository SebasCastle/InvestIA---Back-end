import { ConfigService } from '@nestjs/config';
import { GeminiClient } from './gemini.client';

describe('GeminiClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends the key in a header and keeps it out of the error', async () => {
    const client = new GeminiClient({
      get: (key: string) => (key === 'GEMINI_API_KEY' ? 'secret-gemini' : 'gemini-2.0-flash'),
    } as unknown as ConfigService);
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

    await expect(client.generate([{ role: 'user', parts: [{ text: 'hola' }] }], [])).rejects.toThrow(
      'El servicio de IA respondió con error',
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('secret-gemini');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-gemini');
  });
});