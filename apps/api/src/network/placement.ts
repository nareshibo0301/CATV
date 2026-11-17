export interface ParentLink {
  id: string;
  role: string;
  parent?: ParentLink | null;
}

/** Denormalise the distributor and operator that own a customer, for reports and commission. */
export function placementForCustomer(parent: ParentLink | null | undefined): {
  distributorId: string | null;
  operatorId: string | null;
} {
  if (!parent) {
    return { distributorId: null, operatorId: null };
  }
  if (parent.role === 'OPERATOR') {
    return {
      operatorId: parent.id,
      distributorId: parent.parent?.role === 'DISTRIBUTOR' ? parent.parent.id : null,
    };
  }
  if (parent.role === 'DISTRIBUTOR') {
    return { distributorId: parent.id, operatorId: null };
  }
  return { distributorId: null, operatorId: null };
}
