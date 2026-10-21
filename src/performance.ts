export class PerformanceMonitor {
  frames = 0;
  elapsed = 0;
  fps = 0;
  frameMs = 0;
  scale = 1;
  slow = 0;
  fast = 0;
  sample(ms: number) {
    this.frames++;
    this.elapsed += ms;
    if (this.elapsed < 1000) return false;
    this.frameMs = this.elapsed / this.frames;
    this.fps = 1000 / this.frameMs;
    this.slow = this.frameMs > 23 ? this.slow + 1 : 0;
    this.fast = this.frameMs < 17.5 ? this.fast + 1 : 0;
    let changed = false;
    if (this.slow >= 3 && this.scale > 0.55) {
      this.scale = Math.max(0.55, this.scale - 0.15);
      this.slow = this.fast = 0;
      changed = true;
    }
    if (this.fast >= 10 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.1);
      this.slow = this.fast = 0;
      changed = true;
    }
    this.frames = this.elapsed = 0;
    return changed;
  }
}
