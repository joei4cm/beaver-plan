"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Stop } from "@beaver/core";

/** Tip 005 — card ripple base offset */
const RIPPLE_A = 8;
const RIPPLE_DECAY = 0.7;
const RIPPLE_DELAY_MS = 24;
const DRAG_THRESHOLD_PX = 4;
const LIFT_SCALE = 0.9;
const LIFT_X = 14;
const SPRING_MS = 250;

export type StopReorderRenderCtx = {
  index: number;
  isDragging: boolean;
  isOrigin: boolean;
  dragHandleProps: {
    onPointerDown: (e: ReactPointerEvent) => void;
    className: string;
    "aria-label": string;
    title: string;
  };
};

type Props = {
  items: Stop[];
  onReorder: (orderedIds: string[]) => void;
  label: string;
  dragHandleLabel: string;
  renderItem: (item: Stop, ctx: StopReorderRenderCtx) => React.ReactElement;
  empty?: React.ReactElement;
};

type DragLive = {
  id: string;
  from: number;
  /** Final index after remove+reinsert (0..n-1). */
  to: number;
  pointerX: number;
  pointerY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  width: number;
  height: number;
  listTop: number;
  origins: number[];
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function applyReorder(ids: string[], from: number, to: number): string[] {
  if (from === to) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (!moved) return ids;
  next.splice(to, 0, moved);
  return next;
}

/**
 * Tip 005 drag-ripple reorder for the planner stop list.
 * Transform-only motion; keyboard reorder stays on the parent ↑↓ controls.
 */
export function StopReorderList({
  items,
  onReorder,
  label,
  dragHandleLabel,
  renderItem,
  empty,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [drag, setDrag] = useState<DragLive | null>(null);
  const dragRef = useRef<DragLive | null>(null);
  const onReorderRef = useRef(onReorder);
  const itemsRef = useRef(items);
  const pendingRef = useRef<{
    id: string;
    from: number;
    startX: number;
    startY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    width: number;
    height: number;
    listTop: number;
    origins: number[];
  } | null>(null);
  const reducedRef = useRef(false);

  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
  }, []);

  const setDragBoth = useCallback((next: DragLive | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const measureOrigins = useCallback(() => {
    const list = listRef.current;
    if (!list) return { listTop: 0, origins: [] as number[] };
    const listRect = list.getBoundingClientRect();
    const listTop = listRect.top;
    const scrollTop = list.scrollTop;
    const origins = items.map((item) => {
      const el = rowRefs.current.get(item.id);
      if (!el) return 0;
      return el.getBoundingClientRect().top - listTop + scrollTop;
    });
    return { listTop, origins };
  }, [items]);

  const toFromPointer = useCallback((live: DragLive, clientY: number): number => {
    const { from, origins, height, listTop } = live;
    const scrollTop = listRef.current?.scrollTop ?? 0;
    const y = clientY - listTop + scrollTop;

    let slot = 0;
    let count = 0;
    for (let i = 0; i < origins.length; i++) {
      if (i === from) continue;
      let top = origins[i]!;
      if (i > from) top -= height;
      if (y > top + height / 2) slot = count + 1;
      count += 1;
    }
    return Math.max(0, Math.min(slot, Math.max(0, origins.length - 1)));
  }, []);

  const onPointerDownHandle = useCallback(
    (id: string, e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const from = items.findIndex((s) => s.id === id);
      const row = rowRefs.current.get(id);
      if (from < 0 || !row) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = row.getBoundingClientRect();
      const { listTop, origins } = measureOrigins();
      pendingRef.current = {
        id,
        from,
        startX: e.clientX,
        startY: e.clientY,
        grabOffsetX: e.clientX - rect.left,
        grabOffsetY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        listTop,
        origins,
      };
    },
    [items, measureOrigins],
  );

  useEffect(() => {
    function clearChrome() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function onMove(e: PointerEvent) {
      const pending = pendingRef.current;
      const live = dragRef.current;

      if (pending && !live) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        const next: DragLive = {
          id: pending.id,
          from: pending.from,
          to: pending.from,
          pointerX: e.clientX,
          pointerY: e.clientY,
          grabOffsetX: pending.grabOffsetX,
          grabOffsetY: pending.grabOffsetY,
          width: pending.width,
          height: pending.height,
          listTop: pending.listTop,
          origins: pending.origins,
        };
        next.to = toFromPointer(next, e.clientY);
        pendingRef.current = null;
        setDragBoth(next);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        return;
      }

      if (!live) return;
      setDragBoth({
        ...live,
        pointerX: e.clientX,
        pointerY: e.clientY,
        to: toFromPointer(live, e.clientY),
      });
    }

    function finish(commit: boolean) {
      const live = dragRef.current;
      pendingRef.current = null;
      clearChrome();
      if (!live) {
        setDragBoth(null);
        return;
      }
      const ids = itemsRef.current.map((s) => s.id);
      const ordered = applyReorder(ids, live.from, live.to);
      setDragBoth(null);
      if (!commit) return;
      if (ordered.every((id, i) => id === ids[i])) return;
      onReorderRef.current(ordered);
    }

    function onUp() {
      finish(true);
    }

    function onCancel() {
      finish(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && (dragRef.current || pendingRef.current)) {
        e.preventDefault();
        finish(false);
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      clearChrome();
    };
  }, [setDragBoth, toFromPointer]);

  function rowMotion(index: number): CSSProperties {
    const reduced = reducedRef.current;
    if (!drag) {
      return {
        transform: "none",
        transition: reduced
          ? "none"
          : `transform ${SPRING_MS}ms var(--bp-ease-overshoot)`,
      };
    }

    const { from, to, height } = drag;
    if (index === from) {
      return {
        transform: "none",
        opacity: 0,
        transition: "none",
        pointerEvents: "none",
      };
    }

    let shift = 0;
    if (from < to) {
      if (index > from && index <= to) shift = -height;
    } else if (from > to) {
      if (index >= to && index < from) shift = height;
    }

    let n = 0;
    if (!reduced) {
      const visualIndex = index > from ? index - 1 : index;
      const above = visualIndex < to;
      n = above ? to - 1 - visualIndex : visualIndex - to;
      if (n >= 0) {
        const mag = RIPPLE_A * Math.pow(RIPPLE_DECAY, n);
        shift += above ? -mag : mag;
      }
    }

    const delay = reduced ? 0 : Math.max(0, n) * RIPPLE_DELAY_MS;
    return {
      transform: `translate3d(0, ${shift}px, 0)`,
      transition: reduced
        ? "none"
        : `transform ${SPRING_MS}ms var(--bp-ease-overshoot) ${delay}ms`,
    };
  }

  function dropLineStyle(): CSSProperties | null {
    if (!drag) return null;
    const { from, to, origins, height } = drag;
    if (to === from) return null;

    const closedTops: number[] = [];
    for (let i = 0; i < origins.length; i++) {
      if (i === from) continue;
      let top = origins[i]!;
      if (i > from) top -= height;
      closedTops.push(top);
    }

    let top: number;
    if (to <= 0) top = closedTops[0] ?? 0;
    else if (to >= closedTops.length) {
      const last = closedTops[closedTops.length - 1] ?? 0;
      top = last + height;
    } else {
      top = closedTops[to]!;
    }

    return { top };
  }

  const line = dropLineStyle();
  const floating = drag
    ? (items.find((s) => s.id === drag.id) ?? null)
    : null;
  const floatingIndex = drag?.from ?? -1;
  const reduced = reducedRef.current;

  return (
    <div className="relative min-h-0 flex-1">
      <ol
        ref={listRef}
        aria-label={label}
        className="bp-stop-reorder relative h-full overflow-y-auto"
        data-dragging={drag ? "true" : undefined}
      >
        {items.length === 0 ? empty : null}

        {items.map((item, index) => {
          const isOrigin = drag?.id === item.id;
          return (
            <li
              key={item.id}
              ref={(el) => {
                if (el) rowRefs.current.set(item.id, el);
                else rowRefs.current.delete(item.id);
              }}
              className="bp-stop-row relative border-b border-[color:var(--bp-line)]"
              style={rowMotion(index)}
              data-origin={isOrigin ? "true" : undefined}
            >
              {renderItem(item, {
                index,
                isDragging: Boolean(drag),
                isOrigin: Boolean(isOrigin),
                dragHandleProps: {
                  onPointerDown: (e) => onPointerDownHandle(item.id, e),
                  className: "bp-stop-drag-handle touch-none select-none",
                  "aria-label": dragHandleLabel,
                  title: dragHandleLabel,
                },
              })}
            </li>
          );
        })}

        {line ? (
          <div
            className="bp-stop-drop-line pointer-events-none absolute left-3 right-3 z-20"
            style={line}
            aria-hidden
          />
        ) : null}
      </ol>

      {drag && floating ? (
        <div
          className="bp-stop-lift pointer-events-none fixed z-50 will-change-transform"
          style={{
            left: drag.pointerX - drag.grabOffsetX + (reduced ? 0 : LIFT_X),
            top: drag.pointerY - drag.grabOffsetY,
            width: drag.width,
            transform: reduced ? undefined : `scale(${LIFT_SCALE})`,
            transformOrigin: "left center",
          }}
        >
          <div className="overflow-hidden rounded-bp border border-river/30 bg-foam shadow-bp ring-1 ring-river/15">
            {renderItem(floating, {
              index: floatingIndex,
              isDragging: true,
              isOrigin: false,
              dragHandleProps: {
                onPointerDown: () => undefined,
                className:
                  "bp-stop-drag-handle bp-stop-drag-handle--active touch-none",
                "aria-label": dragHandleLabel,
                title: dragHandleLabel,
              },
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
