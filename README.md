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

This version uses a deterministic mock generation route and requires no API key.
It intentionally does not include authentication, persistence, uploads, image
generation, or a real LLM provider.

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:e2e
npm run test:all
```

The unit and API suite uses Vitest. The browser workflow and responsive layout
checks use Playwright with Chromium.

## Design documentation

- [Runtime schema validation](docs/schema-validation.md)
- [Storyboard evaluation and scoring](docs/evaluation.md)
