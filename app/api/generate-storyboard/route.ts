import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";
import { createGenerateStoryboardResponse } from "@/lib/generateStoryboard";
import type {
  StoryboardGenerationResponse,
  StoryboardGenerationStreamEvent,
} from "@/types/storyboard";

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

  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    return createStreamingResponse(body, config, request.signal);
  }

  return createGenerateStoryboardResponse(body, { config, signal: request.signal });
}

function createStreamingResponse(
  body: unknown,
  config: ReturnType<typeof getAppConfig>,
  requestSignal: AbortSignal,
) {
  const encoder = new TextEncoder();
  const generationController = new AbortController();
  const signal = AbortSignal.any([
    requestSignal,
    generationController.signal,
  ]);
  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: StoryboardGenerationStreamEvent) => {
        if (streamClosed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          send({
            type: "status",
            message: "Preparing the storyboard prompt...",
          });
          const response = await createGenerateStoryboardResponse(body, {
            config,
            signal,
            onProgress: send,
          });
          const payload = await response.json();

          if (response.ok) {
            send({
              type: "complete",
              data: payload as StoryboardGenerationResponse,
            });
          } else {
            send({
              type: "error",
              ...(payload.diagnostics ? { diagnostics: payload.diagnostics } : {}),
              error:
                typeof payload.error === "string"
                  ? payload.error
                  : "The storyboard could not be generated.",
              code:
                typeof payload.code === "string" ? payload.code : undefined,
              validationIssues: Array.isArray(payload.validationIssues)
                ? payload.validationIssues
                : undefined,
            });
          }
        } catch (error) {
          if (!signal.aborted) {
            send({
              type: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "The storyboard stream failed unexpectedly.",
            });
          }
        } finally {
          if (!streamClosed) {
            streamClosed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      streamClosed = true;
      generationController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
