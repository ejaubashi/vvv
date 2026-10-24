import type { Motion } from "./motion";

/** The renderer morphs the surface; DOM text reveals at its final layout size. */
export class WorkspaceTransition {
  returnFocus: HTMLElement;
  private focusPending = false;
  constructor(
    private dialog: HTMLDialogElement,
    private content: HTMLElement,
    private motion: Motion,
    fallbackFocus: HTMLElement,
    private onReveal: () => void = () => {},
  ) {
    this.returnFocus = fallbackFocus;
  }
  open(trigger: HTMLElement) {
    this.returnFocus = trigger;
    if (!this.dialog.open) {
      this.content.classList.remove("revealed");
      this.content.inert = true;
      this.dialog.showModal();
    }
    this.focusPending = true;
    this.motion.morph.target = 1;
  }
  close() {
    this.content.classList.remove("revealed");
    this.content.inert = true;
    this.focusPending = false;
    this.motion.morph.target = 0;
  }
  update(amount: number, active: boolean) {
    if (!this.dialog.open) return;
    this.dialog.style.background = `rgba(var(--workspace-surface, 245,246,241),${Math.pow(amount, 3) * 0.88})`;
    if (
      active &&
      amount > 0.94 &&
      !this.content.classList.contains("revealed")
    ) {
      this.content.classList.add("revealed");
      this.content.inert = false;
      this.onReveal();
      if (this.focusPending) {
        this.dialog
          .querySelector<HTMLButtonElement>("#close-workspace")!
          .focus({ preventScroll: true });
        this.focusPending = false;
      }
    }
    if (!active && amount < 0.003 && !this.motion.morph.moving) {
      this.dialog.close();
      this.content.inert = false;
      this.returnFocus.focus({ preventScroll: true });
    }
  }
}
