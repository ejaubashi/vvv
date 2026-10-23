import type { Workspace } from "./state";

const sections: Workspace[] = ["media", "material", "interaction", "details"];
const ease = "cubic-bezier(.16,1,.3,1)";
const pressTargets =
  ".dock button,[data-panel],#browse-collection,#enter-room,.room-nav>button,.room-preset,.preset,#return-to-lens,#visit-studio,.icon-button";

/** Finite DOM motion, independent of the optical renderer's animation clock. */
export class ExhibitionMotion {
  private events = new AbortController();
  private animations = new Map<string, Set<Animation>>();
  private presses = new WeakMap<Element, Animation>();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  private pointerFrame = 0;
  private pointer = { x: 0, y: 0 };
  private panelVersion = 0;
  private currentSection: Workspace | null = null;
  private direction = 1;
  private currentRoom = "";
  private disposed = false;
  private canAnimate = typeof Element.prototype.animate === "function";
  private hero = document.querySelector<HTMLElement>(".exhibition-copy")!;
  private heading = document.querySelector<HTMLElement>("#exhibition-title")!;
  private dialog = document.querySelector<HTMLDialogElement>("#workspace")!;
  private content = document.querySelector<HTMLElement>(".workspace-content")!;
  private dock = document.querySelector<HTMLElement>(".dock")!;

  constructor() {
    const signal = this.events.signal;
    this.maskWords(this.heading);
    this.revealHero(true);
    this.hero.addEventListener(
      "pointermove",
      (event) => {
        if (
          this.reduced ||
          !this.finePointer.matches ||
          event.pointerType !== "mouse"
        )
          return;
        const rect = this.hero.getBoundingClientRect();
        this.pointer.x = Math.max(
          -1,
          Math.min(1, ((event.clientX - rect.x) / rect.width) * 2 - 1),
        );
        this.pointer.y = Math.max(
          -1,
          Math.min(1, ((event.clientY - rect.y) / rect.height) * 2 - 1),
        );
        if (!this.pointerFrame)
          this.pointerFrame = requestAnimationFrame(() => {
            this.pointerFrame = 0;
            this.hero.style.setProperty("--title-x", `${this.pointer.x * 4}px`);
            this.hero.style.setProperty("--title-y", `${this.pointer.y * 3}px`);
            this.hero.style.setProperty(
              "--title-light",
              `${50 + this.pointer.x * 26}%`,
            );
          });
      },
      { signal, passive: true },
    );
    this.hero.addEventListener("pointerleave", () => this.resetPointer(), {
      signal,
    });
    window.addEventListener("blur", () => this.resetPointer(), { signal });
    window.addEventListener("resize", () => this.resetPointer(), {
      signal,
      passive: true,
    });
    this.dock.addEventListener(
      "pointerover",
      (event) => {
        if (
          this.finePointer.matches &&
          (event as PointerEvent).pointerType === "mouse"
        )
          this.aimDock(event.target);
      },
      { signal },
    );
    this.dock.addEventListener(
      "pointerleave",
      () => this.aimDock(document.activeElement),
      { signal },
    );
    this.dock.addEventListener(
      "focusin",
      (event) => this.aimDock(event.target),
      { signal },
    );
    this.dock.addEventListener(
      "focusout",
      (event) => this.aimDock(event.relatedTarget),
      { signal },
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.isPrimary && event.button === 0) this.press(event.target);
      },
      { signal, passive: true },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (!event.repeat && (event.key === "Enter" || event.key === " "))
          this.press(event.target);
      },
      { signal },
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.settle();
      },
      { signal },
    );
  }

  private play(
    element: Element,
    frames: Keyframe[],
    duration: number,
    delay = 0,
    group = "panel",
  ) {
    if (this.reduced || this.disposed || document.hidden || !this.canAnimate)
      return;
    const animation = element.animate(frames, {
      duration,
      delay,
      easing: ease,
      fill: "both",
    });
    const owned = this.animations.get(group) ?? new Set<Animation>();
    owned.add(animation);
    this.animations.set(group, owned);
    // Cancel after completion to release fill effects and return to the CSS base.
    void animation.finished.then(
      () => {
        owned.delete(animation);
        animation.cancel();
      },
      () => {
        owned.delete(animation);
      },
    );
    return animation;
  }

  private cancel(group: string) {
    for (const animation of this.animations.get(group) ?? [])
      animation.cancel();
    this.animations.delete(group);
  }

  private maskWords(element: HTMLElement) {
    // Keep real text and word spacing: no duplicate labels or per-letter kerning changes.
    for (const node of [...element.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const fragment = document.createDocumentFragment();
      for (const part of (node.textContent ?? "").split(/(\s+)/)) {
        if (!part.trim()) fragment.append(document.createTextNode(part));
        else {
          const mask = document.createElement("span");
          mask.className = "type-mask";
          const ink = document.createElement("span");
          ink.className = "type-ink";
          ink.textContent = part;
          mask.append(ink);
          fragment.append(mask);
        }
      }
      node.replaceWith(fragment);
    }
    // The exhibition title already has one semantic element per word.
    if (element === this.heading)
      for (const word of [...element.children] as HTMLElement[]) {
        if (!word.classList.contains("type-mask")) this.maskWords(word);
      }
  }

  revealHero(initial = false) {
    this.cancel("hero");
    this.heading.dataset.motion = "settled";
    if (this.reduced || this.disposed || document.hidden || !this.canAnimate)
      return;
    this.heading.dataset.motion = "revealing";
    const inks = this.heading.querySelectorAll(".type-ink");
    let last: Animation | undefined;
    inks.forEach((word, index) => {
      last = this.play(
        word,
        [
          {
            transform: "translate3d(0,112%,0) rotateX(18deg) skewY(3deg)",
            opacity: 0,
          },
          { transform: "translate3d(0,0,0) rotateX(0) skewY(0)", opacity: 1 },
        ],
        initial ? 900 : 640,
        index * 75,
        "hero",
      );
    });
    for (const [index, element] of [
      ...this.hero.querySelectorAll(
        ".exhibition-eyebrow,.exhibition-description,#browse-collection",
      ),
    ].entries())
      this.play(
        element,
        [
          { opacity: 0, transform: "translateY(12px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        650,
        index * 70,
        "hero",
      );
    if (last)
      void last.finished.then(
        () => {
          this.heading.dataset.motion = "settled";
        },
        () => {},
      );
  }

  leaveHero() {
    this.cancel("hero");
    this.heading.dataset.motion = "settled";
    this.resetPointer();
  }

  panelRendered(section: Workspace) {
    const previous = this.currentSection;
    this.cancelPanel();
    this.currentSection = section;
    this.direction = previous
      ? Math.sign(sections.indexOf(section) - sections.indexOf(previous)) || 1
      : 1;
    const nav = this.dialog.querySelector<HTMLElement>(".workspace-sections")!;
    nav.style.setProperty("--section-index", String(sections.indexOf(section)));
    nav.dataset.current = section;
    this.dialog.dataset.section = section;
    this.dialog.dataset.motionDirection =
      this.direction > 0 ? "forward" : "backward";
    this.maskWords(this.dialog.querySelector<HTMLElement>("#workspace-title")!);
    if (previous !== section && this.content.classList.contains("revealed"))
      this.revealPanel();
  }

  revealPanel() {
    this.cancelPanel();
    if (this.reduced || this.disposed || document.hidden || !this.canAnimate)
      return;
    const version = this.panelVersion;
    this.content.dataset.motion = "revealing";
    this.dialog
      .querySelectorAll("#workspace-title .type-ink")
      .forEach((word, index) => {
        this.play(
          word,
          [
            {
              opacity: 0,
              transform: `translate3d(${this.direction * 14}px,105%,0) skewY(${this.direction * 3}deg)`,
            },
            { opacity: 1, transform: "translate3d(0,0,0) skewY(0)" },
          ],
          600,
          index * 45,
        );
      });
    this.play(
      this.dialog.querySelector("#workspace-eyebrow")!,
      [{ opacity: 0.25 }, { opacity: 0.65 }],
      400,
    );
    const rows = [
      ...this.dialog.querySelectorAll(
        "#workspace-description,#workspace-body > *",
      ),
    ].slice(0, 10);
    rows.forEach((row, index) => {
      this.play(
        row,
        [
          {
            opacity: 0.15,
            transform: `translate3d(${this.direction * 10}px,8px,0)`,
          },
          { opacity: 1, transform: "translate3d(0,0,0)" },
        ],
        430,
        Math.min(index * 24, 168),
      );
    });
    // Title and row scores both finish in <= 690 ms. No delayed DOM replacement.
    const owned = [...(this.animations.get("panel") ?? [])];
    void Promise.all(
      owned.map((animation) => animation.finished.catch(() => {})),
    ).then(() => {
      if (version === this.panelVersion)
        this.content.dataset.motion = "settled";
    });
  }

  cancelPanel() {
    ++this.panelVersion;
    this.cancel("panel");
    this.content.dataset.motion = "settled";
  }

  closePanel() {
    this.cancelPanel();
    this.currentSection = null;
  }

  roomCaption(element: HTMLElement, label: string, id: string) {
    element.textContent = label;
    const changed = this.currentRoom && this.currentRoom !== id;
    this.currentRoom = id;
    if (changed) {
      this.cancel("room");
      this.play(
        element,
        [
          { opacity: 0.2, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        420,
        0,
        "room",
      );
    }
  }

  private aimDock(target: EventTarget | null) {
    const button =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-workspace]")
        : null;
    if (!button || !this.dock.contains(button)) {
      delete this.dock.dataset.aim;
      return;
    }
    this.dock.style.setProperty(
      "--dock-index",
      String(sections.indexOf(button.dataset.workspace as Workspace)),
    );
    this.dock.dataset.aim = button.dataset.workspace;
  }

  private press(target: EventTarget | null) {
    const button =
      target instanceof Element
        ? target.closest<HTMLButtonElement>(pressTargets)
        : null;
    if (!button || button.disabled) return;
    this.presses.get(button)?.cancel();
    // Individual scale composes with the fixed controls' existing positioning transforms.
    const animation = this.play(
      button,
      [{ scale: "1" }, { scale: ".965", offset: 0.25 }, { scale: "1" }],
      320,
      0,
      "press",
    );
    if (animation) this.presses.set(button, animation);
  }

  private resetPointer() {
    cancelAnimationFrame(this.pointerFrame);
    this.pointerFrame = 0;
    this.hero.style.setProperty("--title-x", "0px");
    this.hero.style.setProperty("--title-y", "0px");
    this.hero.style.setProperty("--title-light", "50%");
  }

  setReduced(reduced: boolean) {
    this.reduced = reduced;
    if (reduced) this.settle();
  }

  private settle() {
    for (const group of [...this.animations.keys()]) this.cancel(group);
    this.resetPointer();
    ++this.panelVersion;
    this.heading.dataset.motion = this.content.dataset.motion = "settled";
  }

  dispose() {
    this.disposed = true;
    this.events.abort();
    this.settle();
  }
}
