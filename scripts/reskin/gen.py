#!/usr/bin/env python3
"""Generate cute-pixel reskin sprites via local ComfyUI + FLUX.1-schnell.

Reuses special-funicular's proven FLUX workflow. Config-driven from prompts.json:
each asset -> one 512x512 transparent sprite (InSPyReNet bg removal) or an opaque
background. Zero API cost, all local.

Prereqs:
  - ComfyUI running at localhost:8188  (cd ~/ComfyUI && python main.py)
  - models present: flux1-schnell (unet), clip_l + t5xxl (text_encoders), ae (vae)
  - InSPyReNet for transparent sprites: run with special-funicular's venv, e.g.
      ~/gamedev/special-funicular/.venv/bin/python scripts/reskin/gen.py
    (or pass --no-bg to skip removal and keep the white background)

Usage:
  python scripts/reskin/gen.py                 # all assets in prompts.json
  python scripts/reskin/gen.py --only redcell  # just one
  python scripts/reskin/gen.py --dry-run       # validate config + print one workflow, no ComfyUI
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

COMFYUI_URL = "http://localhost:8188"
HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG = HERE / "prompts.json"
DEFAULT_OUTDIR = HERE.parent.parent / "src" / "reskin" / "body"

UNET = "flux1-schnell.safetensors"
CLIP_L = "clip_l.safetensors"
T5XXL = "t5xxl_fp8_e4m3fn.safetensors"
VAE = "ae.safetensors"
STEPS = 4


def build_workflow(text: str, width: int, height: int, seed: int) -> dict:
    """FLUX.1-schnell graph: UNET/DualCLIP/VAE loaders + SamplerCustomAdvanced.
    No negative prompt / no CFG (schnell) — negatives are folded into `text` as
    'not ...' cues; the STYLE + NEGATIVE separation lives in prompts.json."""
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "fp8_e4m3fn"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": CLIP_L, "clip_name2": T5XXL, "type": "flux"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["2", 0]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["4", 0]}},
        "7": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "8": {"class_type": "BasicScheduler", "inputs": {"model": ["1", 0], "scheduler": "simple", "steps": STEPS, "denoise": 1.0}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "10": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["9", 0], "guider": ["6", 0], "sampler": ["7", 0], "sigmas": ["8", 0], "latent_image": ["5", 0]}},
        "11": {"class_type": "VAEDecode", "inputs": {"samples": ["10", 0], "vae": ["3", 0]}},
        "12": {"class_type": "SaveImage", "inputs": {"images": ["11", 0], "filename_prefix": "reskin"}},
    }


def queue_prompt(workflow: dict) -> str:
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=json.dumps({"prompt": workflow}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req).read())["prompt_id"]


def wait_for(prompt_id: str, timeout: int = 300) -> dict:
    start = time.time()
    while time.time() - start < timeout:
        try:
            history = json.loads(urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}").read())
            if prompt_id in history:
                status = history[prompt_id].get("status", {}).get("status_str", "")
                if status == "error":
                    raise RuntimeError(f"ComfyUI generation failed: {history[prompt_id].get('status')}")
                if history[prompt_id].get("outputs"):
                    return history[prompt_id]
        except urllib.error.URLError:
            pass
        time.sleep(2)
        print(f"  generating... ({int(time.time() - start)}s)", flush=True)
    raise TimeoutError(f"timed out after {timeout}s")


def download(history: dict, path: Path):
    for node_output in history.get("outputs", {}).values():
        for img in node_output.get("images", []):
            url = (f"{COMFYUI_URL}/view?filename={img['filename']}"
                   f"&subfolder={img.get('subfolder', '')}&type={img.get('type', 'output')}")
            urllib.request.urlretrieve(url, path)
            return
    raise RuntimeError("no image in ComfyUI output")


def remove_bg(path: Path):
    """InSPyReNet bg removal, in place. Cleans <20 alpha ghost pixels."""
    from transparent_background import Remover
    from PIL import Image
    print("  removing background (InSPyReNet)...", flush=True)
    img = Image.open(path).convert("RGB")
    result = Remover(mode="base").process(img, type="rgba").copy()
    px = result.load()
    w, h = result.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 20:
                px[x, y] = (0, 0, 0, 0)
    result.save(path)


def main():
    ap = argparse.ArgumentParser(description="Cute-pixel reskin sprite generator (ComfyUI + FLUX)")
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    ap.add_argument("--outdir", type=Path, default=DEFAULT_OUTDIR)
    ap.add_argument("--only", help="generate a single asset by name")
    ap.add_argument("--no-bg", action="store_true", help="skip InSPyReNet bg removal (keep white bg)")
    ap.add_argument("--dry-run", action="store_true", help="validate config + print one workflow, no ComfyUI")
    args = ap.parse_args()

    cfg = json.loads(args.config.read_text())
    style, negative = cfg["style"], cfg["negative"]
    assets = cfg["assets"]

    # self-check: every asset well-formed
    for name, a in assets.items():
        missing = {"prompt", "w", "h", "transparent"} - a.keys()
        assert not missing, f"asset '{name}' missing keys: {missing}"
        assert isinstance(a["w"], int) and isinstance(a["h"], int), f"asset '{name}' w/h not int"

    if args.only:
        assert args.only in assets, f"--only '{args.only}' not in config ({', '.join(assets)})"
        assets = {args.only: assets[args.only]}

    if args.dry_run:
        name, a = next(iter(assets.items()))
        text = f"{a['prompt']}, {a.get('style', style)}. avoid: {a.get('negative', negative)}"
        print(f"config OK: {len(cfg['assets'])} assets. sample workflow for '{name}':")
        print(json.dumps(build_workflow(text, a["w"], a["h"], a.get("seed", 0)), indent=2))
        return

    args.outdir.mkdir(parents=True, exist_ok=True)
    for name, a in assets.items():
        out = args.outdir / f"{name}.png"
        text = f"{a['prompt']}, {a.get('style', style)}. avoid: {a.get('negative', negative)}"
        print(f"[{name}] {a['w']}x{a['h']} seed={a.get('seed', 'random')} -> {out}")
        pid = queue_prompt(build_workflow(text, a["w"], a["h"], a.get("seed", 0)))
        download(wait_for(pid), out)
        if a["transparent"] and not args.no_bg:
            remove_bg(out)
        print(f"  done -> {out}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, TimeoutError, AssertionError, urllib.error.URLError) as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)
