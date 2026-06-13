export const REFERENCE_PURPOSES = [
  "Mood",
  "Character",
  "Location",
  "Composition",
  "Sketch",
] as const;

export const MAX_REFERENCE_IMAGES = 4;
export const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_REFERENCE_REQUEST_BYTES =
  MAX_REFERENCE_IMAGES * MAX_REFERENCE_IMAGE_BYTES + 1024 * 1024;
export const ACCEPTED_REFERENCE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
