import type { GameHarness } from './TestHarness';

/**
 * Named, deterministic camera + action setups used by `npm run shoot`.
 * Each scenario starts from a fresh reset and leaves the final frame rendered.
 *
 * World layout: dummy stands at the origin facing +Z; the player stands at
 * z ≈ +2.6 facing -Z.
 */
export function registerDefaultScenarios(h: GameHarness): void {
  // The default in-game view (player camera rig).
  h.registerScenario('gameplay', (h) => {
    h.reset();
    h.advance(1.5, 3);
  });

  // Wide establishing shot of the arena.
  h.registerScenario('overview', (h) => {
    h.reset();
    h.advance(1.0, 1);
    h.setCamera([5.5, 3.2, 6.5], [0, 1.1, 0], 50);
    h.advance(0.1, 3);
  });

  // Hero shot of the dummy for material / modelling quality.
  h.registerScenario('dummy-closeup', (h) => {
    h.reset();
    h.advance(1.0, 1);
    h.setCamera([0.9, 1.55, 1.7], [0, 1.25, 0], 40);
    h.advance(0.1, 3);
  });

  // Hero shot of the player's weapon.
  h.registerScenario('weapon-closeup', (h) => {
    h.reset();
    h.advance(1.0, 1);
    const w = h.refs.player.weapon.object.getWorldPosition(h.engine.camera.position.clone());
    h.setCamera([w.x + 0.8, w.y + 0.25, w.z + 0.6], [w.x, w.y + 0.3, w.z], 35);
    h.advance(0.05, 3);
  });

  // Head strike: capture just after impact (blood burst in flight).
  h.registerScenario('strike-head', (h) => {
    h.reset();
    h.advance(0.5, 0);
    h.strike('head', 'scheitelhau', 0.35);
    h.advance(0.45, 3);
  });

  // Aftermath of a head strike: pools, decals, collapsed body.
  h.registerScenario('aftermath', (h) => {
    h.reset();
    h.advance(0.5, 0);
    h.strike('head', 'scheitelhau', 0.35);
    h.advance(3.0, 0);
    h.setCamera([1.8, 1.6, 2.2], [0, 0.3, 0], 45);
    h.advance(0.1, 3);
  });

  h.registerScenario('strike-leg', (h) => {
    h.reset();
    h.advance(0.5, 0);
    h.strike('thighL', 'mittelhau', 0.35);
    h.advance(0.5, 3);
  });

  h.registerScenario('strike-arm', (h) => {
    h.reset();
    h.advance(0.5, 0);
    h.strike('forearmR', 'oberhau', 0.35);
    h.advance(0.5, 3);
  });
}
