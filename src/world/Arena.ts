import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import { RAPIER } from '../physics/PhysicsWorld';
import { Groups } from '../physics/CollisionGroups';

/**
 * STUB — replaced by the world module (full arena, PBR materials, lighting).
 * Provides a floor collider, basic lights, and spawn points.
 */
export class Arena {
  /** Where the dummy stands (feet on the floor), and where it faces. */
  readonly dummySpawn = new THREE.Vector3(0, 0, 0);
  readonly dummyFacing = new THREE.Vector3(0, 0, 1);
  /** Player (camera/weapon owner) spawn position (feet), facing the dummy. */
  readonly playerSpawn = new THREE.Vector3(0, 0, 2.6);

  constructor(private readonly engine: Engine) {}

  async build(): Promise<void> {
    const { scene, physics } = this.engine;
    scene.background = new THREE.Color(0x0b0c10);
    scene.fog = new THREE.FogExp2(0x0b0c10, 0.03);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const col = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, -0.5, 0).setFriction(0.9)
        .setCollisionGroups(Groups.static),
      body,
    );
    physics.tag(col, { kind: 'static', surface: 'stone' });

    scene.add(new THREE.HemisphereLight(0x8090a0, 0x201810, 0.6));
    const key = new THREE.DirectionalLight(0xffe0c0, 2.5);
    key.position.set(4, 8, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    scene.add(key);
  }
}
