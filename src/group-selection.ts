export function activeGroupsForBulk<T extends { id: string }>(
  groups: T[],
  deactivatedGroupIds: ReadonlySet<string>,
): T[] {
  return groups.filter((group) => !deactivatedGroupIds.has(group.id))
}
