"""One-shot English Whisper Turbo worker. Audio is never sent to a hosted API."""
import contextlib
import json
import sys

# Keep stdout a machine-readable JSON channel, including during model loading.
with contextlib.redirect_stdout(sys.stderr):
    import mlx_whisper
    result = mlx_whisper.transcribe(
        sys.argv[1],
        path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
        language="en",
        task="transcribe",
        temperature=0.0,
        condition_on_previous_text=False,
        verbose=None,
    )
print(json.dumps({"text": result["text"]}))
