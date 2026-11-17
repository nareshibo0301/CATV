export type DataScope = { kind: 'all' } | { kind: 'ids'; ids: string[] };

/** Prisma `where` fragment for user id visibility. An empty object means unrestricted. */
export function userIdFilter(scope: DataScope): { id?: { in: string[] } } {
  if (scope.kind === 'all') {
    return {};
  }
  return { id: { in: scope.ids } };
}
