import { Logger } from '@nestjs/common';
import { MarketDataError } from './market-data.provider';

const logger = new Logger('MarketDataHttp');

export async function providerRequest<T>(options: {
  provider: string;
  url: URL;
  secret: string;
  timeoutMs?: number;
}): Promise<T> {
  let lastError: MarketDataError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(options.url, { signal: AbortSignal.timeout(options.timeoutMs ?? 8000) });
      if (response.ok) {
        return (await response.json()) as T;
      }
      const detail = await safeDetail(response, options.secret);
      logger.warn(`${options.provider} ${response.status} ${options.url.pathname}${detail ? `: ${detail}` : ''}`);
      const error = new MarketDataError(messageFor(options.provider, response.status), statusFor(response.status));
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        lastError = error;
        await delay(400);
        continue;
      }
      throw error;
    } catch (error) {
      if (error instanceof MarketDataError) {
        throw error;
      }
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      logger.warn(`${options.provider} no respondió en ${options.url.pathname}: ${timedOut ? 'timeout' : 'red'}`);
      const wrapped = new MarketDataError(
        timedOut ? `${options.provider} no respondió a tiempo` : `No se pudo conectar con ${options.provider}`,
      );
      if (attempt === 0) {
        lastError = wrapped;
        await delay(400);
        continue;
      }
      throw wrapped;
    }
  }
  throw lastError ?? new MarketDataError(`${options.provider} no está disponible en este momento`);
}

async function safeDetail(response: Response, secret: string): Promise<string> {
  try {
    const raw = (await response.text()).replaceAll(secret, '[redacted]');
    const parsed = JSON.parse(raw) as { error?: unknown; 'Error Message'?: unknown };
    const message = parsed.error ?? parsed['Error Message'];
    return typeof message === 'string' ? message.slice(0, 180) : '';
  } catch {
    return '';
  }
}

function messageFor(provider: string, status: number): string {
  if (status === 401) {
    return `La clave de ${provider} fue rechazada`;
  }
  if (status === 403) {
    return `${provider} denegó el acceso a este recurso`;
  }
  if (status === 404) {
    return `${provider} no encontró ese recurso`;
  }
  if (status === 429) {
    return `${provider} limitó las consultas. Espera un momento y vuelve a intentar.`;
  }
  if (status >= 500) {
    return `${provider} no está disponible en este momento`;
  }
  return `${provider} respondió con un error inesperado`;
}

function statusFor(status: number): number {
  if (status === 401 || status === 403 || status === 404 || status === 429) {
    return status;
  }
  return status >= 500 ? 503 : 502;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
