/**
 * Rapier interaction groups: upper 16 bits = membership, lower 16 bits = filter.
 * Two colliders interact iff (a.membership & b.filter) && (b.membership & a.filter).
 */
export const Group = {
  STATIC: 1 << 0,
  RAGDOLL: 1 << 1,
  WEAPON: 1 << 2,
  PROP: 1 << 3,
  DEBRIS: 1 << 4,
  PLAYER: 1 << 5,
  /** Held weapons of NPCs (the dummy's sword). */
  NPC_WEAPON: 1 << 6,
  ALL: 0xffff,
} as const;

export function interactionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** Sensible defaults for each class of collider. */
export const Groups = {
  static: interactionGroups(Group.STATIC, Group.ALL),
  ragdoll: interactionGroups(Group.RAGDOLL, Group.ALL & ~Group.PLAYER),
  weapon: interactionGroups(Group.WEAPON, Group.STATIC | Group.RAGDOLL | Group.PROP | Group.DEBRIS | Group.NPC_WEAPON),
  npcWeapon: interactionGroups(Group.NPC_WEAPON, Group.STATIC | Group.WEAPON | Group.PROP | Group.DEBRIS),
  prop: interactionGroups(Group.PROP, Group.ALL),
  debris: interactionGroups(Group.DEBRIS, Group.ALL & ~Group.PLAYER),
  player: interactionGroups(Group.PLAYER, Group.STATIC | Group.PROP),
} as const;
