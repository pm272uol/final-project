import sharp from "sharp";
import type { VisualReference } from "@/types/storyboard";

/** IP-Adapter accepts one style image; arrange relevant assets into that one input. */
export async function referenceSheet(references: VisualReference[]) {
  const images = references.filter(r => r.purpose !== "composition");
  if (images.length === 1) return images[0].imageUrl;
  if (!images.length) throw new Error("A style reference is required.");
  const columns = Math.min(images.length, 3), rows = Math.ceil(images.length / columns);
  const inputs = await Promise.all(images.map(async (r, index) => {
    if (!r.imageUrl.startsWith("data:image/")) throw new Error("Hosted references must be embedded images.");
    const input = await sharp(Buffer.from(r.imageUrl.split(",")[1], "base64"), { limitInputPixels: 20_000_000 }).resize(512, 512, { fit: "contain", background: "#ffffff" }).png().toBuffer();
    return { input, left: (index % columns) * 512, top: Math.floor(index / columns) * 512 };
  }));
  const output = await sharp({ create: { width: columns * 512, height: rows * 512, channels: 3, background: "#ffffff" } }).composite(inputs).png().toBuffer();
  return `data:image/png;base64,${output.toString("base64")}`;
}
