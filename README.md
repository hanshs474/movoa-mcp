# Movoa MCP server

Unlimited AI video generator with sound: on paid plans the tenth take of a shot costs what the first did, and your first clip is free to make right now. This is the official MCP server for [Movoa](https://movoa.ai/?utm_source=github&utm_medium=package): it lets Claude, Cursor, Cline, Gemini CLI or any MCP client make video clips with sound on your own Movoa account. Ask for a clip in chat, get the file URL back.

- [Text to video](https://movoa.ai/video/text-to-video): describe the shot, and the sound comes back in the same file.
- [Photo to video](https://movoa.ai/video/photo-to-video): pass a photo as `image_url` and it becomes the first frame.
- MiniMax H3 is the default model; [Seedance 2.5](https://movoa.ai/video/seedance-2-5), Seedance 2.0 (Fast, Mini) and [Veo 3](https://movoa.ai/video/google-veo-3) Fast are there too. Every one of them returns [AI video with audio](https://movoa.ai/video/ai-video-with-audio).

## Tools

| Tool | What it does |
|---|---|
| `generate_video` | Text to video, or photo to video with `image_url`. Returns a run id (or waits with `wait: true`) |
| `check_status` | Status of a run, and the video URL when it is ready |
| `credits` | Credits left on your account (free to call) |

## API key

Create one at [movoa.ai/settings/apikeys](https://movoa.ai/settings/apikeys) and set it as `MOVOA_API_KEY`. Runs cost credits on your Movoa account, at the prices on [movoa.ai/pricing](https://movoa.ai/pricing).

## Install

```bash
npx -y movoa-mcp
```

### Claude Desktop / Claude Code / Cursor / Cline

```json
{
  "mcpServers": {
    "movoa": {
      "command": "npx",
      "args": ["-y", "movoa-mcp"],
      "env": { "MOVOA_API_KEY": "sk-..." }
    }
  }
}
```

Claude Code in one line: `claude mcp add movoa -e MOVOA_API_KEY=sk-... -- npx -y movoa-mcp`

### Gemini CLI

```bash
gemini extensions install https://github.com/hanshs474/movoa-mcp
```

### Claude Code plugin

```bash
claude plugin marketplace add hanshs474/movoa-mcp
claude plugin install movoa@movoa
```

The plugin also ships the [`movoa-video` skill](skills/movoa-video/SKILL.md), which works without MCP (plain `curl`).

## Models

| `model` | Length (`duration`) | `resolution` | `aspect_ratio` |
|---|---|---|---|
| `minimax-h3` (default) | 4, 5, 6, 8, 10, 15 s | 480p, 768p | 16:9, 9:16, 1:1 |
| `seedance-2-5` | 5–30 s, steps of 5 | 480p, 720p | 16:9, 9:16, 1:1 |
| `veo-3-1-fast` | 8 s | 720p | 16:9, 9:16 |
| `seedance-2` · `seedance-2-fast` · `seedance-2-mini` | 4, 6, 8, 10 s | 480p, 720p | 16:9, 9:16, 1:1 |

## Notes

- Video takes minutes. `generate_video` returns a run id by default; poll it with `check_status`, or pass `wait: true` to block (up to 30 minutes).
- Your plan's concurrency limit applies; a submit past it is refused until a run finishes.
- `MOVOA_BASE_URL` overrides the endpoint; only useful against a local build of the site.

## License

MIT
