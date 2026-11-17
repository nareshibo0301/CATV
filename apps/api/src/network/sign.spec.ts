import { safeEqual, signBody, timestampFresh } from './sign';

describe('webhook signatures', () => {
  it('rejects a bad signature and a stale timestamp', () => {
    const body = '{"eventId":"evt-1"}';
    const timestamp = String(Date.now());
    const signature = signBody('secret', timestamp, body);
    expect(safeEqual(signature, signBody('secret', timestamp, body))).toBe(true);
    expect(safeEqual(signature, signBody('other', timestamp, body))).toBe(false);
    expect(timestampFresh(String(Date.now() - 10 * 60 * 1000))).toBe(false);
    expect(timestampFresh(timestamp)).toBe(true);
  });
});
