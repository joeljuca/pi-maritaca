# Changelog

Based on [Keep a Changelog](https://keepachangelog.com).

<!--
Templates:

    ## [Unreleased]

    ### Added

    ### Changed

    ### Fixed

    ### Removed

    ## [X.Y.Z] - 1970-01-01

    ### Added

    ### Changed

    ### Fixed

    ### Removed
-->

## [Unreleased]

## [0.1.0] - 2026-11-09

### Added

- Registers Maritaca AI as a model provider in pi, with model discovery on `/model` and refresh on `/reload`
- Uses the [Responses API](https://docs.maritaca.ai/en/responses-api) by default — Maritaca's recommended interface — with Chat Completions available through `MARITACA_API_FORMAT` or the `apiFormat` config option
- Model discovery from `GET /api/models`: context window and max output tokens come from Maritaca's payload; missing metadata raises an error instead of registering a model with guessed values
- Thinking-level control for reasoning models (S5 family, Sabiá 4 Thinking), mapped to Maritaca's `reasoning.effort` across the full range (`none` … `max`, including `xhigh`), with `off` mapped to `none`
- Per-model input modalities: image input on every current model except `S5-free` (images are OCR-extracted server-side); unknown models are text-only
- `MODEL_TOOLS` export: per-model availability of Maritaca's built-in server tools (`web_search`, `code_execution`, `data_ocean`, `image_generation`), verified cell-by-cell against the live API (10 models × 4 tools)
- API compatibility flags matching Maritaca's strict request validation: fields it rejects are never sent, and strict tool schemas are enabled on both endpoints
- API key resolved by pi per request from the `$MARITACA_API_KEY` environment template
- Configuration via `MARITACA_API_KEY`, `MARITACA_API_BASE_URL` and `MARITACA_API_FORMAT` — precedence: config param > environment > default
- `/login maritaca` interception with an API-key notice
- README with setup instructions, configuration reference, and troubleshooting guide

[Unreleased]: https://github.com/joeljuca/pi-maritaca/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/joeljuca/pi-maritaca/releases/tag/v0.1.0
