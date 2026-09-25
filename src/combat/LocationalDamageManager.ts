import * as THREE from 'three';
import type { Engine, GameSystem } from '../core/Engine';
import type { IRagdollTarget } from '../core/contracts';
import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * STUB — replaced by the combat module (impact physics, armor, part states, gore hooks).
 * Logs weapon/body-part collision starts.
 */
export class LocationalDamageManager implements GameSystem {
  constructor(private readonly engine: Engine, private readonly targets: IRagdollTarget[]) {
    engine.physics.onCollision((c1, c2, started) => {
      if (started) this.handle(c1, c2);
    });
  }

  postPhysics(_dt: number): void {}

  private handle(c1: RAPIER.Collider, c2: RAPIER.Collider): void {
    const t1 = this.engine.physics.getTag(c1);
    const t2 = this.engine.physics.getTag(c2);
    const w = t1?.kind === 'weapon' ? t1 : t2?.kind === 'weapon' ? t2 : null;
    const b = t1?.kind === 'bodyPart' ? t1 : t2?.kind === 'bodyPart' ? t2 : null;
    if (!w || !b || !this.targets.includes(b.target)) return;
    const p = c1.translation();
    const speed = w.weapon.velocityAtPoint(new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3()).length();
    this.engine.events.emit('log', { text: `${w.zone} hit ${b.part} @ ${speed.toFixed(1)} m/s`, level: 'hit' });
  }
}
