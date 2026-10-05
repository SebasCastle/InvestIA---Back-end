import { AlertKind } from '@prisma/client';
import { cooldownActive, isAlertHit } from './alert.rules';

describe('alert rules', () => {
  it('compares price and return thresholds', () => {
    expect(isAlertHit(AlertKind.PRICE_ABOVE, 100, 100)).toBe(true);
    expect(isAlertHit(AlertKind.PRICE_BELOW, 100, 101)).toBe(false);
    expect(isAlertHit(AlertKind.RETURN_BELOW, 5, 4)).toBe(true);
    expect(isAlertHit(AlertKind.RETURN_ABOVE, 5, 4)).toBe(false);
  });

  it('keeps a cooldown window', () => {
    const now = new Date('2026-10-02T00:00:00.000Z');
    expect(cooldownActive(new Date('2026-10-01T12:00:00.000Z'), 24, now)).toBe(true);
    expect(cooldownActive(new Date('2026-09-30T00:00:00.000Z'), 24, now)).toBe(false);
    expect(cooldownActive(null, 24, now)).toBe(false);
  });
});
