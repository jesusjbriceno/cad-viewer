/** What a primary-button drag does with the current tool. */
export type DragMode = "pan" | "rectangle";

export interface PointerHandlers {
  dragMode(): DragMode;
  pan(dx: number, dy: number): void;
  zoomAt(x: number, y: number, factor: number): void;
  /** Primary click without movement. */
  tap(x: number, y: number): void;
  hover(x: number, y: number): void;
  leave(): void;
  rectangle(from: { x: number; y: number }, to: { x: number; y: number }, done: boolean): void;
  doubleTap(): void;
  key(key: string): boolean;
}

/** Movement (CSS px) below which a press counts as a click. */
const CLICK_SLOP = 4;
const WHEEL_STEP = 1.0015;

/**
 * Translates pointer, wheel and keyboard input on the canvas into viewer
 * intents. Returns a function that removes every listener.
 */
export function attachPointerInput(
  canvas: HTMLCanvasElement,
  handlers: PointerHandlers,
): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let press: { x: number; y: number; mode: DragMode | "middle"; moved: boolean } | null = null;
  let pinch: { distance: number; x: number; y: number } | null = null;

  const local = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    // Some environments create wheel events without coordinates: fall back to the center.
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY))
      return { x: rect.width / 2, y: rect.height / 2 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return null;
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const onDown = (event: PointerEvent) => {
    const p = local(event);
    pointers.set(event.pointerId, p);
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic or already released pointers cannot be captured.
    }
    if (pointers.size === 2) {
      press = null;
      pinch = pinchState();
      return;
    }
    if (event.button === 1) press = { ...p, mode: "middle", moved: false };
    else if (event.button === 0) press = { ...p, mode: handlers.dragMode(), moved: false };
  };

  const onMove = (event: PointerEvent) => {
    const p = local(event);
    const previous = pointers.get(event.pointerId);
    if (previous) pointers.set(event.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const next = pinchState();
      if (next && pinch.distance > 0) {
        handlers.pan(next.x - pinch.x, next.y - pinch.y);
        handlers.zoomAt(next.x, next.y, next.distance / pinch.distance);
        pinch = next;
      }
      return;
    }
    if (!press || !previous) {
      handlers.hover(p.x, p.y);
      return;
    }
    if (!press.moved && Math.hypot(p.x - press.x, p.y - press.y) >= CLICK_SLOP) press.moved = true;
    if (!press.moved) return;
    if (press.mode === "rectangle") handlers.rectangle(press, p, false);
    else handlers.pan(p.x - previous.x, p.y - previous.y);
  };

  const onUp = (event: PointerEvent) => {
    const p = local(event);
    pointers.delete(event.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    const current = press;
    press = null;
    if (!current || current.mode === "middle") return;
    if (!current.moved) handlers.tap(p.x, p.y);
    else if (current.mode === "rectangle") handlers.rectangle(current, p, true);
  };

  const onCancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    press = null;
    pinch = null;
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const p = local(event);
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    handlers.zoomAt(p.x, p.y, WHEEL_STEP ** -delta);
  };

  const onDoubleClick = () => handlers.doubleTap();
  const onLeave = () => handlers.leave();
  const onKey = (event: KeyboardEvent) => {
    if (handlers.key(event.key)) event.preventDefault();
  };

  const listeners: [string, EventListener, AddEventListenerOptions?][] = [
    ["pointerdown", onDown as EventListener],
    ["pointermove", onMove as EventListener],
    ["pointerup", onUp as EventListener],
    ["pointercancel", onCancel as EventListener],
    ["pointerleave", onLeave],
    ["wheel", onWheel as EventListener, { passive: false }],
    ["dblclick", onDoubleClick],
    ["keydown", onKey as EventListener],
  ];
  for (const [type, listener, options] of listeners)
    canvas.addEventListener(type, listener, options);
  return () => {
    for (const [type, listener] of listeners) canvas.removeEventListener(type, listener);
  };
}
