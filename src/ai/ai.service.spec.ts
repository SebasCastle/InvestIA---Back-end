import { ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiToolExecutor } from './ai.tools';
import type { GeminiClient } from './gemini.client';

describe('AiService', () => {
  const tools = { run: jest.fn() };
  const gemini = { configured: jest.fn(), generate: jest.fn() };

  const service = new AiService(gemini as unknown as GeminiClient, tools as unknown as AiToolExecutor);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('answers from a tool result and does not invent text when the model is silent', async () => {
    gemini.configured.mockReturnValue(true);
    gemini.generate
      .mockResolvedValueOnce({
        text: '',
        calls: [{ name: 'get_portfolio', args: { portfolioId: 'p1' } }],
      })
      .mockResolvedValueOnce({ text: 'El valor es 1106.', calls: [] });
    tools.run.mockResolvedValue({ summary: { portfolioValue: 1106 } });

    const result = await service.chat('user-1', '¿Cuál es el valor?');

    expect(tools.run).toHaveBeenCalledWith('user-1', 'get_portfolio', { portfolioId: 'p1' });
    expect(result.toolsUsed).toEqual(['get_portfolio']);
    expect(result.reply).toBe('El valor es 1106.');
  });

  it('refuses to run when the model is not configured', async () => {
    gemini.configured.mockReturnValue(false);
    await expect(service.chat('user-1', 'hola')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(gemini.generate).not.toHaveBeenCalled();
  });
});
