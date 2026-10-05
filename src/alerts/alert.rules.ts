import { AlertKind } from '@prisma/client';

export function isAlertHit(kind: AlertKind, threshold: number, value: number): boolean {
  if (kind === AlertKind.PRICE_ABOVE || kind === AlertKind.RETURN_ABOVE) {
    return value >= threshold;
  }
  return value <= threshold;
}

export function cooldownActive(lastTriggeredAt: Date | null, hours: number, now = new Date()): boolean {
  if (!lastTriggeredAt || hours <= 0) {
    return false;
  }
  return now.getTime() - lastTriggeredAt.getTime() < hours * 60 * 60 * 1000;
}
