import { placementForCustomer } from './placement';

describe('connection placement', () => {
  it('credits a distributor when the operator works under them, and nobody when the operator is direct', () => {
    expect(
      placementForCustomer({
        id: 'op',
        role: 'OPERATOR',
        parent: { id: 'dst', role: 'DISTRIBUTOR' },
      }),
    ).toEqual({ operatorId: 'op', distributorId: 'dst' });
    expect(placementForCustomer({ id: 'op', role: 'OPERATOR', parent: { id: 'admin', role: 'ADMIN' } })).toEqual({
      operatorId: 'op',
      distributorId: null,
    });
  });
});