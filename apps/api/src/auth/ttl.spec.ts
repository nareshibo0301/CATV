import { ttlToMs } from './ttl';

describe('ttlToMs', () => {
  it('parses seconds, minutes, hours, and days', () => {
    expect(ttlToMs('15s')).toBe(15_000);
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('2h')).toBe(7_200_000);
    expect(ttlToMs('7d')).toBe(604_800_000);
  });

  it('rejects an unknown unit', () => {
    expect(() => ttlToMs('10w')).toThrow('Invalid TTL');
  });
});
