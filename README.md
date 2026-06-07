# Framewright: Storyboard Orchestrator

A mock-first Next.js prototype for short-film creators. Enter a rough scene idea
and creative constraints to generate a structured storyboard package with shot
direction, concept-art prompts, continuity notes, production guidance, raw JSON,
and a rule-based quality evaluation.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Prototype boundaries

This version uses local Ollama with `gemma4:latest` by default and requires no
hosted API key. A deterministic mock provider remains available for development
and fallback. It intentionally does not include authentication, persistence,
uploads, or image generation.

See [docs/ollama-integration.md](docs/ollama-integration.md) for configuration,
fallback behavior, and integration-test instructions.

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

The unit and API suite uses Vitest. The browser workflow and responsive layout
checks use Playwright with Chromium.

## Design documentation

- [Runtime schema validation](docs/schema-validation.md)
- [Storyboard evaluation and scoring](docs/evaluation.md)
