# single-player-texas

A SvelteKit web app for playing single-player Texas Hold'em with physical cards, camera capture, and optional Gemini vision-based card detection.

## What it does

- Captures physical cards through the browser camera (or manual card entry fallback).
- Tracks **separate hidden contexts** for player hole cards and AI hole cards.
- Lets you add community cards as they are dealt.
- Generates AI turn guidance and physical actions to perform at the table (check/call/raise/fold instructions).

## Run locally

```bash
npm install
npm run dev
```

## Validate

```bash
npm run check
npm test
npm run build
```

## Vision providers

- **Mock/manual** (default): parse text like `Ah`, `10d`, or `Ace of Hearts`.
- **Gemini**: optionally provide an API key in the UI to attempt card detection from a captured frame.
