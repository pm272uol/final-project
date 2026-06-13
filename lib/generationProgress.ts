export type GenerationProgress = {
  title?: string;
  characters: string[];
  locations: string[];
  panelCount: number;
  latestStoryBeat?: string;
};

export function inspectGenerationOutput(output: string): GenerationProgress {
  const charactersSection = getSection(output, "characters", "locations");
  const locationsSection = getSection(output, "locations", "storyboard");
  const storyBeats = extractStringValues(output, "storyBeat");

  return {
    title: extractStringValues(output, "title")[0],
    characters: extractStringValues(charactersSection, "name"),
    locations: extractStringValues(locationsSection, "name"),
    panelCount: countField(output, "panelNumber"),
    latestStoryBeat: storyBeats.at(-1),
  };
}

function getSection(output: string, startKey: string, endKey: string) {
  const start = output.indexOf(`"${startKey}"`);
  if (start === -1) return "";

  const end = output.indexOf(`"${endKey}"`, start);
  return output.slice(start, end === -1 ? undefined : end);
}

function extractStringValues(output: string, key: string) {
  const pattern = new RegExp(
    `"${escapeRegExp(key)}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`,
    "g",
  );
  const values: string[] = [];

  for (const match of output.matchAll(pattern)) {
    try {
      values.push(JSON.parse(match[1]) as string);
    } catch {
      // Ignore an incomplete or malformed value until a later stream chunk.
    }
  }

  return values;
}

function countField(output: string, key: string) {
  return (
    output.match(new RegExp(`"${escapeRegExp(key)}"\\s*:`, "g"))?.length ?? 0
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
