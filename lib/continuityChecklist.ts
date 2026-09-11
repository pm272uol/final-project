import type { StoryboardPackage } from "@/types/storyboard";

export type ContinuityIssue = { id: string; panelNumber: number; category: "Cast" | "Props" | "Wardrobe" | "Location" | "Image direction"; message: string; flagged: boolean };
function fingerprint(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
export function continuityChecklist(board: StoryboardPackage): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [], bible = board.visualBible;
  board.storyboard.forEach((panel, index) => {
    const previous = board.storyboard[index - 1];
    // Review decisions expire whenever the shot, image, nearby continuity or bible changes.
    const evidence = JSON.stringify({
      panel: { ...panel, imageHistory: undefined, imageUrl: undefined, imageSelected: undefined, imageApproved: undefined },
      previous: previous && { id: previous.panelId, number: previous.panelNumber, cast: previous.characterIds, props: previous.visibleProps, locations: previous.locationIds, changes: previous.continuityChanges },
      bible, references: board.visualReferences?.map(r => ({ id: r.id, version: r.version, approved: r.approved })),
    });
    function add(category: ContinuityIssue["category"], message: string, flagged = false) {
      issues.push({ id: `${panel.panelId ?? panel.panelNumber}-${fingerprint(category + message + evidence)}`, panelNumber: panel.panelNumber, category, message, flagged });
    }
    const unknownCast = panel.characterIds?.filter(id => !bible?.characters.some(c => c.id === id));
    add("Cast", unknownCast?.length ? `Unknown cast IDs: ${unknownCast.join(", ")}. Correct the shot assignments.` : panel.characterIds === undefined ? "Cast has not been explicitly assigned. Verify who is visible and check for extra people." : `Verify visible cast: ${panel.characterIds.map(id => bible?.characters.find(c => c.id === id)?.name ?? id).join(", ") || "no recurring characters"}. Check identity and count in the image.`, Boolean(unknownCast?.length) || panel.characterIds === undefined);
    const props = panel.visibleProps;
    const sameLocation = previous?.locationIds?.some(id => panel.locationIds?.includes(id));
    const propDifference = sameLocation && previous?.visibleProps && props && JSON.stringify([...previous.visibleProps].sort()) !== JSON.stringify([...props].sort());
    add("Props", propDifference ? `Visible props change from shot ${previous.panelNumber}: ${previous.visibleProps?.join(", ") || "none"} → ${props?.join(", ") || "none"}. Confirm the change is intended.` : `Check recurring prop appearance, scale and position. Recorded props: ${props?.join(", ") || "none specified"}.`, Boolean(propDifference));
    const reset = previous?.continuityChanges?.filter(change => panel.characterIds?.includes(change.characterId) && !panel.continuityChanges?.some(next => next.characterId === change.characterId && next.appearance === change.appearance && next.clothing === change.clothing && next.accessories === change.accessories));
    add("Wardrobe", reset?.length ? `Appearance overrides change or stop after shot ${previous.panelNumber} for ${reset.map(c => bible?.characters.find(char => char.id === c.characterId)?.name ?? c.characterId).join(", ")}. Repeat overrides if the change should persist.` : "Compare wardrobe, hair, accessories and distinguishing features with the bible and any intentional shot changes.", Boolean(reset?.length));
    const unknownLocations = panel.locationIds?.filter(id => !bible?.locations.some(l => l.id === id));
    const locationChange = previous?.locationIds && panel.locationIds && JSON.stringify([...previous.locationIds].sort()) !== JSON.stringify([...panel.locationIds].sort());
    add("Location", unknownLocations?.length ? `Unknown location IDs: ${unknownLocations.join(", ")}.` : locationChange ? `Location assignment changes after shot ${previous.panelNumber}. Confirm the transition and geography are intended.` : `Verify architecture, lighting and geography for ${panel.setting}.`, Boolean(unknownLocations?.length || locationChange));
    if (panel.imageUrl && (panel.imageNeedsReview || panel.imageBibleVersion !== bible?.approvedVersion)) add("Image direction", "This image may predate the current visual direction. Compare it against the approved bible and shot text.", true);
  });
  return issues;
}
