/**
 * Modular armour data structure (Phase 2).
 *
 * Shared by the actors module (which builds the visuals for equipped pieces
 * and adds their mass to the ragdoll) and the combat module (which asks what
 * protects a hit zone and runs the mitigation maths). Pure data + pure
 * functions: no three.js, no physics.
 *
 * Vocabulary:
 *   - ArmorType 'none' is bare flesh / ordinary clothing ("Flesh" in the UI).
 *   - A piece covers one or more hit zones; several pieces may layer over the
 *     same zone (e.g. mail over a gambeson). Layers are ordered outermost first.
 */
import type { ArmorType, BodyPartId, DamageType } from './contracts';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export interface DamageResistance {
  /** Fraction of the incoming energy this layer soaks up when it holds (0..1). */
  absorb: number;
  /**
   * Energy in joules the strike must carry at this layer to defeat it.
   * Below it the layer holds: nothing reaches the next layer except the
   * `transmit` fraction of energy (blunt trauma through the armour).
   */
  penetrationJ: number;
  /** Fraction of the energy that still reaches the body when the layer holds. */
  transmit: number;
}

export type ImpactEffect = 'blood' | 'sparks' | 'fibres';
export type ImpactSound = 'flesh' | 'cloth' | 'mail' | 'plate';

export interface ArmorMaterial {
  type: ArmorType;
  displayName: string;
  resist: Record<DamageType, DamageResistance>;
  /** What a hit that does NOT get through looks/sounds like. */
  blockedEffect: ImpactEffect;
  blockedSound: ImpactSound;
}

/**
 * Tuned against real-world figures: a committed longsword cut delivers
 * roughly 60–150 J; a warhammer blow 100–200 J; a thrust concentrates 40–100 J
 * on a few mm². Tempered plate is effectively immune to sword cuts, mail
 * stops cuts but not determined thrusts, and neither stops concussion.
 */
export const ARMOR_MATERIALS: Readonly<Record<ArmorType, ArmorMaterial>> = {
  none: {
    type: 'none',
    displayName: 'Flesh',
    resist: {
      cut: { absorb: 0, penetrationJ: 0, transmit: 1 },
      thrust: { absorb: 0, penetrationJ: 0, transmit: 1 },
      blunt: { absorb: 0, penetrationJ: 0, transmit: 1 },
    },
    blockedEffect: 'blood',
    blockedSound: 'flesh',
  },
  cloth: {
    type: 'cloth',
    displayName: 'Cloth',
    resist: {
      cut: { absorb: 0.1, penetrationJ: 6, transmit: 0.6 },
      thrust: { absorb: 0.05, penetrationJ: 4, transmit: 0.6 },
      blunt: { absorb: 0.05, penetrationJ: Infinity, transmit: 0.95 },
    },
    blockedEffect: 'fibres',
    blockedSound: 'cloth',
  },
  gambeson: {
    type: 'gambeson',
    displayName: 'Gambeson',
    resist: {
      cut: { absorb: 0.4, penetrationJ: 45, transmit: 0.35 },
      thrust: { absorb: 0.25, penetrationJ: 30, transmit: 0.4 },
      blunt: { absorb: 0.35, penetrationJ: Infinity, transmit: 0.65 },
    },
    blockedEffect: 'fibres',
    blockedSound: 'cloth',
  },
  mail: {
    type: 'mail',
    displayName: 'Mail',
    resist: {
      cut: { absorb: 0.85, penetrationJ: 160, transmit: 0.25 },
      thrust: { absorb: 0.5, penetrationJ: 70, transmit: 0.3 },
      blunt: { absorb: 0.2, penetrationJ: Infinity, transmit: 0.8 },
    },
    blockedEffect: 'sparks',
    blockedSound: 'mail',
  },
  plate: {
    type: 'plate',
    displayName: 'Plate',
    resist: {
      // "Plate drastically reduces slashing damage": a sword cut essentially never
      // defeats it, and only a small fraction arrives as concussion.
      cut: { absorb: 0.95, penetrationJ: 450, transmit: 0.08 },
      thrust: { absorb: 0.8, penetrationJ: 220, transmit: 0.15 },
      // Percussion is plate's weakness: most of a hammer blow still arrives.
      blunt: { absorb: 0.4, penetrationJ: Infinity, transmit: 0.6 },
    },
    blockedEffect: 'sparks',
    blockedSound: 'plate',
  },
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export type ArmorSlot = 'helmet' | 'neck' | 'torsoOuter' | 'torsoInner' | 'arms' | 'hands' | 'legs' | 'feet';

export interface ArmorPieceDef {
  id: string;
  displayName: string;
  slot: ArmorSlot;
  type: ArmorType;
  /** Hit zones this piece protects. */
  covers: readonly BodyPartId[];
  /** kg — added to the ragdoll bodies of the covered zones. */
  mass: number;
  /**
   * Fraction of the zone's surface that is actually protected (visor slits,
   * armpits, joints). The damage system may roll against it for gap hits.
   */
  coverage: number;
  /** Layer order when several pieces cover a zone: higher = further outside. */
  layer: number;
}

/** Catalogue of known pieces. The visuals for each id live in src/actors. */
export const ARMOR_PIECES = {
  plateHelmet: {
    id: 'plateHelmet', displayName: 'Close Helm', slot: 'helmet', type: 'plate',
    covers: ['head'], mass: 2.8, coverage: 0.97, layer: 3,
  },
  mailAventail: {
    id: 'mailAventail', displayName: 'Mail Aventail', slot: 'neck', type: 'mail',
    covers: ['neck'], mass: 1.2, coverage: 0.95, layer: 2,
  },
  gambesonJack: {
    id: 'gambesonJack', displayName: 'Gambeson', slot: 'torsoInner', type: 'gambeson',
    covers: ['chest', 'abdomen', 'pelvis', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR'], mass: 3.5, coverage: 1, layer: 1,
  },
  breastplate: {
    id: 'breastplate', displayName: 'Breastplate', slot: 'torsoOuter', type: 'plate',
    covers: ['chest', 'abdomen'], mass: 6.5, coverage: 0.9, layer: 3,
  },
  plateVambraces: {
    id: 'plateVambraces', displayName: 'Vambraces', slot: 'arms', type: 'plate',
    covers: ['forearmL', 'forearmR'], mass: 1.6, coverage: 0.85, layer: 3,
  },
  leatherGauntlets: {
    id: 'leatherGauntlets', displayName: 'Leather Gauntlets', slot: 'hands', type: 'cloth',
    covers: ['handL', 'handR'], mass: 0.5, coverage: 1, layer: 2,
  },
  plateLegs: {
    id: 'plateLegs', displayName: 'Cuisses & Greaves', slot: 'legs', type: 'plate',
    covers: ['thighL', 'thighR', 'shinL', 'shinR'], mass: 6.0, coverage: 0.85, layer: 3,
  },
} as const satisfies Record<string, ArmorPieceDef>;

export type ArmorPieceId = keyof typeof ARMOR_PIECES;

/** Named loadouts. `helmetOnly` is the Phase 2 default: plate helmet, flesh everywhere else. */
export const ARMOR_PRESETS: Readonly<Record<string, readonly ArmorPieceId[]>> = {
  helmetOnly: ['plateHelmet'],
  manAtArms: ['plateHelmet', 'mailAventail', 'gambesonJack', 'breastplate', 'plateVambraces', 'leatherGauntlets'],
  knight: ['plateHelmet', 'mailAventail', 'gambesonJack', 'breastplate', 'plateVambraces', 'leatherGauntlets', 'plateLegs'],
};

export const DEFAULT_ARMOR_PRESET = 'helmetOnly';

// ---------------------------------------------------------------------------
// Loadout
// ---------------------------------------------------------------------------

/** The armour a character is currently wearing, one piece per slot. */
export class ArmorLoadout {
  private readonly bySlot = new Map<ArmorSlot, ArmorPieceDef>();
  private readonly listeners = new Set<(loadout: ArmorLoadout) => void>();

  constructor(pieces: Iterable<ArmorPieceDef> = []) {
    for (const p of pieces) this.bySlot.set(p.slot, p);
  }

  static fromPreset(name: string): ArmorLoadout {
    const ids = ARMOR_PRESETS[name];
    if (!ids) throw new Error(`Unknown armour preset "${name}"`);
    return new ArmorLoadout(ids.map((id) => ARMOR_PIECES[id]));
  }

  /** Equip a piece, replacing whatever occupied its slot. */
  equip(piece: ArmorPieceDef): void {
    this.bySlot.set(piece.slot, piece);
    this.changed();
  }

  unequip(slot: ArmorSlot): void {
    if (this.bySlot.delete(slot)) this.changed();
  }

  /** Replace everything with a named preset. */
  applyPreset(name: string): void {
    const ids = ARMOR_PRESETS[name];
    if (!ids) throw new Error(`Unknown armour preset "${name}"`);
    this.bySlot.clear();
    for (const id of ids) this.bySlot.set(ARMOR_PIECES[id].slot, ARMOR_PIECES[id]);
    this.changed();
  }

  get pieces(): ArmorPieceDef[] {
    return [...this.bySlot.values()];
  }

  getSlot(slot: ArmorSlot): ArmorPieceDef | undefined {
    return this.bySlot.get(slot);
  }

  /** All pieces over a zone, outermost first. Empty = flesh. */
  layersAt(part: BodyPartId): ArmorPieceDef[] {
    const out: ArmorPieceDef[] = [];
    for (const p of this.bySlot.values()) if (p.covers.includes(part)) out.push(p);
    return out.sort((a, b) => b.layer - a.layer);
  }

  /** Outermost armour type over a zone ('none' = flesh). */
  armorAt(part: BodyPartId): ArmorType {
    return this.layersAt(part)[0]?.type ?? 'none';
  }

  /** Extra kg carried by the zone's rigid body. */
  massAt(part: BodyPartId): number {
    let kg = 0;
    for (const p of this.bySlot.values()) {
      if (p.covers.includes(part)) kg += p.mass / p.covers.length;
    }
    return kg;
  }

  onChange(fn: (loadout: ArmorLoadout) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn(this);
  }
}

// ---------------------------------------------------------------------------
// Mitigation
// ---------------------------------------------------------------------------

export interface MitigationResult {
  /** Energy (J) that reaches the flesh. */
  transmittedJ: number;
  /** True if every layer was defeated (open wound possible). */
  penetrated: boolean;
  /** The layer that stopped the strike, or null if it went through / there was none. */
  stoppedBy: ArmorPieceDef | null;
  /** What the impact should look/sound like. */
  effect: ImpactEffect;
  sound: ImpactSound;
}

/**
 * Run a strike of `energyJ` joules and `type` through the layers over a zone
 * (outermost first). Each defeated layer absorbs its share of the energy; the
 * first layer that holds stops penetration and only passes on its `transmit`
 * fraction as blunt trauma.
 */
export function mitigate(layers: readonly ArmorPieceDef[], type: DamageType, energyJ: number): MitigationResult {
  let e = Math.max(0, energyJ);
  for (const layer of layers) {
    const mat = ARMOR_MATERIALS[layer.type];
    const r = mat.resist[type];
    if (e < r.penetrationJ) {
      return {
        transmittedJ: e * r.transmit,
        penetrated: false,
        stoppedBy: layer,
        effect: mat.blockedEffect,
        sound: mat.blockedSound,
      };
    }
    e *= 1 - r.absorb;
  }
  return { transmittedJ: e, penetrated: true, stoppedBy: null, effect: 'blood', sound: 'flesh' };
}
