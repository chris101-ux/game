import * as THREE from 'three';
import { EventBus } from './EventBus';
import { Input } from './Input';
import type { GameEvents } from './contracts';
import { PhysicsWorld } from '../physics/PhysicsWorld';

/**
 * Anything that participates in the frame loop.
 * Order of a frame:
 *   for each fixed step: fixedUpdate -> physics.step -> postPhysics
 *   physics.syncVisuals(alpha) -> update -> lateUpdate -> render
 */
export interface GameSystem {
  /** Before each physics step (apply forces, drive motors). dt is fixed. */
  fixedUpdate?(dt: number): void;
  /** After each physics step; collision events for that step are already dispatched. */
  postPhysics?(dt: number): void;
  /** Once per rendered frame, after physics bodies were synced to meshes. dt is scaled game time. */
  update?(dt: number): void;
  /** After all updates (camera follow, UI). */
  lateUpdate?(dt: number): void;
}

/** The render module installs one of these; the engine calls it once per frame. */
export interface RenderPipeline {
  render(dt: number): void;
  setSize(width: number, height: number, pixelRatio: number): void;
}

interface SystemEntry {
  system: GameSystem;
  order: number;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly events = new EventBus<GameEvents>();
  readonly input: Input;
  private lastTime = 0;

  pipeline: RenderPipeline | null = null;

  /** Physics step. 120 Hz keeps sword/limb contacts precise. */
  readonly fixedDt = 1 / 120;
  private maxSubSteps = 10;
  private accumulator = 0;
  private systems: SystemEntry[] = [];
  private running = false;
  private rafId = 0;

  /** Global game-time multiplier (slow motion). */
  timeScale = 1;
  /** Remaining real seconds of hit-stop (game time frozen). */
  private hitStopRemaining = 0;
  /** When false, player camera controllers must not move the camera (harness/cinematics). */
  cameraControlEnabled = true;
  /** Manual mode: the rAF loop is paused and the harness calls advance(). */
  manual = false;

  /** Frame stats for the HUD. */
  readonly stats = { fps: 0, frameMs: 0, physicsMs: 0, renderMs: 0, frames: 0 };
  private fpsAccum = 0;
  private fpsFrames = 0;

  /** Seconds of scaled game time since start. */
  gameTime = 0;
  /** Max device pixel ratio used for the drawing buffer. */
  maxPixelRatio = 1.5;

  private constructor(
    readonly canvas: HTMLCanvasElement,
    readonly physics: PhysicsWorld,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // AA is done in post (SMAA / TAA)
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: new URLSearchParams(location.search).has('harness'),
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in post
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 250);
    this.camera.position.set(0, 1.7, 4);
    this.scene.add(this.camera);

    this.input = new Input(canvas);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement): Promise<Engine> {
    const physics = await PhysicsWorld.create();
    return new Engine(canvas, physics);
  }

  addSystem(system: GameSystem, order = 0): () => void {
    const entry = { system, order };
    this.systems.push(entry);
    this.systems.sort((a, b) => a.order - b.order);
    return () => {
      const i = this.systems.indexOf(entry);
      if (i >= 0) this.systems.splice(i, 1);
    };
  }

  setPipeline(pipeline: RenderPipeline): void {
    this.pipeline = pipeline;
    this.resize();
  }

  /** Freeze game time for `seconds` of real time (impact feel). */
  hitStop(seconds: number): void {
    this.hitStopRemaining = Math.max(this.hitStopRemaining, seconds);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline?.setSize(w, h, pr);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      this.rafId = requestAnimationFrame(loop);
      const realDt = Math.min(Math.max(0, now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      if (this.manual) return;
      this.frame(realDt);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Deterministically advance the simulation (used by the test harness).
   * Simulates `seconds` of game time in `frameDt` frames; renders only the
   * last `renderLast` frames (rendering is expensive under software GL).
   */
  advance(seconds: number, frameDt = 1 / 60, renderLast = 1): void {
    const frames = Math.max(1, Math.round(seconds / frameDt));
    for (let i = 0; i < frames; i++) {
      this.frame(frameDt, i >= frames - renderLast);
    }
  }

  /** One rendered frame given real elapsed seconds. */
  frame(realDt: number, render = true): void {
    const t0 = performance.now();

    let dt = realDt * this.timeScale;
    if (this.hitStopRemaining > 0) {
      const frozen = Math.min(this.hitStopRemaining, realDt);
      this.hitStopRemaining -= frozen;
      dt = Math.max(0, realDt - frozen) * this.timeScale;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
      for (const { system } of this.systems) system.fixedUpdate?.(this.fixedDt);
      this.physics.step(this.fixedDt);
      for (const { system } of this.systems) system.postPhysics?.(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0; // spiral-of-death guard
    const t1 = performance.now();

    this.physics.syncVisuals(this.accumulator / this.fixedDt);
    this.gameTime += dt;
    for (const { system } of this.systems) system.update?.(dt);
    for (const { system } of this.systems) system.lateUpdate?.(dt);

    const t2 = performance.now();
    if (render) {
      this.renderer.info.reset();
      if (this.pipeline) this.pipeline.render(dt);
      else this.renderer.render(this.scene, this.camera);
    }
    const t3 = performance.now();

    this.input.endFrame();

    this.stats.physicsMs = t1 - t0;
    this.stats.renderMs = t3 - t2;
    this.stats.frameMs = t3 - t0;
    this.stats.frames++;
    this.fpsAccum += realDt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.stats.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }
}
