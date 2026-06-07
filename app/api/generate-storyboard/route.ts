import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";
import { createGenerateStoryboardResponse } from "@/lib/generateStoryboard";

export async function POST(request: Request) {
  const config = getAppConfig();
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (contentLength > config.maxRequestBytes) {
    return NextResponse.json(
      {
        error: `Request body exceeds the ${config.maxRequestBytes}-byte limit.`,
        code: "REQUEST_TOO_LARGE",
      },
      { status: 413 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "The request body is not valid JSON. Check the request and try again.",
      },
      { status: 400 },
    );
  }

  if (JSON.stringify(body).length > config.maxRequestBytes) {
    return NextResponse.json(
      {
        error: `Request body exceeds the ${config.maxRequestBytes}-byte limit.`,
        code: "REQUEST_TOO_LARGE",
      },
      { status: 413 },
    );
  }

  return createGenerateStoryboardResponse(body, {
    config,
    signal: request.signal,
  });
}
