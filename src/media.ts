export type MediaKind = "image" | "video" | "audio";
export class MediaManager {
  source: HTMLImageElement | HTMLVideoElement | null = null;
  player: HTMLMediaElement | null = null;
  kind: MediaKind | null = null;
  url: string | null = null;
  generation = 0;
  context: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private nodes: AudioNode[] = [];
  private data = new Uint8Array(128);
  private oscillator: OscillatorNode | null = null;
  private demoGain: GainNode | null = null;
  private pendingCancel: (() => void) | null = null;
  demo = false;
  onChange = () => {};
  async load(file: File) {
    if (file.size > 150 * 1024 * 1024)
      throw new Error("Choose a file smaller than 150 MB.");
    const kind = file.type.split("/")[0];
    if (!["image", "video", "audio"].includes(kind))
      throw new Error("Choose an image, video, or audio file.");
    this.pendingCancel?.();
    const generation = ++this.generation;
    const url = URL.createObjectURL(file);
    const element =
      kind === "image"
        ? new Image()
        : document.createElement(kind === "video" ? "video" : "audio");
    if (element instanceof HTMLMediaElement) {
      element.preload = "auto";
      if (element instanceof HTMLVideoElement) element.playsInline = true;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const cancel = () =>
          finish(new DOMException("Replaced by a newer file.", "AbortError"));
        this.pendingCancel = cancel;
        const owner = this;
        const timer = window.setTimeout(
          () =>
            finish(
              new Error("The media took too long to decode. Try another file."),
            ),
          15000,
        );
        const ready = kind === "image" ? "load" : "loadeddata";
        const success = () => finish();
        const failure = () =>
          finish(
            new Error(
              "This file could not be decoded. Try a browser-supported format.",
            ),
          );
        function finish(error?: Error) {
          if (owner.pendingCancel === cancel) owner.pendingCancel = null;
          clearTimeout(timer);
          element.removeEventListener(ready, success);
          element.removeEventListener("error", failure);
          error ? reject(error) : resolve();
        }
        element.addEventListener(ready, success);
        element.addEventListener("error", failure);
        element.src = url;
      });
      if (generation !== this.generation) {
        if (element instanceof HTMLMediaElement) {
          element.pause();
          element.removeAttribute("src");
          element.load();
        }
        URL.revokeObjectURL(url);
        return false;
      }
      this.clearCurrent();
      this.url = url;
      this.kind = kind as MediaKind;
      this.source =
        kind === "audio"
          ? null
          : (element as HTMLImageElement | HTMLVideoElement);
      this.player = element instanceof HTMLMediaElement ? element : null;
      if (this.player) {
        this.player.addEventListener("play", this.onChange);
        this.player.addEventListener("pause", this.onChange);
        this.player.addEventListener("ended", this.onChange);
        this.player.addEventListener("timeupdate", this.onChange);
        this.connectPlayer();
      }
      this.onChange();
      return true;
    } catch (error) {
      if (element instanceof HTMLMediaElement) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      URL.revokeObjectURL(url);
      if (error instanceof DOMException && error.name === "AbortError")
        return false;
      throw error;
    }
  }
  private ensureAudio() {
    this.context ??= new AudioContext();
    if (!this.analyser) {
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.context.destination);
    }
  }
  private connectPlayer() {
    if (!this.player) return;
    this.ensureAudio();
    const node = this.context!.createMediaElementSource(this.player);
    node.connect(this.analyser!);
    this.nodes.push(node);
  }
  async play() {
    if (!this.player) return;
    this.ensureAudio();
    await this.context!.resume();
    await this.player.play();
    this.onChange();
  }
  async toggleDemo() {
    if (this.demo) {
      this.stopDemo();
      return;
    }
    this.ensureAudio();
    await this.context!.resume();
    const oscillator = this.context!.createOscillator();
    const gain = this.context!.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 110;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(this.analyser!);
    oscillator.start();
    this.demoGain = gain;
    this.oscillator = oscillator;
    this.demo = true;
    this.onChange();
  }
  stopDemo() {
    this.oscillator?.stop();
    this.oscillator?.disconnect();
    this.oscillator = null;
    this.demoGain?.disconnect();
    this.demoGain = null;
    this.demo = false;
    this.onChange();
  }
  energy() {
    if (!this.analyser) return 0;
    this.analyser.getByteFrequencyData(this.data);
    let sum = 0;
    for (const v of this.data) sum += v;
    return Math.min(1, sum / (this.data.length * 60));
  }
  get playing() {
    return !!this.player && !this.player.paused && !this.player.ended;
  }
  clearCurrent() {
    if (this.player) {
      for (const event of ["play", "pause", "ended", "timeupdate"])
        this.player.removeEventListener(event, this.onChange);
      this.player.pause();
      this.player.removeAttribute("src");
      this.player.load();
    }
    this.stopDemo();
    for (const node of this.nodes) node.disconnect();
    this.nodes = [];
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.source = this.player = null;
    this.kind = null;
  }
  clear() {
    this.pendingCancel?.();
    ++this.generation;
    this.clearCurrent();
    this.onChange();
  }
  dispose() {
    this.clear();
    this.analyser?.disconnect();
    void this.context?.close();
  }
}
