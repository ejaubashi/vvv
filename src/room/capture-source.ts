/** Scene rights and camera transforms are pinned independently of renderer code. */
export const CAPTURES = [
  {
    id: "pantheon",
    name: "The Pantheon Interior",
    creator: "artfletch",
    source: "https://superspl.at/scene/dac6e508",
    license: "https://creativecommons.org/licenses/by/4.0/",
    path: "captures/pantheon/pantheon.sog",
    bytes: 10577976,
    splats: 700000,
    sha256: "bb8c454d78197ae9077215b9e1386af5d3cf8d922c3f983beb33817a9b846185",
    position: [7.843629837036133, 2.531981945037842, -5.571453094482422],
    target: [-6.962605386437639, 12.139213363523982, 2.1690596522468075],
    fov: 64,
    quaternion: [0, 0, 1, 0],
    scale: 1,
    translation: [0, 0, 0],
    note: "Captured daylight \u00b7 source includes a reconstructed floor.",
    thumbnail: "captures/pantheon/thumb.webp",
  },
  {
    id: "apartment",
    name: "Apartment",
    creator: "Stephane Agullo",
    source: "https://superspl.at/view?id=cdcec084",
    license: "https://creativecommons.org/licenses/by/4.0/",
    path: "captures/apartment/apartment.sog",
    bytes: 8379050,
    splats: 661466,
    sha256: "961aad67c47e6ee236bd3789978745da6b2ae6afe7f1a0863e05617ef03881d5",
    position: [-0.98, 0.28, -2.31],
    target: [-1.1, 0.13, -1.56],
    fov: 75,
    quaternion: [1, 0, 0, 0],
    scale: 0.5,
    translation: [0, -0.5, -3],
    note: "Courtyard and interior \u00b7 source lighting.",
    thumbnail: "captures/apartment/thumb.webp",
  },
  {
    id: "small-garden",
    name: "Small Garden",
    creator: "scbenoit",
    source: "https://superspl.at/scene/108dd868",
    license: "https://creativecommons.org/licenses/by/4.0/",
    path: "captures/small-garden/small-garden.sog",
    bytes: 13081550,
    splats: 689694,
    sha256: "68ef9089854aeb84ace37ce51c2ded9404151db86f2e47d8d64ed5f25ce95cb6",
    position: [2.821625232696533, 8.570806503295898, 2.578657865524292],
    target: [-0.22083005569937164, 7.304763339377348, -0.6612279885980237],
    fov: 65,
    quaternion: [0, 0, 1, 0],
    scale: 1,
    translation: [0, 0, 0],
    note: "A bounded photographed garden \u00b7 captured lighting.",
    thumbnail: "captures/small-garden/thumb.webp",
  },
  {
    id: "la-night",
    name: "LA Night",
    creator: "matousekfoto",
    source: "https://superspl.at/scene/d1ea0b35",
    license: "https://creativecommons.org/licenses/by/4.0/",
    path: "captures/la-night/la-night.sog",
    bytes: 10784806,
    splats: 700000,
    sha256: "1855bafab769a80533c0b2e1a2dc3f8bd52b345488c6f04e04e7f96f9470f041",
    position: [3.050088882446289, 1.9219162464141846, -2.449230909347534],
    target: [0.08517506656344276, 0.5947246161163686, 0.22038956559001122],
    fov: 65,
    quaternion: [0, 0, 1, 0],
    scale: 1,
    translation: [0, 0, 0],
    note: "Nighttime city capture \u00b7 lighting is baked into the scene.",
    thumbnail: "captures/la-night/thumb.webp",
  },
] as const;
export type CaptureDefinition = (typeof CAPTURES)[number];
export type CaptureId = CaptureDefinition["id"];
export const CAPTURE = CAPTURES[0];
export const isCaptureId = (id: string): id is CaptureId =>
  CAPTURES.some((entry) => entry.id === id);
export const captureDefinition = (id: CaptureId) =>
  CAPTURES.find((entry) => entry.id === id)!;

export async function downloadCapture(
  signal: AbortSignal,
  progress: (ratio: number) => void,
  capture: CaptureDefinition = CAPTURE,
) {
  const embedded =
    document.querySelector<HTMLScriptElement>(
      `script[data-capture="${capture.id}"]`,
    ) ??
    (capture.id === "pantheon"
      ? document.querySelector<HTMLScriptElement>("#form-capture-data")
      : null);
  const url = embedded
    ? `data:application/octet-stream;base64,${embedded.textContent!.trim()}`
    : new URL(capture.path, document.baseURI);
  const response = await fetch(url, {
    signal,
  });
  if (!response.ok || !response.body)
    throw Error("Capture download unavailable");
  const bytes = new Uint8Array(capture.bytes);
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
    if (hash !== capture.sha256) throw Error("Capture integrity check failed");
    return bytes;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
