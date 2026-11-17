import { scopeAllows } from './scopes.decorator';

describe('API key scopes', () => {
  it('rejects a key that is missing the scope', () => {
    expect(scopeAllows(['connections:read'], ['connections:write'])).toBe(false);
    expect(scopeAllows(['payments:write'], ['payments:write'])).toBe(true);
    expect(scopeAllows([], ['invoices:read'])).toBe(false);
  });
});
