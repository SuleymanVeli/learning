import { createHash } from "node:crypto";

const VIDEO_ID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const LIBRARY_ID_PATTERN = /^\d+$/;
const EMBED_TOKEN_TTL_SECONDS = 60 * 60;

export function signBunnyStreamEmbedUrl(
  videoId: string,
  libraryId: string,
  tokenKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  if (
    !VIDEO_ID_PATTERN.test(videoId) ||
    !LIBRARY_ID_PATTERN.test(libraryId) ||
    !tokenKey
  ) {
    throw new Error("Bunny Stream video ID, library ID, or token key is invalid.");
  }

  const expires = nowSeconds + EMBED_TOKEN_TTL_SECONDS;
  const token = createHash("sha256")
    .update(`${tokenKey}${videoId}${expires}`)
    .digest("hex");

  const url = new URL(
    `https://player.mediadelivery.net/embed/${libraryId}/${videoId}`,
  );
  url.searchParams.set("token", token);
  url.searchParams.set("expires", String(expires));
  return url.toString();
}
