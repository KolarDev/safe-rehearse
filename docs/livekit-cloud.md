# Running on LiveKit Cloud

LiveKit is our realtime transport: the browser and the voice agent both connect to it. Locally we
ran it in Docker (`livekit-server --dev`). LiveKit Cloud is the hosted equivalent. Nothing in the code
is tied to either: the web, API and voice agent only read three variables.

## What changes and what doesn't

|                       | Local LiveKit (Docker)    | LiveKit Cloud                        |
| --------------------- | ------------------------- | ------------------------------------ |
| LiveKit server        | runs on your machine      | hosted by LiveKit                    |
| `LIVEKIT_URL`         | `ws://localhost:7880`     | `wss://<your-project>.livekit.cloud` |
| Credentials           | fixed `devkey` / `secret` | your project's API key and secret    |
| Web, API, voice agent | run on your machine       | **still run on your machine**        |
| Postgres, Redis       | Docker                    | Docker (unchanged)                   |

The **voice agent still runs locally**. It is our code: it joins rooms and talks to Gemini.
With Cloud it connects _out_ to LiveKit Cloud instead of to Docker. (Later it can be deployed to
LiveKit Cloud too, with `lk agent deploy`. That is not needed for development.)

What you gain: no LiveKit server competing for your CPU, and real-world network conditions.

## Setup

1. Create a project at https://cloud.livekit.io.
2. In the project, open **Settings → Keys** and create an API key. Note the **URL**, **API key**
   and **API secret**.
3. In your root `.env`, replace the local values:

   ```env
   LIVEKIT_URL=wss://<your-project>.livekit.cloud
   LIVEKIT_API_KEY=<your key>
   LIVEKIT_API_SECRET=<your secret>
   LIVEKIT_AGENT_NAME=safe-rehearse-agent
   ```

   Never commit these. `.env` is gitignored.

4. Start the database and Redis (LiveKit is no longer started locally):

   ```bash
   pnpm infra:up
   ```

   If the old local LiveKit container is still running, stop everything first with `pnpm infra:down`.

5. Run the app:

   ```bash
   pnpm cloud
   ```

   `pnpm cloud` first checks that `.env` really points at Cloud (wss:// URL, non-dev keys, Google key
   set), then builds and runs web, API and voice agent from compiled output, like `pnpm lite`.

6. Open http://localhost:3000/session as before. In the voice-agent output you should see
   `registered worker` (now registered with Cloud), then `job received` when you start a session.

## Switching back to local LiveKit

```bash
pnpm infra:up:livekit      # Postgres + Redis + local LiveKit
# set LIVEKIT_URL=ws://localhost:7880, LIVEKIT_API_KEY=devkey, LIVEKIT_API_SECRET=secret
pnpm lite                  # or pnpm dev
```

## Things to know

- **Agent name.** Cloud dispatches by `LIVEKIT_AGENT_NAME`. If two people run workers with the same
  name against the same Cloud project, jobs go to whichever worker LiveKit picks. Give each developer
  their own project, or their own agent name.
- **Usage.** Cloud has a free tier with usage limits. Check the current limits on LiveKit's pricing page
  before a demo.
- **Gemini is separate.** Moving to Cloud does not change Gemini. Gemini errors (like
  `CONTENT_TYPE_AUDIO ... not supported`) still come from Google, not LiveKit.
