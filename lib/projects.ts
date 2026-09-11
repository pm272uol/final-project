import { recoverStoryboard } from "./storyboardRecovery";
import { z } from "zod";
import { storyboardInputSchema, storyboardPackageSchema } from "./storyboardSchema";
import { generationMetadataSchema, storyboardVersionSchema } from "./versions";
import type { StoryboardPackage } from "@/types/storyboard";

export const projectSchema = z.object({
  formatVersion: z.literal(1), id: z.string().min(1), name: z.string().min(1), savedAt: z.string().datetime(),
  input: storyboardInputSchema, storyboard: storyboardPackageSchema,
  versions: z.array(storyboardVersionSchema).max(50).optional(), metadata: generationMetadataSchema.nullable().optional(),
}).strict();
export type SavedProject = z.infer<typeof projectSchema>;
export function parseProject(value: unknown): SavedProject {
  const project = projectSchema.parse(value);
  return { ...project, storyboard: recoverStoryboard(project.storyboard), versions: project.versions?.map(version => ({ ...version, storyboard: recoverStoryboard(version.storyboard) })) };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("framewright-projects", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveProject(project: SavedProject) {
  const validated = parseProject(project), db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").put(validated);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}
export async function listProjects(): Promise<SavedProject[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction("projects").objectStore("projects").getAll();
    request.onsuccess = () => { try { resolve(request.result.map(parseProject).sort((a, b) => b.savedAt.localeCompare(a.savedAt))); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export function downloadFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export async function exportContactSheet(board: StoryboardPackage) {
  const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = Math.ceil(board.storyboard.length / 2) * 520 + 80;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas unavailable.");
  context.fillStyle = "#f8f5ed"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#161813"; context.font = "32px sans-serif"; context.fillText(board.title, 24, 48, 1550);
  for (const [index, panel] of board.storyboard.entries()) {
    const x = (index % 2) * 800 + 20, y = Math.floor(index / 2) * 520 + 90;
    if (panel.imageUrl) {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`Cannot load panel ${panel.panelNumber}.`)); img.src = panel.imageUrl!; });
      context.drawImage(image, x, y, 760, 428);
    }
    context.fillStyle = "#161813"; context.font = "20px sans-serif";
    context.fillText(`${panel.panelNumber}. ${panel.shotType} · ${panel.storyBeat}`, x, y + 460, 760);
    context.font = "16px sans-serif"; context.fillText(panel.imageApproved ? "Approved" : panel.imageUrl ? "Review required" : "Missing image", x, y + 486);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Export failed.")), "image/png"));
  downloadFile("storyboard-contact-sheet.png", blob);
}
