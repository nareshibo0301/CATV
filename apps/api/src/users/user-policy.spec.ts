import { planUserCreate } from './user-policy';
import type { CreateUserInput } from '@catv/shared';

const admin = { id: 'admin-1', role: 'ADMIN' as const };
const distributor = { id: 'dst-1', role: 'DISTRIBUTOR' as const };
const operator = { id: 'opr-1', role: 'OPERATOR' as const };

function input(partial: Partial<CreateUserInput> & Pick<CreateUserInput, 'role'>): CreateUserInput {
  return {
    name: 'Asha',
    email: 'asha@catv.local',
    password: 'ChangeMeNow!123',
    ...partial,
  };
}

describe('planUserCreate', () => {
  it('requires commission when an admin creates a distributor', () => {
    const missing = planUserCreate(admin, input({ role: 'DISTRIBUTOR' }));
    expect(missing.ok).toBe(false);
    const planned = planUserCreate(
      admin,
      input({ role: 'DISTRIBUTOR', commission: { type: 'PERCENTAGE', value: 10 } }),
    );
    expect(planned).toMatchObject({ ok: true, parentId: null, commissionRequired: true });
  });

  it('requires commission for an operator under a distributor and not for a direct operator', () => {
    const underDistributor = planUserCreate(
      admin,
      input({
        role: 'OPERATOR',
        parentId: 'dst-1',
        commission: { type: 'FIXED', value: 25 },
      }),
    );
    expect(underDistributor).toMatchObject({ ok: true, parentId: 'dst-1', commissionRequired: true });

    const direct = planUserCreate(admin, input({ role: 'OPERATOR' }));
    expect(direct).toMatchObject({ ok: true, parentId: admin.id, commissionRequired: false });

    const rejected = planUserCreate(
      admin,
      input({ role: 'OPERATOR', commission: { type: 'FIXED', value: 5 } }),
    );
    expect(rejected.ok).toBe(false);
  });

  it('lets a distributor create only operators and customers in their own tree', () => {
    expect(planUserCreate(distributor, input({ role: 'DISTRIBUTOR' })).ok).toBe(false);
    expect(planUserCreate(distributor, input({ role: 'OPERATOR' }))).toMatchObject({
      ok: true,
      parentId: distributor.id,
      commissionRequired: false,
    });
    expect(
      planUserCreate(distributor, input({ role: 'CUSTOMER', parentId: 'opr-9' })),
    ).toMatchObject({ ok: true, parentId: 'opr-9', parentMustBe: 'self-or-operator-in-subtree' });
  });

  it('lets an operator create only their own customers', () => {
    expect(planUserCreate(operator, input({ role: 'OPERATOR' })).ok).toBe(false);
    expect(planUserCreate(operator, input({ role: 'CUSTOMER' }))).toMatchObject({
      ok: true,
      parentId: operator.id,
    });
    expect(planUserCreate(operator, input({ role: 'CUSTOMER', parentId: 'other' })).ok).toBe(false);
  });

  it('blocks non-admins from custom attributes and commission', () => {
    expect(
      planUserCreate(distributor, input({ role: 'CUSTOMER', customData: { zone: 'North' } })).ok,
    ).toBe(false);
    expect(
      planUserCreate(
        distributor,
        input({ role: 'OPERATOR', commission: { type: 'PERCENTAGE', value: 5 } }),
      ).ok,
    ).toBe(false);
  });
});
