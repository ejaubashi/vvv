/** Asset rights are separate from Spark's MIT software license. */
export const CAPTURE = {
  id: "pantheon",
  name: "The Pantheon Interior",
  creator: "artfletch",
  source: "https://superspl.at/scene/dac6e508",
  license: "https://creativecommons.org/licenses/by/4.0/",
  path: "captures/pantheon/pantheon.sog",
  bytes: 10_577_976,
  splats: 700_000,
  sha256: "bb8c454d78197ae9077215b9e1386af5d3cf8d922c3f983beb33817a9b846185",
  position: [7.843629837036133, 2.531981945037842, -5.571453094482422],
  target: [-6.962605386437639, 12.139213363523982, 2.1690596522468075],
} as const;

export async function downloadCapture(
  signal: AbortSignal,
  progress: (ratio: number) => void,
) {
  const embedded =
    document.querySelector<HTMLScriptElement>("#form-capture-data");
  const url = embedded
    ? `data:application/octet-stream;base64,${embedded.textContent!.trim()}`
    : new URL(CAPTURE.path, document.baseURI);
  const response = await fetch(url, {
    signal,
  });
  if (!response.ok || !response.body)
    throw Error("Capture download unavailable");
  const bytes = new Uint8Array(CAPTURE.bytes);
  const reader = response.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > bytes.length)
        throw Error("Unexpected capture size");
      bytes.set(value, received);
      received += value.length;
      progress(received / bytes.length);
    }
    if (received !== bytes.length) throw Error("Incomplete capture download");
    signal.throwIfAborted();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== CAPTURE.sha256) throw Error("Capture integrity check failed");
    return bytes;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
