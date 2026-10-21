export type MediaKind = "image" | "video" | "audio";
export class MediaManager {
  source: HTMLImageElement | HTMLVideoElement | null = null;
  player: HTMLMediaElement | null = null;
  kind: MediaKind | null = null;
  url: string | null = null;
  generation = 0;
  frameVersion = 0;
  private frameCallback: number | null = null;
  private frameVideo: HTMLVideoElement | null = null;
  private harmonics: OscillatorNode[] = [];
  private modulation: OscillatorNode | null = null;
  private modulationGain: GainNode | null = null;
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
      if (this.source instanceof HTMLVideoElement) this.watchVideo(this.source);
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
  private watchVideo(video: HTMLVideoElement) {
    this.frameVersion++;
    if (typeof video.requestVideoFrameCallback !== "function") return;
    this.frameVideo = video;
    const frame = () => {
      if (this.frameVideo !== video) return;
      this.frameVersion++;
      this.onChange();
      this.frameCallback = video.requestVideoFrameCallback(frame);
    };
    this.frameCallback = video.requestVideoFrameCallback(frame);
  }
  get decodedFrame() {
    return this.source instanceof HTMLVideoElement &&
      typeof this.source.requestVideoFrameCallback === "function"
      ? this.frameVersion
      : undefined;
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
    gain.gain.value = 0.018;
    oscillator.connect(gain);
    gain.connect(this.analyser!);
    oscillator.start();
    for (const frequency of [164.81, 220]) {
      const harmonic = this.context!.createOscillator();
      harmonic.type = "sine";
      harmonic.frequency.value = frequency;
      harmonic.connect(gain);
      harmonic.start();
      this.harmonics.push(harmonic);
    }
    const modulation = this.context!.createOscillator(),
      modulationGain = this.context!.createGain();
    modulation.frequency.value = 0.09;
    modulationGain.gain.value = 0.006;
    modulation.connect(modulationGain);
    modulationGain.connect(gain.gain);
    modulation.start();
    this.modulation = modulation;
    this.modulationGain = modulationGain;
    this.demoGain = gain;
    this.oscillator = oscillator;
    this.demo = true;
    this.onChange();
  }
  stopDemo() {
    this.oscillator?.stop();
    this.oscillator?.disconnect();
    this.oscillator = null;
    for (const harmonic of this.harmonics) {
      harmonic.stop();
      harmonic.disconnect();
    }
    this.harmonics = [];
    this.modulation?.stop();
    this.modulation?.disconnect();
    this.modulation = null;
    this.modulationGain?.disconnect();
    this.modulationGain = null;
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
    if (this.frameVideo && this.frameCallback !== null)
      this.frameVideo.cancelVideoFrameCallback(this.frameCallback);
    this.frameVideo = null;
    this.frameCallback = null;
    this.frameVersion++;
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
