# Concept Art & Storyboard Orchestrator

**CM3070 Final Project — Pall Magnusson**

A web application that turns scene briefs, voice notes, and visual references into
storyboards and concept art for short-film pre-production. The project combines
local and hosted AI models with structured output validation and model evaluation.

## Features

- Generate scene ideas, shot lists, storyboards, and production notes.
- Transcribe English voice notes and analyse uploaded visual references.
- Generate and refine panel images, reuse references, and restore previous images.
- Automatically save generated work in the browser and recover it after reload.
- Export an A4 production PDF; inspect generated JSON and completeness scores.

Built with **Next.js, React, TypeScript, Tailwind CSS, Zod, and jsPDF**.
Provider calls and credentials stay on the server.

## Quick start

Requires **Node.js 24+** and npm. From a fresh checkout:

```bash
npm ci
cp .env.example .env
LLM_PROVIDER= STORYBOARD_PROVIDER=mock IMAGE_PROVIDER=mock npm run dev
```

Open [localhost:3000](http://localhost:3000). This runs deterministic storyboard
and image demos without model services. Voice transcription requires the local
setup below. The empty `LLM_PROVIDER` allows the mock setting to take precedence.

## AI providers

Edit `.env`, then start or restart the app with `npm run dev`.

| Function | Provider | Configuration |
| --- | --- | --- |
| Storyboards and visual analysis | Local Ollama | `LLM_PROVIDER=ollama`, `OLLAMA_MODEL=gemma4:e4b` |
| Storyboards and visual analysis | Vercel AI Gateway | `LLM_PROVIDER=vercel`, `AI_GATEWAY_MODEL=google/gemma-4-26b-a4b-it`, `AI_GATEWAY_API_KEY` |
| Panel images | FLUX.2 Klein 4B on Replicate | `IMAGE_PROVIDER=replicate`, `REPLICATE_API_TOKEN` |
| Voice transcription | Local Whisper Large-v3-Turbo via MLX | `ASR_PROVIDER=local`, `ASR_PYTHON=.venv-asr/bin/python` |

For Ollama, run `ollama pull gemma4:e4b` and ensure `ollama serve` is running.
Images use mock output until Replicate is configured. Hosted services require
accounts and may incur charges. Keep credentials in the ignored environment file.

Voice transcription runs locally on Apple Silicon using MLX Whisper. Install FFmpeg
and use Python 3.11 or 3.12, then run:

```bash
python3.11 -m venv .venv-asr
.venv-asr/bin/python -m pip install -r scripts/requirements-asr.txt
HF_HOME="$PWD/.cache/whisper" .venv-asr/bin/python -c 'from huggingface_hub import snapshot_download; snapshot_download("mlx-community/whisper-large-v3-turbo")'
```

Set `ASR_PROVIDER=local`. The worker uses the downloaded model offline; audio
is processed on the local machine.

## Checks and evaluation

```bash
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Vitest covers unit and API behaviour; Playwright covers browser workflows.
To benchmark installed Ollama models or compare application backends:

```bash
npm run eval:doctor
npm run eval:smoke
npm run evaluate -- --provider ollama
npm run evaluate -- --provider vercel
```

Review model names and machine-specific paths in `evaluation/configs/` first.
Results are written to `evaluation/results/`.
