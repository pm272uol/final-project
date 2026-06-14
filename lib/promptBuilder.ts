import type { StoryboardInput } from "@/types/storyboard";

export function buildStoryboardPrompt(input: StoryboardInput): string {
  return `You are a storyboard and concept development assistant for short-film creators.

Transform the rough scene idea below into a practical, structured storyboard prompt package.
Return only valid JSON, without markdown, commentary, code fences, or extra fields.

The JSON must contain: title, logline, genre, tone, visualStyle, estimatedDuration,
characters, locations, storyboard, continuityNotes, and productionNotes.

Each character must contain: name, role, visualDescription, and personality.
The character role must be exactly one of: protagonist, supporting, antagonist, background.

Each location must contain: name, description, and mood.

Each storyboard panel must contain: panelNumber, storyBeat, shotType, cameraDirection,
action, setting, imagePrompt, negativePrompt, dialogueOrNarration, and productionNote.
The shotType must be exactly one of: establishing shot, wide shot, medium shot,
close-up, extreme close-up, over-the-shoulder, point-of-view shot, tracking shot.

continuityNotes and productionNotes must each be arrays of plain strings.

User input:
Scene idea: ${input.sceneIdea}
Genre: ${input.genre}
Visual style: ${input.visualStyle}
Tone: ${input.tone}
Estimated duration: ${input.duration}
Number of storyboard panels: ${input.panelCount}
Target format: ${input.targetFormat}
${
  input.visualReferenceSummary
    ? `Combined visual direction: ${input.visualReferenceSummary}`
    : "Combined visual direction: No reference images supplied."
}

Requirements:
- Create exactly ${input.panelCount} storyboard panels.
- Keep the story simple enough for a ${input.duration} short film.
- Give each panel one clear visual beat.
- Use visual storytelling rather than long dialogue.
- Maintain consistent characters and locations.
- Apply the combined visual direction throughout without mentioning reference images, uploads, filenames, or source material.
- Include subject, setting, composition, lighting, mood, style, and key details in every image prompt.
- Explain framing or camera movement in cameraDirection.
- Make every production note practical for a filmmaker.
- Return valid JSON only.`;
}
