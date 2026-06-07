import type { StoryboardInput } from "@/types/storyboard";

export function buildStoryboardPrompt(input: StoryboardInput): string {
  return `You are a storyboard and concept development assistant for short-film creators.

Transform the rough scene idea below into a practical, structured storyboard prompt package.
Return only valid JSON, without markdown, commentary, code fences, or extra fields.

The JSON must contain: title, logline, genre, tone, visualStyle, estimatedDuration,
characters, locations, storyboard, continuityNotes, and productionNotes.

Each storyboard panel must contain: panelNumber, storyBeat, shotType, cameraDirection,
action, setting, imagePrompt, negativePrompt, dialogueOrNarration, and productionNote.

User input:
Scene idea: ${input.sceneIdea}
Genre: ${input.genre}
Visual style: ${input.visualStyle}
Tone: ${input.tone}
Estimated duration: ${input.duration}
Number of storyboard panels: ${input.panelCount}
Target format: ${input.targetFormat}

Requirements:
- Create exactly ${input.panelCount} storyboard panels.
- Keep the story simple enough for a ${input.duration} short film.
- Give each panel one clear visual beat.
- Use visual storytelling rather than long dialogue.
- Maintain consistent characters and locations.
- Include subject, setting, composition, lighting, mood, style, and key details in every image prompt.
- Explain framing or camera movement in cameraDirection.
- Make every production note practical for a filmmaker.
- Return valid JSON only.`;
}
