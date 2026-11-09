# pi-maritaca

[![npm version](https://img.shields.io/npm/v/pi-maritaca.svg?color=red&logo=npm)](https://www.npmjs.com/package/pi-maritaca)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache)](LICENSE)
[![GitHub](https://img.shields.io/badge/joeljuca/pi--maritaca-white?logo=github&logoColor=black)](https://github.com/joeljuca/pi-maritaca)
[![Codeberg](https://img.shields.io/badge/joeljuca/pi--maritaca-blue?logo=codeberg&logoColor=white)](https://codeberg.org/joeljuca/pi-maritaca)
[![Author](https://img.shields.io/badge/joeljuca.com-white?logo=google-chrome)](https://joeljuca.com)

[pi](https://pi.dev) extension for [Maritaca AI](https://maritaca.ai).

## Set up

With pi installed and ready to use, run:

```
pi install npm:pi-maritaca
```

Get an API key at [plataforma.maritaca.ai](https://plataforma.maritaca.ai), set the environment variable `MARITACA_API_KEY` with your key, and you should be ready to go.

```sh
export MARITACA_API_KEY='<Your API key here>'
```

You're ready. Run pi normally; the extension loads automatically:

```
pi
```

## Use

Usage is mostly automatic. The extension will make your pi integrate seamlessly with Maritaca AI, so you should be able to see their models when you `/model`, the list will be reloaded when you `/reload`, etc.

Here's what the extension will do:

1. It registers `maritaca` as a model provider in pi
1. Fetches a fresh list of available models from Maritaca AI when you open pi
1. Refresh the list of models when you `/model` or `/reload`
1. **API fetch**: The callback fetches models from the Maritaca AI `/api/models` endpoint

### Configuration

The extension uses the [Responses API](https://docs.maritaca.ai/en/responses-api) by
default (Maritaca's recommended interface). Everything can be overridden:

| Env var                 | Default                        | Description                                                                |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `MARITACA_API_BASE_URL` | `https://chat.maritaca.ai/api` | API base URL                                                               |
| `MARITACA_API_FORMAT`   | `openai-responses`             | `openai-responses` or `openai-completions`                                 |
| `MARITACA_API_KEY`      | —                              | Your API key from [plataforma.maritaca.ai](https://plataforma.maritaca.ai) |

Or set them from your extension module:

```typescript
import { createMaritacaExtension } from "pi-maritaca";

// Use the Chat Completions API instead
export default createMaritacaExtension({ apiFormat: "openai-completions" });
```

Precedence: config param > environment variable > default.

> 💡 Troubleshoot
>
> If something is not working properly, you're not seeing Maritaca AI' models when you `/model`, etc., the first place to check is your API key:
>
> ```sh
> echo $MARITACA_API_KEY
> ```
>
> Test it against the API:
>
> ```bash
> curl https://chat.maritaca.ai/api/models -H "Authorization: Bearer $MARITACA_API_KEY"
> ```
>
> Reload pi (while in pi, run `/reload`). Check pi's console output for error messages, you'll most certainly find insights on what's wrong.
>
> If nothing works and you believe it's a bug in the extension itself, open an issue at [https://github.com/joeljuca/pi-maritaca/issues](https://github.com/joeljuca/pi-maritaca/issues).

## Contribute

See: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[Apache-2.0](LICENSE) © [Joel Jucá](https://joeljuca.com)
