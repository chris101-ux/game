import * as THREE from 'three';
import type { Engine, GameSystem } from '../core/Engine';
import type {
  ArmorType, BodyPartId, IRagdollTarget, LimbCondition, SeverResult, Side,
} from '../core/contracts';
import { BODY_PARTS } from '../core/contracts';
import { RAPIER } from '../physics/PhysicsWorld';
import { Groups } from '../physics/CollisionGroups';

/**
 * STUB — replaced by the actors module (active ragdoll + armored visuals).
 *
 * A capsule ragdoll whose bodies are kinematic (frozen pose) while alive and
 * turn dynamic on death / severing. Good enough to hit things with.
 */

type BodyKey = Exclude<BodyPartId, 'neck'>;

interface PartSpec {
  a: [number, number, number];
  b: [number, number, number];
  r: number;
  parent: BodyKey | null;
  joint: [number, number, number];
}

// Dummy faces +Z; its left side is +X.
const SPEC: Record<BodyKey, PartSpec> = {
  pelvis: { a: [-0.1, 0.98, 0], b: [0.1, 0.98, 0], r: 0.1, parent: null, joint: [0, 0.98, 0] },
  abdomen: { a: [-0.08, 1.16, 0], b: [0.08, 1.16, 0], r: 0.1, parent: 'pelvis', joint: [0, 1.07, 0] },
  chest: { a: [-0.1, 1.38, 0], b: [0.1, 1.38, 0], r: 0.14, parent: 'abdomen', joint: [0, 1.25, 0] },
  head: { a: [0, 1.66, 0.01], b: [0, 1.70, 0.01], r: 0.11, parent: 'chest', joint: [0, 1.53, 0] },
  upperArmL: { a: [0.23, 1.46, 0], b: [0.25, 1.22, 0], r: 0.05, parent: 'chest', joint: [0.23, 1.48, 0] },
  forearmL: { a: [0.25, 1.18, 0], b: [0.26, 0.97, 0], r: 0.045, parent: 'upperArmL', joint: [0.25, 1.2, 0] },
  handL: { a: [0.26, 0.93, 0], b: [0.26, 0.85, 0], r: 0.04, parent: 'forearmL', joint: [0.26, 0.95, 0] },
  upperArmR: { a: [-0.23, 1.46, 0], b: [-0.25, 1.22, 0], r: 0.05, parent: 'chest', joint: [-0.23, 1.48, 0] },
  forearmR: { a: [-0.25, 1.18, 0], b: [-0.26, 0.97, 0], r: 0.045, parent: 'upperArmR', joint: [-0.25, 1.2, 0] },
  handR: { a: [-0.26, 0.93, 0], b: [-0.26, 0.85, 0], r: 0.04, parent: 'forearmR', joint: [-0.26, 0.95, 0] },
  thighL: { a: [0.1, 0.88, 0], b: [0.1, 0.56, 0], r: 0.07, parent: 'pelvis', joint: [0.1, 0.93, 0] },
  shinL: { a: [0.1, 0.48, 0], b: [0.1, 0.14, 0], r: 0.055, parent: 'thighL', joint: [0.1, 0.52, 0] },
  footL: { a: [0.1, 0.05, -0.05], b: [0.1, 0.05, 0.12], r: 0.045, parent: 'shinL', joint: [0.1, 0.1, 0] },
  thighR: { a: [-0.1, 0.88, 0], b: [-0.1, 0.56, 0], r: 0.07, parent: 'pelvis', joint: [-0.1, 0.93, 0] },
  shinR: { a: [-0.1, 0.48, 0], b: [-0.1, 0.14, 0], r: 0.055, parent: 'thighR', joint: [-0.1, 0.52, 0] },
  footR: { a: [-0.1, 0.05, -0.05], b: [-0.1, 0.05, 0.12], r: 0.045, parent: 'shinR', joint: [-0.1, 0.1, 0] },
};

interface PartRuntime {
  body: RAPIER.RigidBody;
  object: THREE.Object3D;
  meshes: THREE.Mesh[];
  joint: RAPIER.ImpulseJoint | null;
  center: THREE.Vector3;
  quat: THREE.Quaternion;
}

export interface RagdollDummyOptions {
  position: THREE.Vector3;
  facing: THREE.Vector3;
}

export class RagdollDummy implements IRagdollTarget, GameSystem {
  readonly id = 'dummy';
  readonly displayName = 'Training Dummy';
  readonly root = new THREE.Group();
  private parts = new Map<BodyKey, PartRuntime>();
  private conditions = new Map<BodyPartId, LimbCondition>();
  private alive = true;

  constructor(private readonly engine: Engine, private readonly opts: RagdollDummyOptions) {
    this.root.name = 'RagdollDummy';
    engine.scene.add(this.root);
    this.build();
  }

  private toWorld(p: [number, number, number]): THREE.Vector3 {
    const yaw = Math.atan2(this.opts.facing.x, this.opts.facing.z);
    return new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(this.opts.position);
  }

  private build(): void {
    const { world } = this.engine.physics;
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.7 });
    for (const key of Object.keys(SPEC) as BodyKey[]) {
      const s = SPEC[key];
      const a = this.toWorld(s.a);
      const b = this.toWorld(s.b);
      const center = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a);
      const half = dir.length() / 2;
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(center.x, center.y, center.z)
          .setRotation(quat)
          .setAngularDamping(2)
          .setLinearDamping(0.1),
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.capsule(half, s.r).setDensity(985).setFriction(0.8)
          .setCollisionGroups(Groups.ragdoll)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
        body,
      );
      this.engine.physics.tag(col, { kind: 'bodyPart', target: this, part: key });
      if (key === 'head') {
        const neck = world.createCollider(
          RAPIER.ColliderDesc.capsule(0.04, 0.055).setTranslation(0, -0.13, 0).setDensity(985)
            .setCollisionGroups(Groups.ragdoll)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
          body,
        );
        this.engine.physics.tag(neck, { kind: 'bodyPart', target: this, part: 'neck' });
      }

      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(s.r, half * 2, 8, 16), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const obj = new THREE.Group();
      obj.name = key;
      obj.add(mesh);
      this.root.add(obj);
      this.engine.physics.link(body, obj);
      this.parts.set(key, { body, object: obj, meshes: [mesh], joint: null, center, quat });
    }
    for (const key of Object.keys(SPEC) as BodyKey[]) {
      const s = SPEC[key];
      if (!s.parent) continue;
      const child = this.parts.get(key)!;
      const parent = this.parts.get(s.parent)!;
      const anchor = this.toWorld(s.joint);
      const a1 = this.localPoint(parent, anchor);
      const a2 = this.localPoint(child, anchor);
      const jd = RAPIER.JointData.spherical(a1, a2);
      const joint = world.createImpulseJoint(jd, parent.body, child.body, true);
      joint.setContactsEnabled(false);
      child.joint = joint;
    }
    for (const p of BODY_PARTS) this.conditions.set(p, 'healthy');
  }

  private localPoint(p: PartRuntime, world: THREE.Vector3): { x: number; y: number; z: number } {
    const t = p.body.translation();
    const r = p.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
    const v = world.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(q);
    return { x: v.x, y: v.y, z: v.z };
  }

  private key(part: BodyPartId): BodyKey {
    return part === 'neck' ? 'head' : part;
  }

  fixedUpdate(_dt: number): void {}

  isAlive(): boolean { return this.alive; }
  getArmor(part: BodyPartId): ArmorType { return part === 'head' ? 'plate' : 'gambeson'; }
  getCondition(part: BodyPartId): LimbCondition { return this.conditions.get(part) ?? 'healthy'; }
  getPartBody(part: BodyPartId) { return this.parts.get(this.key(part))?.body ?? null; }
  getPartObject(part: BodyPartId) { return this.parts.get(this.key(part))?.object ?? null; }
  getPartMeshes(part: BodyPartId) { return this.parts.get(this.key(part))?.meshes ?? []; }

  setImpairment(part: BodyPartId, amount: number): void {
    if (amount >= 1) this.conditions.set(part, 'disabled');
  }

  disarm(_side: Side): void {}

  kill(_cause: string): void {
    if (!this.alive) return;
    this.alive = false;
    for (const p of this.parts.values()) p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  }

  sever(part: BodyPartId): SeverResult | null {
    const key = this.key(part);
    const p = this.parts.get(key);
    const spec = SPEC[key];
    if (!p || !p.joint || !spec.parent) return null;
    const parent = this.parts.get(spec.parent)!;
    this.engine.physics.world.removeImpulseJoint(p.joint, true);
    p.joint = null;
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.conditions.set(part, 'severed');
    const anchor = this.toWorld(spec.joint);
    return {
      part,
      stumpPoint: anchor.clone(),
      stumpNormal: anchor.clone().sub(parent.center).normalize(),
      stumpParent: parent.object,
      severedObject: p.object,
      severedBody: p.body,
      severedLocalPoint: new THREE.Vector3(...Object.values(this.localPoint(p, anchor)) as [number, number, number]),
      severedLocalNormal: new THREE.Vector3(0, 1, 0),
      radius: spec.r,
    };
  }

  applyHitReaction(part: BodyPartId, impulse: THREE.Vector3, point: THREE.Vector3): void {
    const b = this.getPartBody(part);
    if (b && b.isDynamic()) b.applyImpulseAtPoint(impulse, point, true);
  }

  reset(): void {
    // Stub: rebuild everything from scratch.
    const { world } = this.engine.physics;
    for (const p of this.parts.values()) {
      this.engine.physics.unlink(p.body);
      world.removeRigidBody(p.body);
    }
    this.parts.clear();
    this.root.clear();
    this.alive = true;
    this.build();
    this.engine.events.emit('reset', { target: this });
  }
}
