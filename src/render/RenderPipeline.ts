import * as THREE from 'three';
import type { Engine, RenderPipeline } from '../core/Engine';

/**
 * STUB — replaced by the render module (post-processing stack).
 * Plain forward render with filmic tone mapping.
 */
export class GameRenderPipeline implements RenderPipeline {
  constructor(private readonly engine: Engine) {
    engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    engine.renderer.toneMappingExposure = 1.0;
  }

  async init(): Promise<void> {}

  setSize(_w: number, _h: number, _pr: number): void {}

  render(_dt: number): void {
    this.engine.renderer.render(this.engine.scene, this.engine.camera);
  }
}
