import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { BodyPartId, IPlayerController, IRagdollTarget, StrikeStyle } from '../core/contracts';
import { registerDefaultScenarios } from './scenarios';

/**
 * Automation surface for headless screenshots and debugging (window.__game).
 *
 * With `?harness` in the URL the engine starts in manual mode: nothing moves
 * until the harness calls `advance()`, which makes screenshots deterministic
 * and independent of how slow software rendering is.
 */
export interface HarnessRefs {
  engine: Engine;
  dummy: IRagdollTarget;
  player: IPlayerController;
  [key: string]: unknown;
}

export type Scenario = (h: GameHarness) => Promise<void> | void;

export class GameHarness {
  readonly logs: string[] = [];
  readonly errors: string[] = [];
  readonly scenarios = new Map<string, Scenario>();
  ready = false;

  constructor(readonly refs: HarnessRefs) {
    refs.engine.events.on('log', ({ text, level }) => this.logs.push(`[${level}] ${text}`));
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => this.errors.push(String(e.reason)));
  }

  get engine(): Engine {
    return this.refs.engine;
  }

  setManual(on: boolean): void {
    this.engine.manual = on;
    this.engine.input.enabled = !on;
  }

  /** Simulate `seconds` of game time; render the final `renderLast` frames. */
  advance(seconds: number, renderLast = 1): void {
    this.engine.advance(seconds, 1 / 60, renderLast);
  }

  /** Take manual control of the camera (disables the player's camera rig). */
  setCamera(pos: [number, number, number], target: [number, number, number], fov?: number): void {
    const cam = this.engine.camera;
    this.engine.cameraControlEnabled = false;
    cam.position.set(...pos);
    cam.lookAt(...target);
    if (fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  releaseCamera(): void {
    this.engine.cameraControlEnabled = true;
    this.engine.camera.fov = 50;
    this.engine.camera.updateProjectionMatrix();
  }

  /** World-space centre of a body part. */
  partPosition(part: BodyPartId): THREE.Vector3 {
    const body = this.refs.dummy.getPartBody(part);
    if (!body) return new THREE.Vector3();
    const t = body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  strike(part: BodyPartId, style: StrikeStyle = 'oberhau', duration?: number): void {
    this.refs.player.scriptedStrike(this.partPosition(part), style, duration);
  }

  reset(): void {
    this.refs.dummy.reset();
    this.refs.player.reset();
    this.releaseCamera();
    this.logs.length = 0;
  }

  registerScenario(name: string, fn: Scenario): void {
    this.scenarios.set(name, fn);
  }

  async runScenario(name: string): Promise<void> {
    const fn = this.scenarios.get(name);
    if (!fn) throw new Error(`Unknown scenario "${name}". Known: ${[...this.scenarios.keys()].join(', ')}`);
    await fn(this);
  }
}

export function installTestHarness(refs: HarnessRefs): GameHarness {
  const h = new GameHarness(refs);
  registerDefaultScenarios(h);
  (window as unknown as { __game: GameHarness }).__game = h;
  if (new URLSearchParams(location.search).has('harness')) h.setManual(true);
  h.ready = true;
  return h;
}
