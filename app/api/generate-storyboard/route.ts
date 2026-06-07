import { NextResponse } from "next/server";
import { createGenerateStoryboardResponse } from "@/lib/generateStoryboard";

export async function POST(request: Request) {
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

  return createGenerateStoryboardResponse(body);
}
