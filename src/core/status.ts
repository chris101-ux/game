/**
 * Status effects (Phase 3): persistent conditions produced by the damage
 * system and consumed by whoever moves the character (active ragdoll
 * locomotion, player controller, AI).
 *
 * Pure data + a small container; no three.js / physics.
 */
import type { BodyPartId, Side } from './contracts';

export type StatusEffectId =
  /** A damaged leg/foot: slower movement, the leg drags. */
  | 'limping'
  /** Weapon hand/arm too damaged to hold the weapon. */
  | 'disarmed'
  /** Blunt trauma to the head (often transmitted through a helmet). */
  | 'concussed'
  /** Blunt trauma transmitted through armour to the torso/limbs (broken ribs, fractures). */
  | 'internalInjury'
  /** Open wound losing blood. */
  | 'bleeding';

export interface StatusEffect {
  id: StatusEffectId;
  /** 0..1 severity. */
  magnitude: number;
  side?: Side;
  part?: BodyPartId;
  /** Game time (engine.gameTime, s) at which it wears off; null = until reset. */
  expiresAt: number | null;
}

/** Movement speed multiplier while limping: a 60 % reduction. */
export const LIMP_SPEED_MULTIPLIER = 0.4;
/** Movement speed multiplier at full concussion (scales with magnitude). */
export const CONCUSSED_SPEED_MULTIPLIER = 0.6;

/** The set of active status effects on one character. One effect per (id, side). */
export class StatusEffects {
  private readonly effects = new Map<string, StatusEffect>();
  private readonly listeners = new Set<(effect: StatusEffect, active: boolean) => void>();

  private static key(id: StatusEffectId, side?: Side): string {
    return side ? `${id}:${side}` : id;
  }

  /** Add or strengthen an effect (keeps the higher magnitude and later expiry). */
  apply(effect: StatusEffect): void {
    const k = StatusEffects.key(effect.id, effect.side);
    const prev = this.effects.get(k);
    const next: StatusEffect = prev
      ? {
          ...effect,
          magnitude: Math.max(prev.magnitude, effect.magnitude),
          expiresAt: prev.expiresAt === null || effect.expiresAt === null
            ? null
            : Math.max(prev.expiresAt, effect.expiresAt),
        }
      : { ...effect };
    this.effects.set(k, next);
    for (const fn of this.listeners) fn(next, true);
  }

  remove(id: StatusEffectId, side?: Side): void {
    const k = StatusEffects.key(id, side);
    const e = this.effects.get(k);
    if (!e) return;
    this.effects.delete(k);
    for (const fn of this.listeners) fn(e, false);
  }

  has(id: StatusEffectId, side?: Side): boolean {
    if (side) return this.effects.has(StatusEffects.key(id, side));
    for (const e of this.effects.values()) if (e.id === id) return true;
    return false;
  }

  get(id: StatusEffectId, side?: Side): StatusEffect | undefined {
    if (side) return this.effects.get(StatusEffects.key(id, side));
    for (const e of this.effects.values()) if (e.id === id) return e;
    return undefined;
  }

  all(): StatusEffect[] {
    return [...this.effects.values()];
  }

  /** Combined locomotion speed multiplier (1 = unimpaired). */
  speedMultiplier(): number {
    let m = 1;
    if (this.has('limping')) m *= LIMP_SPEED_MULTIPLIER;
    const c = this.get('concussed');
    if (c) m *= 1 - (1 - CONCUSSED_SPEED_MULTIPLIER) * c.magnitude;
    return m;
  }

  /** Expire timed effects. Call once per frame with engine.gameTime. */
  update(gameTime: number): void {
    for (const e of [...this.effects.values()]) {
      if (e.expiresAt !== null && gameTime >= e.expiresAt) this.remove(e.id, e.side);
    }
  }

  clear(): void {
    for (const e of [...this.effects.values()]) this.remove(e.id, e.side);
  }

  onChange(fn: (effect: StatusEffect, active: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
