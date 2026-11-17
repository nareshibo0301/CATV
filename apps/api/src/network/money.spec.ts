import { commissionAmount, invoiceTotals, outstanding } from './money';

describe('billing math', () => {
  it('adds tax and keeps an outstanding balance after a partial payment', () => {
    const totals = invoiceTotals(100, 18);
    expect(totals).toEqual({ subtotal: 100, tax: 18, total: 118 });
    expect(outstanding(totals.total, 40)).toBe(78);
    expect(outstanding(totals.total, 118)).toBe(0);
  });

  it('scales commission with the amount actually paid', () => {
    expect(commissionAmount('PERCENTAGE', 10, 50, 100)).toBe(5);
    expect(commissionAmount('FIXED', 40, 25, 100)).toBe(10);
    expect(commissionAmount('PERCENTAGE', 10, 0, 100)).toBe(0);
  });
});
