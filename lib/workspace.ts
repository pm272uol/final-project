import { z } from "zod";
import { storyboardInputSchema, storyboardPackageSchema } from "./storyboardSchema";
import { REFERENCE_PURPOSES } from "./referenceImageOptions";

import { generationMetadataSchema, storyboardVersionSchema } from "./versions";
export const workspaceSchema = z.object({
  input: storyboardInputSchema.extend({ sceneIdea: z.string() }),
  projectInput: storyboardInputSchema.nullable(),
  storyboard: storyboardPackageSchema.nullable(),
  metadata: generationMetadataSchema.nullable(),
  projectId: z.string().nullable(),
  versions: z.array(storyboardVersionSchema).max(50).default([]),
  visualSummary: z.string(),
  references: z.array(z.object({ id: z.string(), blob: z.instanceof(Blob), purpose: z.enum(REFERENCE_PURPOSES) })),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Recovery = { savedAt: string; workspace: Workspace };
export function recoverWorkspace(value: unknown): Workspace {
  const workspace = workspaceSchema.parse(value);
  if (workspace.storyboard) workspace.storyboard.storyboard = workspace.storyboard.storyboard.map(p => ({ ...p, imageStatus: p.imageStatus === "generating" ? p.imageUrl ? "complete" : "not_started" : p.imageStatus }));
  return workspace;
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("framewright-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function readRecovery(): Promise<Recovery | null> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction("drafts").objectStore("drafts").get("current");
    request.onsuccess = () => { try { resolve(request.result ? { savedAt: request.result.savedAt, workspace: recoverWorkspace(request.result.workspace) } : null); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function writeRecovery(workspace: Workspace | null): Promise<string> {
  const db = await database(), savedAt = new Date().toISOString();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite"), store = transaction.objectStore("drafts");
    if (workspace) store.put({ savedAt, workspace }, "current"); else store.delete("current");
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  }); return savedAt; } finally { db.close(); }
}
