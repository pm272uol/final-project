import type {
  EvaluationCheck,
  EvaluationResult,
  StoryboardPackage,
} from "@/types/storyboard";

export const EVALUATION_PASS_THRESHOLD = 85;

export function evaluateStoryboard(
  storyboard: StoryboardPackage,
  requestedPanelCount: number,
): EvaluationResult {
  const panels = storyboard.storyboard;
  const every = (test: (panel: StoryboardPackage["storyboard"][number]) => boolean) =>
    panels.length > 0 && panels.every(test);

  const checks: EvaluationCheck[] = [
    check("title", "Title supplied", Boolean(storyboard.title.trim()), "Add a concise working title."),
    check("logline", "Logline supplied", Boolean(storyboard.logline.trim()), "Summarise the dramatic arc in one sentence."),
    check("characters", "Characters defined", storyboard.characters.length > 0, "Define at least one production-ready character."),
    check("locations", "Locations defined", storyboard.locations.length > 0, "Define at least one location and its mood."),
    check("panel-count", "Requested panel count", panels.length === requestedPanelCount, `Expected exactly ${requestedPanelCount} panels.`),
    check("beats", "Clear story beats", every((p) => p.storyBeat.trim().length > 12), "Each panel needs one clear visual beat."),
    check("shots", "Shot types assigned", every((p) => Boolean(p.shotType)), "Assign a shot type to every panel."),
    check("camera", "Camera direction included", every((p) => p.cameraDirection.trim().length > 12), "Describe framing or movement for every panel."),
    check("action", "Action is playable", every((p) => p.action.trim().length > 12), "Give the performer or subject a concrete action."),
    check("prompts", "Image prompts are specific", every((p) => p.imagePrompt.trim().length >= 80), "Include subject, setting, composition, light, mood, and style."),
    check("negative-prompts", "Negative prompts included", every((p) => p.negativePrompt.trim().length > 20), "State what each visual should avoid."),
    check("continuity", "Continuity notes supplied", storyboard.continuityNotes.length > 0, "Add visual continuity guidance."),
    check("production", "Production notes supplied", storyboard.productionNotes.length > 0, "Add practical production guidance."),
    check("sequence", "Panels follow a sequence", panels.every((p, index) => p.panelNumber === index + 1), "Number panels consecutively from one."),
  ];

  const score = Math.round(
    (checks.filter((item) => item.passed).length / checks.length) * 100,
  );

  return {
    score,
    passed: score >= EVALUATION_PASS_THRESHOLD,
    checks,
  };
}

function check(
  id: string,
  label: string,
  passed: boolean,
  failureMessage: string,
): EvaluationCheck {
  return {
    id,
    label,
    passed,
    message: passed ? "Ready for the storyboard package." : failureMessage,
  };
}
