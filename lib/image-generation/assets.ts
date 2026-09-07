/** Copy temporary provider output into the project payload before it expires. */
export async function persistProviderImage(url: string, signal?: AbortSignal) {
  if (url.startsWith("/api/mock-panel-image?") || url.startsWith("data:image/")) return url;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !(parsed.hostname === "replicate.delivery" || parsed.hostname.endsWith(".replicate.delivery"))) {
    throw new Error("Unexpected image delivery host.");
  }
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000), redirect: "error" });
  const mime = response.headers.get("content-type")?.split(";")[0];
  if (!response.ok || !mime || !["image/png", "image/jpeg", "image/webp"].includes(mime)) throw new Error("Could not preserve the generated image.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty image response.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 8_000_000) { await reader.cancel(); throw new Error("Generated image exceeds 8 MB."); }
    chunks.push(value);
  }
  return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
}
