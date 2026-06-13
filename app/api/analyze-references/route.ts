import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";
import {
  ACCEPTED_REFERENCE_TYPES,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGES,
  MAX_REFERENCE_REQUEST_BYTES,
  REFERENCE_PURPOSES,
} from "@/lib/referenceImageOptions";
import {
  analyzeReferenceImages,
  type ReferenceImageInput,
} from "@/lib/referenceImages";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REFERENCE_REQUEST_BYTES) {
    return errorResponse(
      `Reference upload exceeds the ${formatMegabytes(
        MAX_REFERENCE_REQUEST_BYTES,
      )} MB request limit.`,
      "REFERENCE_REQUEST_TOO_LARGE",
      413,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      "The reference upload could not be read.",
      "INVALID_REFERENCE_UPLOAD",
      400,
    );
  }

  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File);
  const purposes = formData
    .getAll("purposes")
    .filter((value): value is string => typeof value === "string");
  const instructions = String(formData.get("instructions") ?? "").trim();

  if (files.length < 1 || files.length > MAX_REFERENCE_IMAGES) {
    return errorResponse(
      `Choose between 1 and ${MAX_REFERENCE_IMAGES} reference images.`,
      "INVALID_REFERENCE_COUNT",
      400,
    );
  }

  if (instructions.length > 500) {
    return errorResponse(
      "Reference instructions must be 500 characters or fewer.",
      "INVALID_REFERENCE_INSTRUCTIONS",
      400,
    );
  }

  const images: ReferenceImageInput[] = [];
  for (const [index, file] of files.entries()) {
    if (
      !ACCEPTED_REFERENCE_TYPES.includes(
        file.type as (typeof ACCEPTED_REFERENCE_TYPES)[number],
      )
    ) {
      return errorResponse(
        "References must be JPEG, PNG, or WebP images.",
        "INVALID_REFERENCE_TYPE",
        415,
      );
    }

    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      return errorResponse(
        `Each reference must be ${formatMegabytes(
          MAX_REFERENCE_IMAGE_BYTES,
        )} MB or smaller.`,
        "REFERENCE_IMAGE_TOO_LARGE",
        413,
      );
    }

    const purpose = purposes[index] ?? "Mood";
    if (
      !REFERENCE_PURPOSES.includes(
        purpose as (typeof REFERENCE_PURPOSES)[number],
      )
    ) {
      return errorResponse(
        "A reference purpose was not recognized.",
        "INVALID_REFERENCE_PURPOSE",
        400,
      );
    }

    images.push({
      bytes: new Uint8Array(await file.arrayBuffer()),
      purpose: purpose as (typeof REFERENCE_PURPOSES)[number],
    });
  }

  try {
    const summary = await analyzeReferenceImages(
      images,
      instructions,
      getAppConfig(),
      { signal: request.signal },
    );
    return NextResponse.json({ summary });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "The local visual analysis failed.",
      "REFERENCE_ANALYSIS_FAILED",
      502,
    );
  }
}

function errorResponse(
  error: string,
  code: string,
  status: number,
) {
  return NextResponse.json({ error, code }, { status });
}

function formatMegabytes(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}
