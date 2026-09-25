import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { ColliderTag } from '../core/contracts';

export { RAPIER };

export type CollisionListener = (c1: RAPIER.Collider, c2: RAPIER.Collider, started: boolean) => void;

export interface ContactForceData {
  collider1: RAPIER.Collider;
  collider2: RAPIER.Collider;
  totalForceMagnitude: number;
  maxForceMagnitude: number;
  maxForceDirection: THREE.Vector3;
}
export type ContactForceListener = (e: ContactForceData) => void;

interface VisualLink {
  body: RAPIER.RigidBody;
  object: THREE.Object3D;
  /** Offset of the visual relative to the body frame. */
  offsetPos: THREE.Vector3;
  offsetQuat: THREE.Quaternion;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currPos: THREE.Vector3;
  currQuat: THREE.Quaternion;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _pm = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);

/**
 * Owns the Rapier world, the collision event queue, collider tagging and
 * interpolated body -> mesh synchronisation.
 *
 * Fixed 120 Hz step with CCD-capable bodies: fast blades (tip speeds of
 * 20–40 m/s) move ~0.2–0.3 m per step, which CCD + soft-CCD handles without
 * tunnelling through a forearm.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly eventQueue: RAPIER.EventQueue;
  private readonly tags = new Map<number, ColliderTag>();
  private readonly collisionListeners = new Set<CollisionListener>();
  private readonly forceListeners = new Set<ContactForceListener>();
  private readonly links: VisualLink[] = [];
  /** Total simulated seconds. */
  time = 0;

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ip = this.world.integrationParameters;
    // More solver iterations -> stiffer ragdoll joints, less jitter under heavy impacts.
    ip.numSolverIterations = 8;
    ip.numInternalPgsIterations = 2;
    this.world.timestep = 1 / 120;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  get rapier(): typeof RAPIER {
    return RAPIER;
  }

  // ---------------------------------------------------------------- tagging

  tag(collider: RAPIER.Collider, tag: ColliderTag): void {
    this.tags.set(collider.handle, tag);
  }

  untag(collider: RAPIER.Collider): void {
    this.tags.delete(collider.handle);
  }

  getTag(collider: RAPIER.Collider | number): ColliderTag | undefined {
    return this.tags.get(typeof collider === 'number' ? collider : collider.handle);
  }

  // ---------------------------------------------------------------- events

  onCollision(listener: CollisionListener): () => void {
    this.collisionListeners.add(listener);
    return () => this.collisionListeners.delete(listener);
  }

  onContactForce(listener: ContactForceListener): () => void {
    this.forceListeners.add(listener);
    return () => this.forceListeners.delete(listener);
  }

  /**
   * Iterate the solver contact points between two colliders (world space).
   * Returns false if the pair is not currently in contact.
   */
  forEachContact(
    c1: RAPIER.Collider,
    c2: RAPIER.Collider,
    fn: (point: THREE.Vector3, normal: THREE.Vector3, depth: number) => void,
  ): boolean {
    let any = false;
    this.world.contactPair(c1, c2, (manifold, flipped) => {
      const n = manifold.normal();
      // Normal points from c1 to c2 in manifold space; flip if Rapier swapped the pair.
      const normal = new THREE.Vector3(n.x, n.y, n.z);
      if (flipped) normal.negate();
      const count = manifold.numSolverContacts();
      for (let i = 0; i < count; i++) {
        const p = manifold.solverContactPoint(i);
        if (!p) continue;
        any = true;
        fn(new THREE.Vector3(p.x, p.y, p.z), normal, manifold.solverContactDist(i));
      }
    });
    return any;
  }

  // ---------------------------------------------------------------- stepping

  step(dt: number): void {
    this.world.timestep = dt;
    for (const l of this.links) {
      l.prevPos.copy(l.currPos);
      l.prevQuat.copy(l.currQuat);
    }
    this.world.step(this.eventQueue);
    this.time += dt;

    if (this.collisionListeners.size) {
      this.eventQueue.drainCollisionEvents((h1, h2, started) => {
        const c1 = this.world.getCollider(h1);
        const c2 = this.world.getCollider(h2);
        if (!c1 || !c2) return;
        for (const l of this.collisionListeners) l(c1, c2, started);
      });
    } else {
      this.eventQueue.drainCollisionEvents(() => {});
    }

    this.eventQueue.drainContactForceEvents((e) => {
      if (!this.forceListeners.size) return;
      const c1 = this.world.getCollider(e.collider1());
      const c2 = this.world.getCollider(e.collider2());
      if (!c1 || !c2) return;
      const d = e.maxForceDirection();
      const data: ContactForceData = {
        collider1: c1,
        collider2: c2,
        totalForceMagnitude: e.totalForceMagnitude(),
        maxForceMagnitude: e.maxForceMagnitude(),
        maxForceDirection: new THREE.Vector3(d.x, d.y, d.z),
      };
      for (const l of this.forceListeners) l(data);
    });

    for (const l of this.links) this.captureLink(l);
  }

  // ---------------------------------------------------------------- visuals

  /**
   * Drive `object` from `body` every rendered frame, interpolating between the
   * last two physics states so motion is smooth at any refresh rate.
   * `object` may have any parent; world transforms are converted to local.
   */
  link(
    body: RAPIER.RigidBody,
    object: THREE.Object3D,
    offsetPos = new THREE.Vector3(),
    offsetQuat = new THREE.Quaternion(),
  ): void {
    const l: VisualLink = {
      body,
      object,
      offsetPos: offsetPos.clone(),
      offsetQuat: offsetQuat.clone(),
      prevPos: new THREE.Vector3(),
      prevQuat: new THREE.Quaternion(),
      currPos: new THREE.Vector3(),
      currQuat: new THREE.Quaternion(),
    };
    this.captureLink(l);
    l.prevPos.copy(l.currPos);
    l.prevQuat.copy(l.currQuat);
    this.links.push(l);
  }

  unlink(objectOrBody: THREE.Object3D | RAPIER.RigidBody): void {
    for (let i = this.links.length - 1; i >= 0; i--) {
      const l = this.links[i];
      if (l.object === objectOrBody || l.body === objectOrBody) this.links.splice(i, 1);
    }
  }

  /** Snap interpolation history (call after teleporting bodies). */
  resetInterpolation(body?: RAPIER.RigidBody): void {
    for (const l of this.links) {
      if (body && l.body !== body) continue;
      this.captureLink(l);
      l.prevPos.copy(l.currPos);
      l.prevQuat.copy(l.currQuat);
    }
  }

  /** alpha in [0,1]: fraction of the way from the previous to the current physics state. */
  syncVisuals(alpha: number): void {
    for (const l of this.links) {
      if (!this.world.bodies.contains(l.body.handle)) continue;
      _v.lerpVectors(l.prevPos, l.currPos, alpha);
      _q.slerpQuaternions(l.prevQuat, l.currQuat, alpha);
      const o = l.object;
      if (o.parent && !(o.parent as THREE.Scene).isScene) {
        o.parent.updateWorldMatrix(true, false);
        _m.compose(_v, _q, _s);
        _pm.copy(o.parent.matrixWorld).invert();
        _m.premultiply(_pm);
        _m.decompose(o.position, o.quaternion, _v.set(0, 0, 0));
      } else {
        o.position.copy(_v);
        o.quaternion.copy(_q);
      }
    }
  }

  private captureLink(l: VisualLink): void {
    if (!this.world.bodies.contains(l.body.handle)) return;
    const t = l.body.translation();
    const r = l.body.rotation();
    l.currQuat.set(r.x, r.y, r.z, r.w);
    l.currPos.set(t.x, t.y, t.z).add(_v.copy(l.offsetPos).applyQuaternion(l.currQuat));
    l.currQuat.multiply(l.offsetQuat);
  }
}
