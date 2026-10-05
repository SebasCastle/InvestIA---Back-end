import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AI_TOOLS, AiToolExecutor } from './ai.tools';
import { GeminiClient, type ModelContent } from './gemini.client';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const MAX_ROUNDS = 4;

@Injectable()
export class AiService {
  constructor(
    private readonly gemini: GeminiClient,
    private readonly tools: AiToolExecutor,
  ) {}

  async chat(userId: string, message: string, history: ChatMessage[] = []) {
    if (!this.gemini.configured()) {
      throw new ServiceUnavailableException('La IA no está configurada');
    }

    const contents: ModelContent[] = history.slice(-10).map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));
    contents.push({ role: 'user', parts: [{ text: message }] });

    const toolsUsed: string[] = [];
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const reply = await this.gemini.generate(contents, AI_TOOLS);
      if (reply.calls.length === 0) {
        return {
          reply: reply.text || 'No hay datos suficientes para responder.',
          toolsUsed,
        };
      }

      contents.push({
        role: 'model',
        parts: reply.parts?.length
          ? reply.parts
          : reply.calls.map((call) => ({ functionCall: { name: call.name, args: call.args, id: call.id } })),
      });
      const responses = [];
      for (const call of reply.calls) {
        toolsUsed.push(call.name);
        const result = await this.tools.run(userId, call.name, call.args ?? {});
        responses.push({
          functionResponse: {
            name: call.name,
            response: result,
            ...(call.id ? { id: call.id } : {}),
          },
        });
      }
      contents.push({ role: 'user', parts: responses });
    }

    return {
      reply: 'No pude cerrar la respuesta con los datos disponibles.',
      toolsUsed,
    };
  }
}
