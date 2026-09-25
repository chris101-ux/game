import type { Engine, GameSystem } from '../core/Engine';

/**
 * STUB — replaced by the ui module.
 * Minimal combat log overlay.
 */
export class HUD implements GameSystem {
  private readonly el: HTMLDivElement;

  constructor(engine: Engine, container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud-log';
    container.appendChild(this.el);
    engine.events.on('log', ({ text, level }) => {
      const line = document.createElement('div');
      line.className = `hud-line hud-${level}`;
      line.textContent = text;
      this.el.prepend(line);
      while (this.el.childElementCount > 8) this.el.lastElementChild?.remove();
      console.log(`[${level}] ${text}`);
    });
  }

  lateUpdate(_dt: number): void {}

  /** Called once all systems are ready; hides any loading screen. */
  setLoaded(): void {
    document.getElementById('loading')?.remove();
  }
}
