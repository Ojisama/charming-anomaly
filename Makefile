# Charming-Anomaly — asset reskin pipeline (local ComfyUI + FLUX.1-schnell)
# Mirrors special-funicular's ergonomics. Zero API cost, all local.
#
#   make comfyui         # start the ComfyUI server (foreground; Ctrl-C to stop)
#   make gen-assets      # generate every asset in scripts/reskin/prompts.json
#   make gen-asset NAME=redcell
#   make contact         # montage the generated sprites into one review sheet
#   make help

# InSPyReNet (bg removal) lives in special-funicular's venv; override with PY=... if it moves.
PY      ?= /home/aurelien/gamedev/special-funicular/.venv/bin/python
GEN     := scripts/reskin/gen.py
OUTDIR  := src/reskin/body
COMFYUI_URL := http://localhost:8188

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: comfyui
comfyui: ## Start ComfyUI server (needs ~/ComfyUI + ~/comfyui-venv)
	source ~/comfyui-venv/bin/activate && cd ~/ComfyUI && python main.py

.PHONY: ensure-comfyui
ensure-comfyui: ## Start ComfyUI in the background if it isn't already up
	@if ! curl -s -m 3 -o /dev/null $(COMFYUI_URL)/system_stats; then \
		echo "Starting ComfyUI..."; \
		bash -c 'source ~/comfyui-venv/bin/activate && cd ~/ComfyUI && python main.py' >/tmp/comfyui.log 2>&1 & \
		for i in $$(seq 1 40); do \
			curl -s -m 3 -o /dev/null $(COMFYUI_URL)/system_stats && { echo "ComfyUI up."; break; }; \
			sleep 3; \
		done; \
	else echo "ComfyUI already running."; fi

.PHONY: gen-assets
gen-assets: ## Generate ALL assets from scripts/reskin/prompts.json
	$(PY) $(GEN)

.PHONY: gen-asset
gen-asset: ## Generate one asset: make gen-asset NAME=redcell
	@test -n "$(NAME)" || (echo "Usage: make gen-asset NAME=redcell" && exit 1)
	$(PY) $(GEN) --only $(NAME)

.PHONY: contact
contact: ## Montage $(OUTDIR)/*.png into a single review sheet
	$(PY) scripts/reskin/contact.py $(OUTDIR)

.PHONY: dev
dev: ## Start the vite dev server (serves the game + the gallery)
	npm run dev

.PHONY: gallery
gallery: ## Open the asset gallery (needs `make dev` running; reads prompts.json live)
	@echo "Gallery: http://localhost:5173/gallery.html  (port may differ — check the vite log)"
	@xdg-open http://localhost:5173/gallery.html 2>/dev/null || true

.PHONY: clean-assets
clean-assets: ## Delete generated sprites in $(OUTDIR)
	rm -f $(OUTDIR)/*.png
