"""Wan 2.1 1.3B on MLX, with a memory-bounded T5 loader for 16 GB Macs.

Uses the pinned Apple example without modifying its files. PyTorch only reads
the original checkpoint; text encoding, denoising and decoding run in MLX.
"""
import argparse
import gc
import json
import os
from pathlib import Path
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("prompt")
    parser.add_argument("--frames", type=int, choices=[17, 33, 49, 65, 81], default=33)
    parser.add_argument("--steps", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--size", default="832x480")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    started = time.monotonic()
    if not 1 <= args.steps <= 50:
        parser.error("--steps must be between 1 and 50")
    try:
        size = tuple(map(int, args.size.split("x")))
        if len(size) != 2 or any(value < 32 or value % 16 for value in size):
            raise ValueError()
    except ValueError:
        parser.error("--size must be WxH with each dimension a multiple of 16")
    root = Path(__file__).resolve().parents[1]
    home = Path(os.environ.get("WAN_HF_HOME", root / ".cache/wan-hf")).resolve()
    source = Path(os.environ.get("WAN_MLX_DIR", root / ".cache/wan-mlx")).resolve()
    # Require a complete installation, never fetch weights during generation.
    installation = json.loads((home / "wan-install.json").read_text())
    os.environ.update(HF_HOME=str(home), HF_HUB_CACHE=str(home / "hub"),
                      HF_XET_CACHE=str(home / "xet"), HF_HUB_OFFLINE="1",
                      HF_HUB_DISABLE_TELEMETRY="1")
    sys.path.insert(0, str(source))
    import mlx.core as mx
    import mlx.nn as nn
    import wan.pipeline as upstream
    from wan.t5 import T5Encoder, create_umt5_xxl_encoder
    from wan.utils import _hf_download, configs, save_video

    mx.set_default_device(mx.gpu)
    # Do not retain large temporary buffers between model-loading stages.
    mx.set_cache_limit(256 * 1024 * 1024)
    cache = home / "wan-mlx-cache" / installation["sourceRevision"] / installation["revision"]
    cache.mkdir(parents=True, exist_ok=True)

    def load_quantized_t5(name):
        converted = cache / "t5-4bit-g64.safetensors"
        if not converted.exists():
            import torch
            print("Preparing 4-bit MLX text encoder on the model drive…", flush=True)
            spec = configs[name]
            # mmap avoids loading the entire 11 GB checkpoint into Python RAM.
            state = torch.load(_hf_download(spec.repo_id, spec.repo_t5),
                               map_location="cpu", weights_only=True, mmap=True)
            weights = {}
            for key in list(state):
                tensor = state.pop(key)
                if tensor.dtype == torch.bfloat16:
                    value = mx.array(tensor.view(torch.uint16).numpy()).view(mx.bfloat16)
                else:
                    value = mx.array(tensor.float().numpy()).astype(mx.bfloat16)
                mapped = T5Encoder.sanitize({key: value})
                for mapped_key, value in mapped.items():
                    if value.ndim == 2 and mapped_key.endswith(".weight"):
                        packed, scales, biases = mx.quantize(value, group_size=64, bits=4)
                        mx.eval(packed, scales, biases)
                        base = mapped_key.removesuffix(".weight")
                        weights.update({base + ".weight": packed, base + ".scales": scales,
                                        base + ".biases": biases})
                    else:
                        mx.eval(value)
                        weights[mapped_key] = value
                del tensor, value, mapped
                mx.clear_cache()
            del state
            gc.collect()
            temporary = cache / "t5-4bit-g64.partial.safetensors"
            mx.save_safetensors(str(temporary), weights)
            temporary.replace(converted)
            del weights
            mx.clear_cache()
        model = create_umt5_xxl_encoder()
        nn.quantize(model, group_size=64, bits=4)
        model.load_weights(str(converted), strict=True)
        mx.eval(model.parameters())
        return model

    original_load_dit = upstream.load_dit

    def load_quantized_dit(name, checkpoint=None):
        model = original_load_dit(name, checkpoint=checkpoint)
        model.set_dtype(mx.bfloat16)
        nn.quantize(model, bits=8)
        mx.eval(model.parameters())
        mx.clear_cache()
        return model

    # Quantize DiT before loading T5 so the full-precision weights are released.
    upstream.load_dit = load_quantized_dit
    # Replace the upstream T5 loader. Its default .pth loader expands every
    # tensor to float32 at once, exceeding the available RAM on a 16 GB Mac.
    upstream.load_t5 = load_quantized_t5
    print("Loading Wan 2.1 1.3B…", flush=True)
    pipeline = upstream.WanPipeline("t2v-1.3B")
    latents = pipeline.generate_latents(args.prompt, negative_prompt="Text, watermarks, blurry image, JPEG artifacts",
        size=size, frame_num=args.frames, num_steps=args.steps, guidance=5.0, shift=5.0, seed=args.seed)
    conditioning = next(latents)
    mx.eval(conditioning)
    del pipeline.t5
    mx.clear_cache()
    for step, latent in enumerate(latents, 1):
        mx.eval(latent)
        print(f"Denoising step {step}/{args.steps}", flush=True)
    del latents, pipeline.flow
    gc.collect()
    mx.clear_cache()
    print("Decoding video…", flush=True)
    video = pipeline.decode(latent)
    mx.eval(video)
    if not save_video(video, args.output, fps=16):
        raise RuntimeError("FFmpeg could not encode the video")
    print(f"Peak MLX memory: {mx.get_peak_memory() / 1024**3:.2f} GiB", flush=True)
    print(f"Elapsed: {time.monotonic() - started:.1f} seconds", flush=True)


if __name__ == "__main__":
    main()
