import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ModelPart = {
  text?: string;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
};

export type ModelContent = {
  role: 'user' | 'model';
  parts: ModelPart[];
};

export type ModelTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ModelReply = {
  text: string;
  calls: { name: string; args: Record<string, unknown>; id?: string }[];
  parts: ModelPart[];
};

@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.config.get<string>('GEMINI_API_KEY'));
  }

  async generate(contents: ModelContent[], tools: ModelTool[]): Promise<ModelReply> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('La IA no está configurada');
    }
    const model = this.config.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const payload: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents,
    };
    if (tools.length > 0) {
      payload.tools = [{ functionDeclarations: tools }];
    }

    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000),
        });
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        throw new ServiceUnavailableException(
          timedOut ? 'El analista tardó demasiado. Intenta de nuevo.' : 'No se pudo conectar con el servicio de IA',
        );
      }
      if (response.ok || (response.status !== 429 && response.status !== 503) || attempt === 1) {
        break;
      }
      this.logger.warn(`Gemini ${response.status}; reintento`);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (!response?.ok) {
      const status = response?.status ?? 0;
      const detail = response ? await safeGeminiDetail(response, apiKey) : '';
      this.logger.warn(`Gemini respondió ${status}${detail ? `: ${detail}` : ''}`);
      throw new ServiceUnavailableException(messageForStatus(status));
    }

    const body = (await response.json()) as {
      candidates?: { content?: { parts?: ModelPart[] } }[];
    };
    const parts = body.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.flatMap((part) => {
      if (!part.functionCall?.name) {
        return [];
      }
      return [{ name: part.functionCall.name, args: part.functionCall.args ?? {}, id: part.functionCall.id }];
    });
    const text = parts
      .flatMap((part) => ('text' in part && part.text ? [part.text] : []))
      .join('\n')
      .trim();
    return { text, calls, parts };
  }
}

async function safeGeminiDetail(response: Response, secret: string): Promise<string> {
  try {
    const raw = (await response.text()).replaceAll(secret, '[redacted]');
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
    return typeof parsed.error?.message === 'string' ? parsed.error.message.slice(0, 180) : '';
  } catch {
    return '';
  }
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return 'La clave de la IA fue rechazada';
  }
  if (status === 404) {
    return 'El modelo de IA no está disponible';
  }
  if (status === 429 || status === 503) {
    return 'El analista está ocupado. Intenta de nuevo en unos minutos.';
  }
  return 'El servicio de IA respondió con error';
}

const SYSTEM_INSTRUCTION = [
  'Eres el analista de InvestAI. Respondes en español, con claridad y sin adornos.',
  'Todos los números financieros los calcula el backend. Tú solo los interpretas.',
  'Si un dato no viene en el resultado de una herramienta, di que no está disponible. No lo estimes ni lo completes.',
  'No inventes precios, noticias, fundamentales, rendimientos ni métricas de riesgo.',
  'No puedes crear, editar ni borrar movimientos, portafolios ni posiciones. Si te lo piden, explícalo y no intentes hacerlo.',
  'Usa solo las herramientas de lectura. Cuando cites una cifra, debe salir del resultado de una herramienta de esta conversación.',
].join(' ');
