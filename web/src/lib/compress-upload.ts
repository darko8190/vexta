/**
 * Compresses a file in the browser before it is uploaded to R2.
 *
 * Why in the browser: the file never passes through our API on its way to R2 — it goes straight
 * there with a signed URL — so this is the only place in the chain that holds the bytes. It also
 * means the compression costs us no CPU and no bandwidth.
 *
 * Nothing has to decompress it afterwards. The encoding is stored on the R2 object itself, so R2
 * returns `Content-Encoding: gzip` and the browser inflates it on its own, exactly as it does
 * for any compressed web response. The file a reader sees is the file that was uploaded, byte
 * for byte: gzip is lossless.
 */

/** gzip gains nothing on these — they are already compressed, and often grow a little. */
const ALREADY_COMPRESSED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/jp2",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "application/zip",
  "application/gzip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/x-bzip2",
  "application/x-xz",
  // Every modern Office format is a zip container with the payload already deflated.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

/**
 * Below this there is nothing to win: gzip's own header and footer are about 20 bytes, and a
 * stored encoding is one more thing that has to be right on every read.
 */
const MIN_BYTES_TO_TRY = 4 * 1024;

/**
 * Compression has to earn its place. A file that shrinks by 3% is not worth storing in a form
 * that depends on a header being served back correctly.
 */
const WORTH_IT_RATIO = 0.95;

export interface PreparedUpload {
  /** What to PUT to the signed URL. */
  body: Blob;
  /** Always the original file's type: gzip is a transport encoding, not a change of format. */
  contentType: string;
  /** "gzip", or null when the file is stored exactly as it was chosen. */
  contentEncoding: "gzip" | null;
  /** What R2 will hold, which is what Cloudflare bills for. */
  storedSize: number;
  /** What the file weighed on the person's machine. */
  originalSize: number;
}

function isWorthTrying(file: File, contentType: string): boolean {
  if (file.size < MIN_BYTES_TO_TRY) return false;
  if (ALREADY_COMPRESSED.has(contentType)) return false;

  // Encrypted or opaque binaries are indistinguishable from compressed ones to gzip.
  if (contentType.startsWith("audio/") || contentType.startsWith("video/")) return false;

  return true;
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const contentType = file.type || "application/octet-stream";

  const asIs: PreparedUpload = {
    body: file,
    contentType,
    contentEncoding: null,
    storedSize: file.size,
    originalSize: file.size,
  };

  // CompressionStream is in every current browser, but an old one must still be able to upload.
  if (typeof CompressionStream === "undefined" || !isWorthTrying(file, contentType)) {
    return asIs;
  }

  try {
    const compressed = await new Response(
      file.stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();

    if (compressed.size >= file.size * WORTH_IT_RATIO) {
      return asIs;
    }

    return {
      body: compressed,
      contentType,
      contentEncoding: "gzip",
      storedSize: compressed.size,
      originalSize: file.size,
    };
  } catch {
    // A failure to compress must never be a failure to upload.
    return asIs;
  }
}
