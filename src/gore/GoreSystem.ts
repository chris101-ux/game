import type { Engine, GameSystem } from '../core/Engine';

/**
 * STUB — replaced by the gore module (blood particles, decals, stumps).
 */
export class GoreSystem implements GameSystem {
  constructor(private readonly engine: Engine) {}

  update(_dt: number): void {}

  async init(): Promise<void> {
    void this.engine;
  }
}
