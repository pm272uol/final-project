# Concept Art & Storyboard Orchestrator

A Next.js prototype for short-film creators with local and hosted AI backends. Enter a rough scene idea
and creative constraints to generate a structured storyboard package with shot
direction, concept-art prompts, continuity notes, production guidance, rendered
panel images, raw JSON, and a rule-based completeness evaluation.

## Current technical choices

These choices describe the current implementation; configured models are not a
claim that final comparative model selection or human evaluation is complete.

| Area | Choice and purpose |
| --- | --- |
| Application | Next.js 15.5.19 App Router, React 19, TypeScript, and Tailwind CSS 3. A single-page editing workspace calls server-side route handlers for inference. |
| Text and vision | One shared provider/model configuration: local Ollama with `gemma4:e4b`, or Vercel AI Gateway with `google/gemma-4-26b-a4b-it`. Storyboard generation and reference-image analysis use the same adapter interface and server-side HTTP calls. |
| Structured output | Zod 4 validates inputs, model JSON, and saved packages. Storyboard generation checks panel count and sequence and allows one correction attempt with the same model before returning invalid-output errors. |
| Panel rendering | Deterministic mock images by default; hosted FLUX.2 Klein 4B on Replicate for reference-conditioned rendering. Sharp resizes reference inputs and processes image assets on the server. |
| Voice notes | Whisper Large-v3-Turbo: local `mlx-whisper` through a Python worker on Apple Silicon, or hosted Groq transcription. English, completed-recording transcription with editable results. |
| Workspace | Storyboards and generated images live in the current page session. Project storage and autosave controls are not part of the workspace. No application database or account service is required. |
| Export | A4 production PDFs using lazy-loaded jsPDF, available below the generated storyboard. |
| Verification | Vitest for unit/API tests, Playwright with Chromium for browser workflows, ESLint, and TypeScript. Separate CLIs cover local model benchmarks and application-level local/hosted comparisons. |

The pipeline combines a scene brief and optional voice transcript, generates and
validates storyboard JSON, and builds shared visual direction. The first successful
render automatically becomes the reference for later images. Provider credentials
and inference calls stay on the server; the workspace and PDF export run in the browser.

## Run locally

Use Node.js 24+ and npm for the application and evaluation commands. For local
text/vision inference, install Ollama and download the configured model:

```bash
npm install
ollama pull gemma4:e4b
```

For a fresh checkout, copy `.env.example` to `.env` (preserve any existing local
configuration). The example selects local Ollama, mock panel images, and local
transcription. Start Ollama with `ollama serve` if it is not already running, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To exercise storyboard and image workflows without model services, use:

```bash
LLM_PROVIDER= STORYBOARD_PROVIDER=mock IMAGE_PROVIDER=mock npm run dev
```

The empty `LLM_PROVIDER` lets the explicit mock setting take precedence over a
value in an environment file. Voice transcription still requires the separate
[local Python/FFmpeg setup or Groq configuration](docs/transcription.md).

## Prototype boundaries

This version supports local Ollama with `gemma4:e4b` and Vercel AI Gateway with
`google/gemma-4-26b-a4b-it`. See [LLM Backends](#llm-backends) for configuration.
A deterministic mock provider remains available for development.

Panel images use a deterministic local mock by default. Hosted rendering uses
**FLUX.2 Klein 4B** with the generated visual style and the first rendered image as a reference. A local
image-inference backend is not integrated or validated on the target Mac; the
selected model has downloadable weights for separate local execution.
Export the generated storyboard as a production PDF. The workspace no longer
offers named project saves, autosave, or file import/export menus. Authentication
and multi-user storage remain outside this prototype.

Local voice transcription needs a Node server on Apple Silicon with Python,
FFmpeg, and a pre-downloaded MLX model. That path cannot run as a portable
serverless function. Selecting Vercel AI Gateway changes the inference backend;
it does not deploy the application to Vercel.

The in-app evaluator checks package completeness with an 85% pass threshold.
It does not establish creative quality, visual consistency, or production usefulness;
those require human assessment and separate experiments.

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

Generate a storyboard → **Generate images** → **Export production PDF**. The first rendered
frame automatically guides the remaining shots. Rendering uses the current saved
visual style without separate approval steps. Completed and locked images are
preserved; use **Regenerate** on a shot to create an alternative.

The storyboard appears first, followed by always-visible story and production
notes. Scene settings stay visible on the left. There are no reference uploads,
editing panels, playback, version comparison, continuity checklists, or generation
estimate controls. Technical output remains optional, and PDF export appears at
the bottom only after a storyboard has been generated.

The hosted adapter sends up to five relevant references, resized to at most 704
pixels per side, and requests one 16:9 PNG at 0.5 MP with fast execution. Batches
run sequentially with at least 12 seconds between hosted request starts. Exclusions
are appended to the prompt because this adapter has no separate negative-prompt
channel. Provider outputs are fetched and embedded before returning to the browser.

The application fixes hosted rendering to Klein even if a legacy `REPLICATE_MODEL`
value names another model. There is no automatic image-model fallback. Cost
estimates require `IMAGE_ESTIMATE_USD_PER_IMAGE` and `IMAGE_ESTIMATE_PRICE_BASIS`;
otherwise hosted cost remains unknown. See [model choice, local execution and
limitations](docs/reference-image-workflow.md) for the recorded selection evidence.

## Storyboard workflow

Describe the scene, choose the scene settings, and generate a storyboard. Generate
all missing images or render individual shots. The first successfully generated
image guides subsequent shots, even if you render a shot out of order. Regenerating
that shot retains the original reference; generating a new storyboard starts fresh.
Story and production notes are always visible, and the completed board can be
exported as an A4 production PDF. Reloading clears the current workspace.

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

Stage 1 configurations include a machine-specific `modelStore` path; review it
before running them on another machine. The current `stage1/vlm.json` also has a
missing comma between its final two model entries and must be corrected before
the VLM doctor or run commands can parse it.

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
- [Reference-conditioning model choice and recorded evidence](docs/reference-image-workflow.md)
- [Voice transcription setup and deployment constraints](docs/transcription.md)
- [Creative tools, persistence, exports, and estimate methodology](docs/additional-features.md)

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

The app creates shared visual direction from the storyboard descriptions and scene
settings. Rendering records the current visual bible version automatically. There
are no visual bible editors or approval steps in the workspace. The API continues
to validate the rendering context and automatic reference image.

Rendering now uses structured action, framing, visible character/location IDs,
and visible props with the approved bible. Free-form draft prompts cannot override
the shared style. Explicit event changes replace a character's appearance and,
where supplied, clothing/accessories for that shot; active changes must be repeated
in subsequent shots. Exact rendered prompts remain in the raw JSON.

This is a text-based continuity workflow with visual reference conditioning,
automatic first-frame references, and PDF export.
Shared prompts do not guarantee visual consistency in generated images.

## English voice notes

Click **Record scene idea** to record, stop and review in a modal. Saved voice-note
uploads are available inside the modal. Set `ASR_PROVIDER=local` (default) or
`ASR_PROVIDER=groq` in `.env` and restart the server to choose the transcription backend.
See [transcription setup and limitations](docs/transcription.md) for the local
Python/model installation and server-side `GROQ_API_KEY` configuration.
