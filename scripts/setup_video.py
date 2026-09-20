"""Install the pinned Apple MLX Wan example and download only the 1.3B assets.

Run with .venv-video/bin/python after installing requirements-video.txt.
All weights and Hugging Face download caches stay under --model-home.
"""
import argparse
import io
import json
import os
from pathlib import Path
import tarfile
import urllib.request

REVISION = "796f5b53cab69a3d48a44233ce21aae889e94a08"
ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-home", required=True, type=Path)
    args = parser.parse_args()
    home = args.model_home.expanduser().resolve()
    # Never silently create a missing mount point on the internal disk.
    if str(home).startswith("/Volumes/") and not Path(*home.parts[:3]).is_mount():
        raise SystemExit("External model drive is not mounted.")
    home.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(home)
    os.environ["HF_HUB_CACHE"] = str(home / "hub")
    os.environ["HF_XET_CACHE"] = str(home / "xet")
    source = ROOT / ".cache" / "wan-mlx"
    source.mkdir(parents=True, exist_ok=True)
    url = f"https://codeload.github.com/ml-explore/mlx-examples/tar.gz/{REVISION}"
    print(f"Installing Apple MLX Wan source at {REVISION}", flush=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        archive = tarfile.open(fileobj=io.BytesIO(response.read()), mode="r:gz")
    prefix = f"mlx-examples-{REVISION}/video/wan2.1/"
    for member in archive.getmembers():
        if not member.isfile():
            continue
        if member.name == f"mlx-examples-{REVISION}/LICENSE":
            relative = Path("LICENSE")
        elif member.name.startswith(prefix):
            relative = Path(member.name[len(prefix):])
        else:
            continue
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Unsafe archive path")
        target = source / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.extractfile(member).read())
    (source / "REVISION").write_text(REVISION + "\n")
    from huggingface_hub import HfApi, snapshot_download
    repo = "Wan-AI/Wan2.1-T2V-1.3B"
    revision = HfApi().model_info(repo).sha
    snapshot = snapshot_download(
        repo, revision=revision, cache_dir=str(home / "hub"), max_workers=3,
        allow_patterns=["diffusion_pytorch_model.safetensors", "Wan2.1_VAE.pth",
                        "models_t5_umt5-xxl-enc-bf16.pth", "google/umt5-xxl/tokenizer.json",
                        "config.json", "LICENSE.txt", "README.md"],
    )
    # Resolve the main branch offline too: the upstream loader requests main.
    refs = home / "hub" / "models--Wan-AI--Wan2.1-T2V-1.3B" / "refs"
    refs.mkdir(parents=True, exist_ok=True)
    (refs / "main").write_text(revision)
    (home / "wan-install.json").write_text(json.dumps({"repo": repo, "revision": revision,
        "sourceRevision": REVISION, "snapshot": snapshot}, indent=2) + "\n")
    print(f"Ready. Set WAN_HF_HOME={home}", flush=True)


if __name__ == "__main__":
    main()
