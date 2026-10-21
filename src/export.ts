/** Capture synchronously while the current GPU frame is available; encode asynchronously. */
export class FrameExport {
  private disposed = false;
  private urls = new Map<string, number>();
  save(canvas: HTMLCanvasElement): Promise<void> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (this.disposed) {
          reject(new Error("Export was canceled."));
          return;
        }
        if (!blob) {
          reject(new Error("This browser could not export the frame."));
          return;
        }
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = "form-optical-study.png";
        document.body.append(link);
        link.click();
        link.remove();
        this.urls.set(
          url,
          window.setTimeout(() => this.release(url), 1000),
        );
        resolve();
      }, "image/png");
    });
  }
  private release(url: string) {
    URL.revokeObjectURL(url);
    this.urls.delete(url);
  }
  dispose() {
    this.disposed = true;
    for (const [url, timer] of this.urls) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    this.urls.clear();
  }
}
