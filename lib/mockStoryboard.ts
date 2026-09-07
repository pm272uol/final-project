import type {
  ShotType,
  StoryboardInput,
  StoryboardPackage,
  StoryboardPanel,
} from "@/types/storyboard";

type SceneProfile = {
  idea: string;
  subject: string;
  subjectName: string;
  keyVisual: string;
  setting: string;
};

const STORY_VERBS =
  /\b(?:discovers?|finds?|encounters?|notices?|sees?|hears?|reveals?|protects?|chases?|meets?|loses?|opens?|watches?|follows?|receives?|uncovers?)\b/i;

const SETTING_PATTERN =
  /\b(?:inside|within|aboard|beneath|under|outside|at|on|in)\s+(.+?)(?:[.!?]|$)/i;

const SHOT_TYPES: ShotType[] = [
  "establishing shot",
  "wide shot",
  "medium shot",
  "close-up",
  "over-the-shoulder",
  "tracking shot",
  "point-of-view shot",
  "extreme close-up",
  "wide shot",
  "establishing shot",
];

const CAMERA_DIRECTIONS = [
  "Begin with a locked wide composition that establishes the subject and the physical geography.",
  "Move to a measured wide frame, holding negative space in the direction of the first clue.",
  "Push closer at eye level so the central visual becomes unmistakable without losing environmental context.",
  "Use a controlled handheld adjustment as the subject commits to investigating the discovery.",
  "Frame over the subject's shoulder to connect their decision with the central visual.",
  "Track laterally with the action, keeping foreground details available for depth and continuity.",
  "Shift into the subject's point of view so the audience reads the crucial detail at the same moment.",
  "Use an extreme close-up on the smallest physical change that signals the emotional turn.",
  "Return to a balanced wide profile that shows the new relationship between subject and environment.",
  "Pull back slowly into a final establishing composition and let the resolved image hold.",
];

const BEAT_TEMPLATES = [
  (profile: SceneProfile) =>
    `${profile.subjectName} enters the scene before the unusual detail is understood.`,
  (profile: SceneProfile) =>
    `A small clue draws ${profile.subjectName}'s attention away from the expected routine.`,
  (profile: SceneProfile) =>
    `${profile.keyVisual} is revealed clearly for the first time.`,
  (profile: SceneProfile) =>
    `${profile.subjectName} moves closer and tests whether the discovery is real.`,
  (profile: SceneProfile) =>
    `A complication forces ${profile.subjectName} to make an immediate choice.`,
  (profile: SceneProfile) =>
    `${profile.subjectName} acts on that choice and changes the physical arrangement of the scene.`,
  (profile: SceneProfile) =>
    `A new detail in ${profile.keyVisual} changes the meaning of the discovery.`,
  (profile: SceneProfile) =>
    `${profile.subjectName}'s reaction reveals the emotional cost of the moment.`,
  (profile: SceneProfile) =>
    `The scene settles around a changed relationship between ${profile.subjectName} and ${profile.keyVisual}.`,
  (profile: SceneProfile) =>
    `The final image leaves ${profile.setting} familiar but emotionally transformed.`,
];

export function createMockStoryboard(input: StoryboardInput): StoryboardPackage {
  const profile = deriveSceneProfile(input.sceneIdea);
  const storyboard = Array.from(
    { length: input.panelCount },
    (_, index) => createPanel(profile, input, index),
  );

  return {
    title: createTitle(profile.keyVisual),
    logline: `${sentenceCase(profile.idea)} The encounter becomes a ${input.tone.toLowerCase()} visual turning point for ${profile.subjectName}.`,
    genre: input.genre,
    tone: input.tone,
    visualStyle: input.visualStyle,
    estimatedDuration: input.duration,
    characters: [
      {
        name: profile.subjectName,
        role: "protagonist",
        visualDescription: `${sentenceCase(profile.subject)}, presented with one repeatable silhouette, a practical costume, and a distinctive prop or texture drawn from the scene brief.`,
        personality: `Observant and active, with performance choices shaped by the ${input.tone.toLowerCase()} tone.`,
      },
    ],
    locations: [
      {
        name: titleCase(profile.setting),
        description: `${sentenceCase(profile.setting)}, designed around a few repeatable visual anchors that can remain consistent across every shot.`,
        mood: `${input.tone}, expressed through controlled lighting, negative space, and environmental sound.`,
      },
    ],
    storyboard,
    continuityNotes: [
      `Keep ${profile.subjectName}'s costume, silhouette, and key prop consistent in every panel.`,
      `Preserve the scale, position, and defining details of ${profile.keyVisual} throughout the sequence.`,
      `Use one controlled lighting progression to support the ${input.tone.toLowerCase()} emotional turn.`,
      `Maintain a visual rhythm suitable for ${input.duration} and exactly ${input.panelCount} panels.`,
    ],
    productionNotes: [
      `Prioritise ${profile.keyVisual} as the central visual motif rather than relying on exposition.`,
      `Block the action around a small number of practical positions within ${profile.setting}.`,
      "Keep dialogue minimal and let framing, performance, sound, and physical detail carry the story.",
      `Prepare the final material primarily as ${input.targetFormat.toLowerCase()}.`,
    ],
  };
}

export function deriveSceneProfile(sceneIdea: string): SceneProfile {
  const idea = sceneIdea.trim().replace(/\s+/g, " ");
  const verbMatch = STORY_VERBS.exec(idea);
  const rawSubject = verbMatch
    ? idea.slice(0, verbMatch.index)
    : idea.split(/[,.;]/, 1)[0];
  const subject = cleanPhrase(rawSubject) || "central character";
  const afterVerb = verbMatch
    ? idea.slice(verbMatch.index + verbMatch[0].length)
    : idea;
  const keyVisual =
    cleanPhrase(
      afterVerb.split(
        /\b(?:growing|hidden|waiting|lying|standing|moving|appearing|inside|within|aboard|beneath|under|outside|at|on|in)\b/i,
        1,
      )[0],
    ) || "unexpected discovery";
  const settingMatch = SETTING_PATTERN.exec(idea);
  const setting =
    cleanPhrase(settingMatch?.[1] ?? "") || "the scene's primary location";

  return {
    idea,
    subject,
    subjectName: titleCase(lastMeaningfulWords(subject, 2)),
    keyVisual,
    setting,
  };
}

function createPanel(
  profile: SceneProfile,
  input: StoryboardInput,
  index: number,
): StoryboardPanel {
  const panelNumber = index + 1;
  const storyBeat = BEAT_TEMPLATES[index](profile);
  const isFinal = panelNumber === input.panelCount;
  const action = createAction(profile, index, isFinal);

  return {
    panelNumber,
    characterIds: ["character-1"],
    locationIds: ["location-1"],
    visibleProps: [profile.keyVisual],
    storyBeat,
    shotType: SHOT_TYPES[index],
    cameraDirection: CAMERA_DIRECTIONS[index],
    action,
    setting: titleCase(profile.setting),
    imagePrompt: `${input.visualStyle} storyboard frame for a ${input.genre.toLowerCase()} short film: ${storyBeat} Show ${profile.subject} in ${profile.setting}, with ${profile.keyVisual} as the visual focus. ${SHOT_TYPES[index]} composition, motivated practical lighting, ${input.tone.toLowerCase()} atmosphere, consistent costume and production design, cinematic depth, clear subject separation, filmable physical detail.${
      input.visualReferenceSummary
        ? ` Combined visual direction: ${input.visualReferenceSummary}`
        : ""
    }`,
    negativePrompt:
      "Avoid extra characters, inconsistent costume or props, unreadable staging, text overlays, distorted anatomy, uncontrolled visual clutter, and lighting that contradicts the selected tone.",
    dialogueOrNarration:
      index === 2
        ? `${profile.subjectName}, quietly: "What is that?"`
        : "No required dialogue. Use performance, room tone, and one motivated sound cue.",
    productionNote: createProductionNote(index, isFinal),
  };
}

function createAction(
  profile: SceneProfile,
  index: number,
  isFinal: boolean,
): string {
  if (isFinal) {
    return `${profile.subjectName} holds still with ${profile.keyVisual} in the final composition as the scene resolves.`;
  }

  const actions = [
    `${profile.subjectName} crosses ${profile.setting}, following an ordinary routine before anything changes.`,
    `${profile.subjectName} stops, turns, and isolates the first clue with their gaze or a practical light source.`,
    `${profile.subjectName} approaches ${profile.keyVisual} and studies one defining physical detail.`,
    `${profile.subjectName} reaches toward ${profile.keyVisual}, then hesitates when the environment responds.`,
    `${profile.subjectName} protects, retrieves, or repositions ${profile.keyVisual} as pressure enters the scene.`,
    `${profile.subjectName} carries the decision through with one clear, filmable movement.`,
    `${profile.subjectName} notices a subtle change in ${profile.keyVisual} that reframes the encounter.`,
    `${profile.subjectName} absorbs the discovery, allowing a restrained reaction to register.`,
    `${profile.subjectName} settles into a new position that visually connects them with ${profile.keyVisual}.`,
  ];

  return actions[index];
}

function createProductionNote(index: number, isFinal: boolean): string {
  if (isFinal) {
    return "Hold the final composition long enough to communicate resolution without adding explanatory dialogue.";
  }

  const notes = [
    "Establish geography, scale, and the protagonist's baseline in one economical setup.",
    "Introduce the visual question while keeping the source partially concealed.",
    "Make the central discovery legible and give it a repeatable visual identity.",
    "Convert observation into physical action and create a clear edit point.",
    "Use the complication to reveal character through a practical decision.",
    "Carry momentum with a simple movement that can be matched across coverage.",
    "Reserve the most informative detail for this beat so the sequence continues to develop.",
    "Prioritise performance and sound design over dialogue for the emotional payoff.",
    "Re-establish the wider space to show how the discovery has changed its meaning.",
  ];

  return notes[index];
}

function createTitle(keyVisual: string): string {
  const words = cleanPhrase(keyVisual).split(" ").slice(0, 5).join(" ");
  return `The ${titleCase(words || "Unexpected Discovery")}`;
}

function cleanPhrase(value: string): string {
  return value
    .trim()
    .replace(/^[,;:\s]+|[,;:\s.!?]+$/g, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ");
}

function lastMeaningfulWords(value: string, count: number): string {
  const words = value.split(" ").filter(Boolean);
  return words.slice(-count).join(" ") || "Central Character";
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sentenceCase(value: string): string {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`.replace(
    /[.!?]*$/,
    ".",
  );
}
