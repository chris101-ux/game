/**
 * Cross-module contracts.
 *
 * Every gameplay module (render, actors, weapons, combat, gore, ui) talks to the
 * others ONLY through the types in this file and the typed EventBus. That keeps
 * the modules independently replaceable (e.g. swap the procedural dummy for a
 * skinned knight later without touching the damage code).
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';

// ---------------------------------------------------------------------------
// Anatomy
// ---------------------------------------------------------------------------

/**
 * Granular hit zones. Each maps to at least one collider on a ragdoll.
 * `neck` is a dedicated hit zone (a collider) even if it shares a rigid body
 * with the head or chest.
 */
export type BodyPartId =
  | 'head'
  | 'neck'
  | 'chest'
  | 'abdomen'
  | 'pelvis'
  | 'upperArmL'
  | 'forearmL'
  | 'handL'
  | 'upperArmR'
  | 'forearmR'
  | 'handR'
  | 'thighL'
  | 'shinL'
  | 'footL'
  | 'thighR'
  | 'shinR'
  | 'footR';

export const BODY_PARTS: readonly BodyPartId[] = [
  'head', 'neck', 'chest', 'abdomen', 'pelvis',
  'upperArmL', 'forearmL', 'handL',
  'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
];

export type Side = 'L' | 'R';

/** Coarse functional group of a part, used by the damage rules. */
export type BodyRegion = 'head' | 'neck' | 'torso' | 'arm' | 'hand' | 'leg' | 'foot';

export function regionOf(part: BodyPartId): BodyRegion {
  switch (part) {
    case 'head': return 'head';
    case 'neck': return 'neck';
    case 'chest': case 'abdomen': case 'pelvis': return 'torso';
    case 'upperArmL': case 'forearmL': case 'upperArmR': case 'forearmR': return 'arm';
    case 'handL': case 'handR': return 'hand';
    case 'thighL': case 'shinL': case 'thighR': case 'shinR': return 'leg';
    case 'footL': case 'footR': return 'foot';
  }
}

export function sideOf(part: BodyPartId): Side | null {
  const last = part[part.length - 1];
  return last === 'L' ? 'L' : last === 'R' ? 'R' : null;
}

// ---------------------------------------------------------------------------
// Damage model
// ---------------------------------------------------------------------------

/** cut = edge travelling across the surface, thrust = point driven in, blunt = mass/percussion. */
export type DamageType = 'cut' | 'thrust' | 'blunt';

/** Armor layers, weakest to strongest vs. cuts. Plate is weak vs. heavy blunt trauma. */
export type ArmorType = 'none' | 'cloth' | 'gambeson' | 'mail' | 'plate';

/** Which part of a weapon made contact. */
export type WeaponZone =
  | 'edge'      // sharpened blade edge -> cut
  | 'point'     // tip -> thrust
  | 'flat'      // blade flat -> weak blunt
  | 'guard'     // crossguard -> blunt
  | 'pommel'    // pommel -> blunt (mordhau / pommel strike)
  | 'haft'      // pole/grip shaft -> weak blunt
  | 'hammer'    // hammer face -> heavy blunt
  | 'spike'     // beak / top spike -> thrust
  | 'axe'       // poleaxe blade -> cut
  | 'shield';   // shield bash -> blunt

export type WeaponLoadoutId = 'longsword' | 'swordShield' | 'poleaxe' | 'warhammerShield';

export interface WeaponDef {
  id: WeaponLoadoutId;
  displayName: string;
  /** kg — historically plausible (longsword ~1.4 kg). */
  mass: number;
  /** metres, from pommel end to tip. */
  length: number;
  /** metres from the pommel end along the weapon axis. */
  centerOfMass: number;
  /** metres from the pommel end — where the lead hand grips. */
  gripPoint: number;
}

// ---------------------------------------------------------------------------
// Collider tagging (physics <-> gameplay bridge)
// ---------------------------------------------------------------------------

export type ColliderTag =
  | { kind: 'bodyPart'; target: IRagdollTarget; part: BodyPartId }
  | { kind: 'weapon'; weapon: IWeapon; zone: WeaponZone }
  | { kind: 'static'; surface: 'stone' | 'wood' | 'dirt' | 'metal' }
  | { kind: 'prop'; surface: 'stone' | 'wood' | 'dirt' | 'metal'; object?: THREE.Object3D };

// ---------------------------------------------------------------------------
// Ragdoll target (implemented in src/actors)
// ---------------------------------------------------------------------------

export type LimbCondition = 'healthy' | 'bruised' | 'wounded' | 'disabled' | 'severed';

export interface SeverResult {
  /** The part that was cut off (it and everything distal to it detaches). */
  part: BodyPartId;
  /** World-space centre of the wound on the body side (stump). */
  stumpPoint: THREE.Vector3;
  /** World-space outward normal of the stump wound. */
  stumpNormal: THREE.Vector3;
  /** Object3D the stump cap / blood emitter should be parented to (moves with the body). */
  stumpParent: THREE.Object3D;
  /** Object3D of the detached piece (root of the severed chain). */
  severedObject: THREE.Object3D;
  /** Rigid body of the detached piece (still simulated, now free). */
  severedBody: RAPIER.RigidBody;
  /** Local-space (of severedObject) centre + normal of the wound on the severed piece. */
  severedLocalPoint: THREE.Vector3;
  severedLocalNormal: THREE.Vector3;
  /** Approximate radius of the cut cross-section, metres. */
  radius: number;
}

export interface IRagdollTarget {
  readonly id: string;
  readonly displayName: string;
  /** Root visual object (added to the scene by the target itself). */
  readonly root: THREE.Object3D;
  isAlive(): boolean;
  /** Armor covering a hit zone. */
  getArmor(part: BodyPartId): ArmorType;
  getCondition(part: BodyPartId): LimbCondition;
  /** Rigid body that carries this hit zone (may be shared, e.g. neck -> head). */
  getPartBody(part: BodyPartId): RAPIER.RigidBody | null;
  /** Visual node that moves with the part (decals / wound meshes parent here). */
  getPartObject(part: BodyPartId): THREE.Object3D | null;
  /** Meshes that belong to a part (for projecting decals onto the surface). */
  getPartMeshes(part: BodyPartId): THREE.Mesh[];
  /**
   * Functional impairment 0..1 (0 = fine, 1 = fully disabled).
   * Legs -> limp / buckle, arms -> weak / drop weapon, torso -> hunch.
   */
  setImpairment(part: BodyPartId, amount: number): void;
  /** Force the target to let go of whatever it holds in the given hand. */
  disarm(side: Side): void;
  /** Kill: active-ragdoll motors go limp, full ragdoll collapse. */
  kill(cause: string): void;
  /**
   * Physically detach `part` (and everything distal to it) by removing the joint.
   * Returns null if the part cannot be severed (e.g. torso) or already is.
   */
  sever(part: BodyPartId): SeverResult | null;
  /** Apply a flinch/stagger reaction (world-space impulse at a point). */
  applyHitReaction(part: BodyPartId, impulse: THREE.Vector3, point: THREE.Vector3): void;
  /** Restore to a fresh standing state (used by the R key and the test harness). */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Weapon (implemented in src/weapons)
// ---------------------------------------------------------------------------

export interface IWeapon {
  readonly def: WeaponDef;
  readonly body: RAPIER.RigidBody;
  readonly object: THREE.Object3D;
  /** World-space velocity of the material point currently at `worldPoint`. */
  velocityAtPoint(worldPoint: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  /** Unit axis from pommel toward tip, world space. */
  getAxis(out: THREE.Vector3): THREE.Vector3;
  /** Unit normal of the cutting edge plane (edge direction), world space. */
  getEdgeDirection(out: THREE.Vector3): THREE.Vector3;
}

// ---------------------------------------------------------------------------
// Player (implemented in src/weapons + src/player)
// ---------------------------------------------------------------------------

export type StrikeStyle =
  | 'oberhau'     // descending diagonal cut from the right shoulder
  | 'unterhau'    // rising cut from below
  | 'mittelhau'   // horizontal cut
  | 'zornhau'     // powerful descending diagonal (wrath cut)
  | 'scheitelhau' // vertical top-down cut to the head
  | 'thrust';     // stab with the point

export interface IPlayerController {
  readonly weapon: IWeapon;
  /**
   * Automated attack used by the test harness / demo: winds up and strikes so
   * that the weapon passes through `target` (world space) around `duration` s later.
   */
  scriptedStrike(target: THREE.Vector3, style: StrikeStyle, duration?: number): void;
  /** Return weapon and player to the guard stance at spawn. */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface HitEvent {
  target: IRagdollTarget;
  part: BodyPartId;
  weapon: IWeapon | null;
  zone: WeaponZone;
  damageType: DamageType;
  armor: ArmorType;
  /** World-space impact point + surface normal (pointing out of the victim). */
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** World-space direction the striking surface was travelling. */
  direction: THREE.Vector3;
  /** Relative speed along the contact normal, m/s. */
  impactSpeed: number;
  /** Kinetic energy delivered, joules. */
  energy: number;
  /** Final damage after armor, 0..∞ (100 ≈ lethal to a healthy part). */
  damage: number;
  /** True if the strike defeated the armor. */
  penetrated: boolean;
  /** Severity bucket, drives VFX intensity. */
  severity: 'glancing' | 'light' | 'heavy' | 'lethal';
}

export interface PartStateEvent {
  target: IRagdollTarget;
  part: BodyPartId;
  condition: LimbCondition;
  /** Human-readable, e.g. "Left leg disabled". */
  message: string;
}

export type LogLevel = 'info' | 'hit' | 'heavy' | 'lethal' | 'system';

export interface GameEvents {
  hit: HitEvent;
  partState: PartStateEvent;
  death: { target: IRagdollTarget; part: BodyPartId; cause: string };
  sever: { target: IRagdollTarget; result: SeverResult; hit: HitEvent | null };
  disarm: { target: IRagdollTarget; side: Side };
  /** Metal-on-metal / armor deflection, for sparks + sound. */
  deflect: { point: THREE.Vector3; normal: THREE.Vector3; intensity: number };
  /** Anything that should appear in the combat log / console. */
  log: { text: string; level: LogLevel };
  /** Target reset to a fresh state (clear decals etc.). */
  reset: { target: IRagdollTarget };
  /** Camera shake / hit-stop request from gameplay code. */
  impactFeedback: { strength: number; hitStop: number };
}
