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

This version supports local Ollama with `gemma4:e4b` and Vercel AI Gateway with
`google/gemma-4-26b-a4b-it`. See [LLM Backends](#llm-backends) for configuration.
A deterministic mock provider remains available for development.

Panel images use a deterministic local mock by default. Hosted rendering uses the
low-cost, locally runnable **FLUX.2 Klein 4B** with approved visual references.
Projects, embedded images, approvals and alternatives can be saved in this browser
and exported as portable JSON. Authentication and multi-user storage remain outside
this prototype.

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
REPLICATE_MODEL=black-forest-labs/flux-2-klein-4b
IMAGE_GENERATION_TIMEOUT_MS=120000
IMAGE_MAX_REQUEST_BYTES=32000000
```

Restart the development server after changing `.env.local`. Provider calls run
only from `POST /api/generate-panel-image`; the token is never sent to the
browser.

Generate a storyboard → approve the visual bible → generate/upload and approve a
reference frame → optionally approve character/location references → generate
missing panels → review, edit and lock frames → save/export. Ordinary batches skip
completed or locked images; selected regeneration preserves image history. Use
**Browse saved projects** to reopen after a reload, or import exported JSON.

Klein supports up to five relevant reference images. The app fixes 0.5 MP output,
shrinks reference inputs, and paces hosted batches. Published model pricing starts
around $0.014; host/input pricing varies. No expensive or cloud-only image-model
fallback is used. [Model choice, local execution and limitations](docs/reference-image-workflow.md).

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

The repository includes a separate local-first model evaluation CLI. Run these
commands from the repository root with Ollama running.

### Environment checks

```bash
# Check the default Stage 1 LLM configuration
npm run eval:doctor

# Check a specific LLM configuration
npm run eval -- doctor evaluation/configs/stage1/llm.json

# Check VLM models, capabilities, dataset, and reference images
npm run eval -- doctor evaluation/configs/stage1/vlm.json
```

### Run evaluations

```bash
# One-model, one-scene LLM smoke evaluation
npm run eval:smoke

# Full Stage 1 LLM evaluation
npm run eval -- run evaluation/configs/stage1/llm.json

# Full Stage 1 VLM evaluation
npm run eval -- run evaluation/configs/stage1/vlm.json

# Evaluate a subset by model ID (flags may be repeated or comma-separated)
npm run eval -- run evaluation/configs/stage1/llm.json \
  --include-model gemma4-e4b,gpt-oss-20b

# Evaluate all configured models except selected IDs
npm run eval -- run evaluation/configs/stage1/llm.json \
  --exclude-model qwen3-06b --exclude-model phi4-mini
```

### Resume, rerun, and report

```bash
# Resume an interrupted LLM run in its existing directory
npm run eval -- run evaluation/configs/stage1/llm.json \
  --resume evaluation/results/<run-directory>

# Resume an interrupted VLM run in its existing directory
npm run eval -- run evaluation/configs/stage1/vlm.json \
  --resume evaluation/results/<run-directory>

# Bypass cached inference for a new or resumed run
npm run eval -- run <config.json> --force
npm run eval -- run <config.json> --resume <run-directory> --force

# Rebuild reports from an existing run without inference
npm run eval -- report evaluation/results/<run-directory>

# Print the CLI usage summary
npm run eval --
```

See the [evaluator quick start](evaluation/README.md) for candidate downloads,
VLM image requirements, resume behavior, configuration rules, and result files.

The unit and API suite uses Vitest. The browser workflow and responsive layout
checks use Playwright with Chromium.

## Design documentation

- [Runtime schema validation](docs/schema-validation.md)
- [Storyboard evaluation and scoring](docs/evaluation.md)
- [Model evaluation tool, local/cloud policy, and download plan](docs/model-evaluation-tool.md)
- [Image-generation architecture and limitations](docs/image-generation.md)

## LLM Backends

Storyboard generation and reference-image analysis share an LLM provider. Prompts,
Zod schemas, sequence validation, and downstream image generation remain shared.
Set these values in `.env`, then restart the application:

```dotenv
# Local (default)
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e4b
LLM_TIMEOUT_MS=120000
```

Run `ollama pull gemma4:e4b`, start `ollama serve`, then `npm run dev`.
For cloud mode:

```dotenv
LLM_PROVIDER=vercel
AI_GATEWAY_MODEL=google/gemma-4-26b-a4b-it
AI_GATEWAY_API_KEY=your-private-key
LLM_TIMEOUT_MS=120000
```

Run `npm run dev`. Keep keys in the ignored `.env` file or deployment secrets.
Configuration is validated at server startup. `LLM_PROVIDER` overrides the legacy
`STORYBOARD_PROVIDER` setting and disables mock fallback. There is no automatic
local/cloud fallback. Legacy explicit `STORYBOARD_PROVIDER=mock` remains available
when `LLM_PROVIDER` is unset. `LLM_TIMEOUT_MS` overrides `OLLAMA_TIMEOUT_MS`.
Local streaming retains its inactivity timeout, resetting on arriving chunks;
cloud calls use a total request timeout and currently return a completed response.
Both support caller cancellation. Image analysis requires vision support from the
selected model; unsupported requests surface as failures.

The cloud adapter follows Vercel's [OpenAI-compatible REST API](https://vercel.com/docs/ai-gateway/openai-compat/rest-api)
and [structured outputs API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/structured-outputs).
Model IDs and the gateway base URL are configurable; model availability depends on
your local installation or gateway account.

Each invocation emits a `llm_run` JSON record to server logs with timestamp,
operation, provider, model, wall-clock duration, available token counts, success,
and sanitized error code. Logs exclude prompts, generated text, and credentials.
Structured validation failures count as failed invocations. Cloud cost estimates
require both `AI_GATEWAY_INPUT_PER_MILLION` and `AI_GATEWAY_OUTPUT_PER_MILLION`
(current USD prices) and both token counts. Otherwise cost remains unknown.
No prices are guessed. Local streams capture time to first token and, when Ollama
returns its token evaluation duration, generation tokens per second. Time to first
token is not reported for buffered responses.

Compare the two deployment/model configurations using Node.js 24+:

```bash
npm run evaluate -- --provider ollama
npm run evaluate -- --provider vercel
```

The runner loads `.env`, runs the same fixed storyboard inputs in
`evaluation/cases/`, and exports timestamped JSON to
`evaluation/results/comparison/`. Set `OLLAMA_MODEL=gemma4:e4b` when using an older
`.env` that still selects another local model. The runner uses the application's
prompt and validation, records failures without fallback, saves after each case,
and exits nonzero if any case fails. Results include input snapshots, outputs,
latency, token usage, and configured cost estimates. Outputs are intentionally
included for manual assessment; result files are ignored by Git.

Report structured-output success rate, latency, reliability, and cost alongside
manual scores for instruction following, completeness, shot plans, and image
prompts. Record local hardware/resource measurements separately. **Deployment
environment and model scale both differ**, so these tests do not isolate
cloud-versus-local performance. The existing Ollama stage-one benchmark (`npm run
eval`) remains a separate local-model benchmarking tool.

Optional live-service checks (excluded from ordinary CI):

```bash
npm run test:llm:ollama
npm run test:llm:vercel
```

`npm test` runs mocked tests for both providers, including the existing storyboard
schema, normalization, invalid output, HTTP errors, network failure, cancellation,
timeouts, and metrics.

### Shared visual bible

After storyboard generation, review and edit the shared visual bible, then select
**Approve visual direction** to enable individual and batch image generation.
The app creates version 1 from the storyboard descriptions and preserves the
selected style and reference summary. Medium, palette, linework, texture,
rendering, lighting rules, and stable character/location definitions are editable.
Unspecified details start with consistency instructions and can be refined during
review; they are not a second model-generated character design.

Saving edits creates a new unapproved version and marks existing images as needing
review without deleting them. Rendering records the approved bible version and
exact prompts. Bible editing and new storyboard generation are disabled during
image generation, including between batch requests. The image API requires an
approved bible. Older storyboard packages can still pass the package schema, but
cannot render images without one.

Rendering now uses structured action, framing, visible character/location IDs,
and visible props with the approved bible. Free-form draft prompts cannot override
the shared style. Explicit event changes replace a character's appearance and,
where supplied, clothing/accessories for that shot; active changes must be repeated
in subsequent shots. Exact rendered prompts remain in the raw JSON.

This is a text-based continuity workflow. Visual reference conditioning, durable
storage, and image approval remain in APP_TODOS.md.
Shared prompts do not guarantee visual consistency in generated images.

## English voice notes

Click **Record scene idea** to record, stop and review in a modal. Saved voice-note
uploads are available inside the modal. Set `ASR_PROVIDER=local` (default) or
`ASR_PROVIDER=groq` in `.env` and restart the server to choose the transcription backend.
See [transcription setup and limitations](docs/transcription.md) for the local
Python/model installation and server-side `GROQ_API_KEY` configuration.
