// Thin wrapper around @vercel/blob with an injectable backend so unit tests
// can swap a fake. In production, use the default lazy-loaded backend that
// pulls @vercel/blob on first use (keeps test bundles small).

export interface SelfieBlobBackend {
  put(
    pathname: string,
    body: Buffer,
    opts: { contentType: string; access: "public" },
  ): Promise<{ url: string }>;
  del(url: string): Promise<void>;
}

let _defaultBackend: SelfieBlobBackend | null = null;

function getDefaultBackend(): SelfieBlobBackend {
  if (_defaultBackend) return _defaultBackend;
  _defaultBackend = {
    async put(pathname, body, opts) {
      const mod = await import("@vercel/blob");
      const res = await mod.put(pathname, body, {
        access: "public",
        contentType: opts.contentType,
        addRandomSuffix: true,
      });
      return { url: res.url };
    },
    async del(url) {
      const mod = await import("@vercel/blob");
      await mod.del(url);
    },
  };
  return _defaultBackend;
}

export interface UploadSelfieBlobsInput {
  signerId: string;
  selfieId: string;
  original: Buffer;
  display: Buffer;
  thumbnail: Buffer;
}

export interface UploadedSelfieBlobs {
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
}

/**
 * Uploads all three derived sizes for one selfie submission. The path scheme
 * keeps a signer's selfies grouped (helpful when bulk-cleaning during
 * revocation). Vercel Blob URLs include a hard-to-guess random suffix
 * (addRandomSuffix: true) so although the bucket is "public," enumeration
 * is not realistic. Pre-approval, the URLs are simply never linked in the
 * rendered HTML — they exist but aren't surfaced anywhere.
 */
export async function uploadSelfieBlobs(
  input: UploadSelfieBlobsInput,
  backend: SelfieBlobBackend = getDefaultBackend(),
): Promise<UploadedSelfieBlobs> {
  const base = `selfies/${input.signerId}/${input.selfieId}`;
  const original = await backend.put(`${base}/original.jpg`, input.original, {
    contentType: "image/jpeg",
    access: "public",
  });
  const display = await backend.put(`${base}/display.webp`, input.display, {
    contentType: "image/webp",
    access: "public",
  });
  const thumbnail = await backend.put(
    `${base}/thumbnail.webp`,
    input.thumbnail,
    { contentType: "image/webp", access: "public" },
  );
  return {
    originalUrl: original.url,
    displayUrl: display.url,
    thumbnailUrl: thumbnail.url,
  };
}

/**
 * Best-effort delete; never throws. Use for cleanup paths (revocation,
 * post-failure rollback) where a 404 from an already-deleted blob is fine.
 */
export async function deleteSelfieBlobsByUrls(
  urls: {
    originalUrl?: string | null;
    displayUrl?: string | null;
    thumbnailUrl?: string | null;
  },
  backend: SelfieBlobBackend = getDefaultBackend(),
): Promise<void> {
  for (const url of [urls.originalUrl, urls.displayUrl, urls.thumbnailUrl]) {
    if (!url) continue;
    try {
      await backend.del(url);
    } catch (err) {
      console.warn("[blob] delete failed (ignored):", url, err);
    }
  }
}

/**
 * In-memory backend for unit tests. Returns a `Map`-backed store you can
 * inspect for size + presence assertions.
 */
export function createInMemoryBackend(): SelfieBlobBackend & {
  store: Map<string, { body: Buffer; contentType: string; access: string }>;
} {
  const store = new Map<
    string,
    { body: Buffer; contentType: string; access: string }
  >();
  let n = 0;
  return {
    store,
    async put(pathname, body, opts) {
      const url = `mem://${pathname}#${++n}`;
      store.set(url, {
        body,
        contentType: opts.contentType,
        access: opts.access,
      });
      return { url };
    },
    async del(url) {
      store.delete(url);
    },
  };
}
