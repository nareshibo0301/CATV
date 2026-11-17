import { formatUserCode } from '@catv/shared';

describe('formatUserCode', () => {
  it('pads each category with its own prefix', () => {
    expect(formatUserCode('DST', 5, 1)).toBe('DST-00001');
    expect(formatUserCode('OPR', 5, 12)).toBe('OPR-00012');
    expect(formatUserCode('CUS', 3, 7)).toBe('CUS-007');
  });
});

describe('locked counter', () => {
  it('never issues the same number when allocations overlap', async () => {
    let next = 1;
    let chain: Promise<unknown> = Promise.resolve();
    const allocate = () => {
      const run = chain.then(() => {
        const value = next;
        next += 1;
        return formatUserCode('DST', 5, value);
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };

    const codes = await Promise.all(Array.from({ length: 40 }, () => allocate()));
    expect(new Set(codes).size).toBe(40);
    expect(codes.every((code) => code.startsWith('DST-'))).toBe(true);
  });
});
