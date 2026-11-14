// A stand-in for page-flip: records what the reader asks for and lets tests emit its events.
type Handler = (event: { data: unknown }) => void;

export const instances: FakePageFlip[] = [];

export class FakePageFlip {
  readonly block: HTMLElement;
  readonly settings: Record<string, unknown>;
  readonly handlers = new Map<string, Handler[]>();
  readonly nextCalls: unknown[] = [];
  readonly prevCalls: unknown[] = [];
  readonly turnCalls: number[] = [];
  /** Value of `disableFlipByClick` seen by each flipNext/flipPrev call. */
  readonly clickRuleDuringFlip: unknown[] = [];
  readonly renderer: { getDirection: () => number; render: (timer: number) => void } = {
    getDirection: () => 0,
    render: () => undefined,
  };
  readonly ui: { touchPoint: unknown } = { touchPoint: { x: 1, y: 1 } };
  destroyed = false;
  updates = 0;

  constructor(block: HTMLElement, settings: Record<string, unknown>) {
    this.block = block;
    this.settings = { ...settings };
    instances.push(this);
  }
  loadFromHTML(items: HTMLElement[]): void {
    for (const item of items) this.block.appendChild(item);
  }
  on(name: string, handler: Handler): this {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
    return this;
  }
  emit(name: string, data: unknown): void {
    for (const handler of this.handlers.get(name) ?? []) handler({ data });
  }
  flipNext(corner?: unknown): void {
    this.clickRuleDuringFlip.push(this.settings.disableFlipByClick);
    this.nextCalls.push(corner);
  }
  flipPrev(corner?: unknown): void {
    this.clickRuleDuringFlip.push(this.settings.disableFlipByClick);
    this.prevCalls.push(corner);
  }
  turnToPage(index: number): void {
    this.turnCalls.push(index);
    this.emit("flip", index);
  }
  update(): void {
    this.updates++;
  }
  destroy(): void {
    this.destroyed = true;
    this.block.remove();
  }
  getSettings(): Record<string, unknown> {
    return this.settings;
  }
  getRender(): FakePageFlip["renderer"] {
    return this.renderer;
  }
  getUI(): object {
    return this.ui;
  }
  userStop(): void {}
}
