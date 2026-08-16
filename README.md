# Framewright: Storyboard Orchestrator

A mock-first Next.js prototype for short-film creators. Enter a rough scene idea
and creative constraints to generate a structured storyboard package with shot
direction, concept-art prompts, continuity notes, production guidance, rendered
panel images, raw JSON, and a rule-based quality evaluation.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Prototype boundaries

This version uses local Ollama with `gemma4:latest` by default for storyboard
generation. A deterministic mock provider remains available for development and
fallback.

Panel image generation is mock-first and uses deterministic local SVG renders by
default. A server-side Replicate adapter for `stability-ai/sdxl` is included,
but authentication, persistence, and durable image storage remain outside the
prototype. Replicate API output URLs expire after one hour by default.

See [docs/ollama-integration.md](docs/ollama-integration.md) for configuration,
fallback behavior, and integration-test instructions.

## Image generation

The default configuration requires no external image service:

```env
IMAGE_PROVIDER=mock
```

To use Replicate, create an API token and add these values to `.env.local`:

```env
IMAGE_PROVIDER=replicate
REPLICATE_API_TOKEN=r8_your_token_here
REPLICATE_MODEL=stability-ai/sdxl
IMAGE_GENERATION_TIMEOUT_MS=120000
IMAGE_MAX_REQUEST_BYTES=65536
```

Restart the development server after changing `.env.local`. Provider calls run
only from `POST /api/generate-panel-image`; the token is never sent to the
browser.

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run test:ollama
npm run test:all
```

## Model evaluation tool

The repository includes a separate local-first model evaluation CLI:

```bash
npm run eval:doctor
npm run eval:smoke
npm run eval -- run evaluation/configs/stage1/llm.json
```

See the [evaluator quick start](evaluation/README.md) for candidate downloads,
configuration rules, and result files.

The unit and API suite uses Vitest. The browser workflow and responsive layout
checks use Playwright with Chromium.

## Design documentation

- [Runtime schema validation](docs/schema-validation.md)
- [Storyboard evaluation and scoring](docs/evaluation.md)
- [Model evaluation tool, local/cloud policy, and download plan](docs/model-evaluation-tool.md)
- [Image-generation architecture and limitations](docs/image-generation.md)
