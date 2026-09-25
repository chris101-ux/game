/**
 * Raw input state. Gameplay code reads it; nothing here knows about swords.
 *
 * Mouse deltas accumulate between frames and are cleared by `endFrame()`,
 * which the Engine calls after every rendered frame.
 */
export class Input {
  readonly keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();

  /** Accumulated pointer movement (px) since last frame. */
  mouseDX = 0;
  mouseDY = 0;
  /** Accumulated wheel delta since last frame. */
  wheel = 0;
  /** Absolute pointer position in CSS px (useful when pointer is not locked). */
  mouseX = 0;
  mouseY = 0;
  readonly buttons = new Set<number>();
  private buttonsPressed = new Set<number>();
  private buttonsReleased = new Set<number>();

  pointerLocked = false;
  /** Disabled while the test harness drives the game. */
  enabled = true;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
    });
  }

  requestPointerLock(): void {
    if (!this.pointerLocked) {
      const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => { /* user gesture required; ignore */ });
    }
  }

  isDown(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.enabled && this.pressedThisFrame.has(code);
  }

  wasReleased(code: string): boolean {
    return this.enabled && this.releasedThisFrame.has(code);
  }

  isButtonDown(button: number): boolean {
    return this.enabled && this.buttons.has(button);
  }

  wasButtonPressed(button: number): boolean {
    return this.enabled && this.buttonsPressed.has(button);
  }

  wasButtonReleased(button: number): boolean {
    return this.enabled && this.buttonsReleased.has(button);
  }

  endFrame(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.buttonsPressed.clear();
    this.buttonsReleased.clear();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.releasedThisFrame.add(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.buttons.clear();
  };

  private onMouseDown = (e: MouseEvent) => {
    this.buttons.add(e.button);
    this.buttonsPressed.add(e.button);
  };

  private onMouseUp = (e: MouseEvent) => {
    this.buttons.delete(e.button);
    this.buttonsReleased.add(e.button);
  };

  private onMouseMove = (e: MouseEvent) => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    if (!this.enabled) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.enabled) this.wheel += e.deltaY;
  };
}
