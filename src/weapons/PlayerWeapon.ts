import * as THREE from 'three';
import type { Engine, GameSystem } from '../core/Engine';
import type { IPlayerController, IWeapon, StrikeStyle, WeaponDef } from '../core/contracts';
import { RAPIER } from '../physics/PhysicsWorld';
import { Groups } from '../physics/CollisionGroups';

/**
 * STUB — replaced by the weapons/player module.
 * A box "sword" driven toward a mouse-controlled target by a PD controller.
 */

const LONGSWORD: WeaponDef = {
  id: 'longsword', displayName: 'Longsword', mass: 1.4, length: 1.2, centerOfMass: 0.3, gripPoint: 0.15,
};

class StubWeapon implements IWeapon {
  readonly def = LONGSWORD;
  constructor(readonly body: RAPIER.RigidBody, readonly object: THREE.Object3D) {}
  velocityAtPoint(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const v = this.body.velocityAtPoint({ x: p.x, y: p.y, z: p.z });
    return out.set(v.x, v.y, v.z);
  }
  getAxis(out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    return out.set(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
  }
  getEdgeDirection(out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    return out.set(1, 0, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
  }
}

export interface PlayerOptions {
  spawn: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export class PlayerWeaponController implements GameSystem, IPlayerController {
  readonly weapon: StubWeapon;
  private target = new THREE.Vector3();
  private aim = new THREE.Vector2(0, 0);
  private script: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null;

  constructor(private readonly engine: Engine, private readonly opts: PlayerOptions) {
    const { world } = engine.physics;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setGravityScale(0).setAngularDamping(4).setLinearDamping(1)
        .setTranslation(opts.spawn.x, 1.3, opts.spawn.z - 0.6),
    );
    const blade = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.02, 0.45, 0.005).setTranslation(0, 0.45, 0).setMass(1.0)
        .setCollisionGroups(Groups.weapon).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const grip = world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.12, 0.015).setTranslation(0, -0.1, 0).setMass(0.4)
        .setCollisionGroups(Groups.weapon).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.9, 0.01).translate(0, 0.45, 0),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.25 }),
    );
    mesh.castShadow = true;
    const obj = new THREE.Group();
    obj.add(mesh);
    engine.scene.add(obj);
    engine.physics.link(body, obj);
    this.weapon = new StubWeapon(body, obj);
    engine.physics.tag(blade, { kind: 'weapon', weapon: this.weapon, zone: 'edge' });
    engine.physics.tag(grip, { kind: 'weapon', weapon: this.weapon, zone: 'pommel' });
    this.reset();
  }

  reset(): void {
    this.aim.set(0, 0);
    this.script = null;
    this.computeTarget();
    this.weapon.body.setTranslation(this.target, true);
    this.weapon.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.weapon.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.engine.physics.resetInterpolation(this.weapon.body);
  }

  scriptedStrike(target: THREE.Vector3, _style: StrikeStyle, duration = 0.35): void {
    this.script = {
      t: 0,
      dur: duration,
      from: target.clone().add(new THREE.Vector3(-0.6, 0.5, 0.4)),
      to: target.clone().add(new THREE.Vector3(0.6, -0.3, -0.2)),
    };
  }

  private computeTarget(): void {
    const s = this.opts.spawn;
    this.target.set(s.x + this.aim.x * 0.6, 1.3 + this.aim.y * 0.5, s.z - 0.7);
  }

  update(dt: number): void {
    const input = this.engine.input;
    this.aim.x = THREE.MathUtils.clamp(this.aim.x + input.mouseDX * 0.004, -1, 1);
    this.aim.y = THREE.MathUtils.clamp(this.aim.y - input.mouseDY * 0.004, -1, 1);
    if (this.script) {
      this.script.t += dt;
      const k = Math.min(1, this.script.t / this.script.dur);
      this.target.lerpVectors(this.script.from, this.script.to, k * k);
      if (k >= 1) this.script = null;
    } else {
      this.computeTarget();
    }
    if (this.engine.cameraControlEnabled) {
      const cam = this.engine.camera;
      cam.position.set(this.opts.spawn.x + 0.35, 1.75, this.opts.spawn.z + 0.9);
      cam.lookAt(this.opts.lookAt.x, 1.35, this.opts.lookAt.z);
    }
  }

  fixedUpdate(dt: number): void {
    const b = this.weapon.body;
    const p = b.translation();
    const v = b.linvel();
    const m = b.mass();
    const kp = 900, kd = 60;
    const f = new THREE.Vector3(
      kp * (this.target.x - p.x) - kd * v.x,
      kp * (this.target.y - p.y) - kd * v.y,
      kp * (this.target.z - p.z) - kd * v.z,
    ).multiplyScalar(m * dt);
    b.applyImpulse(f, true);
  }
}
