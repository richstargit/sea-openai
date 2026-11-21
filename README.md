# sea-openai

## Backend

The main API lives in `backend/` and uses Express and TypeScript. Use Node.js 22.

```sh
cd backend
npm ci
npm run dev
```

The development server defaults to port 8080. Set `PORT` when starting the server to override it.

Create `backend/.env.development` for local configuration. Git ignores environment files. To allow requests from the local frontend, set `APP_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` in that file.

The backend writes logs to the console. Set `ACTIVITY_LOG_ENABLED=false` to turn off activity logging.

| Endpoint | Purpose |
| --- | --- |
| `GET http://localhost:8080/` | Service name and version |
| `GET http://localhost:8080/health` | Liveness check |
| `GET http://localhost:8080/agent/skills` | List installed skills |
| `POST http://localhost:8080/agent/chat` | Run a stateless agent turn |
| `POST /agent/threads` | Start a saved thread and stream the first turn |
| `GET /agent/threads/:id` | Read the saved conversation and run status |
| `POST /agent/threads/:id/messages` | Continue a saved conversation |
| `POST /agent/threads/:id/resume` | Resume an interrupted turn |
| `GET http://localhost:8080/__openapi.json` | OpenAPI document |

To run the compiled server, run `npm run build` followed by `npm start` from `backend/`. With `NODE_ENV=production`, set `APP_ORIGINS` to a comma-separated list of allowed origins in the environment or in `backend/.env.production`.

### Account and session

Open `http://localhost:3000/register` to create an account or `/login` to sign in. Studio requires a session. The frontend forwards `/auth/*` and `/agent/*` to the backend; configure `BACKEND_ORIGIN` before building the frontend if the backend uses another address.

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/register` | Create an account with an email and a password of 12–128 characters, and sign in. |
| `POST /auth/login` | Start a new session for the account. |
| `GET /auth/me` | Read the signed-in user's ID and email. |
| `POST /auth/logout` | Revoke the current session and clear its cookie. |

Mongoose uses the local MongoDB database `sea_openai`. It stores accounts in `users` and session token hashes in `auth_sessions`. Sessions expire after seven days. Production requires HTTPS for the HttpOnly session cookie. For CLI access, log in using a temporary cookie jar and reuse it in agent requests.

```sh
cookie_jar=$(mktemp)
curl -s -c "$cookie_jar" http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<your password>"}'
curl -s -b "$cookie_jar" http://localhost:8080/auth/me
```

### OpenAI text generation

Set `OPENAI_API_KEY` in your environment or in `backend/.env.development` for local development. The default model is `gpt-5.6-luna`. Set `OPENAI_MODEL` to select the model used by the agent and text service, or pass `model` when calling `generateText()`.

```ts
import { generateText } from '@/services/openai.service.js'

const reply = await generateText('Explain TypeScript', {
  instructions: 'Reply in Thai in one sentence.',
})
```

To try the service directly from `backend/` after setting the API key, run:

```sh
node --import tsx --input-type=module -e 'import "./src/env.ts"; import { generateText } from "./src/services/openai.service.ts"; console.log(await generateText("Say hello in Thai."))'
```

### Video Studio

Editor timelines and media persist under the authenticated user in the MongoDB collections `editor_projects` and `editor_media_chunks`.

Sign in at `http://localhost:3000/studio`, enter a video brief and generate a clip. The agent selects a matching style from the built-in catalog and your personal styles for each brief. Studio generates a three-second silent WebM at 24 fps. Use /studio for portrait clips and /studio/live for transparent overlays and OBS controls. Drop a reference or type a brief in either studio. The renderer accepts one PNG product image. For 3D it renders a rotating box, cylinder or torus with the local Blender application.

The backend limits agent actions to choosing a video style, designing a shot and rendering it. Out-of-scope requests receive a fixed reply. Motion directions from a skill or reference supply design input. The renderer accepts bounded text, palette, movement, shape and format fields. Chat, saved threads and resumed runs use the same policy. OpenAI does not receive shell, browser automation, filesystem or OBS control tools.

**Skills.** The built-in catalog includes `motion-graphics`, `hyperframes-animation`, `explainer-default`, `explainer-engaging`, `explainer-high-energy`, `motion-broll` and `blender-3d`. The backend reads the matching style guide from `~/.agents/skills` on the host or `VIDEO_SKILLS_DIR`, with bundled guidance for machines without the guide. Blender uses the HyperFrames 3D guide. API clients can also request a specific style using the `skill` field or its slash command.

**Personal styles.** In Studio choose “Add a personal style” and upload a Markdown file like the example below. Each account can save 20 styles. Names must be unique within the account. The upload endpoint is `POST /agent/skills` with a JSON `markdown` string. MongoDB stores personal instructions in `video_skills`.

```md
---
name: neon-reveal
description: A violet product reveal for live promotions
---
Keep the title short. Use a violet accent and pulse once on the reveal.
```

**References.** Studio accepts a public HTTPS reference URL or an uploaded MP4/WebM clip up to 8 MiB and five minutes. For clips the designer sees three sampled frames in time order. For webpages it receives text. Some video platforms expose only a title and description. Direct MP4/WebM links can provide frames. An unreadable reference returns an error. Private uploads and outputs in `agent_files` are available to their owner.

Agent Reach 1.6.1 runs from a project-specific Python environment. Its reader sends public page URLs to Jina Reader. Only the explicit URL of an accepted video request reaches that reader. The backend can also read public HTML and YouTube metadata. For a fresh checkout install the pinned dependency once from `backend/`:

```sh
uv venv --python 3.12 integrations/agent-reach/.venv
uv pip install --python integrations/agent-reach/.venv/bin/python -r integrations/agent-reach/requirements.txt
```

**Local Blender.** On this Mac the Blender 5.3 user startup folder links to `backend/blender/sea_video.py`. Open Blender normally, then refresh Studio to see its status. For another Mac, place the bridge in `~/Library/Application Support/Blender/<version>/scripts/startup/` and launch Blender. The bridge uses Blender's Python API and a private local job directory. It accepts a shape and a color and renders in a temporary scene.

**Saved threads.** `POST /agent/threads` streams plan, step and result events. Use the returned thread ID with `/messages` or `/resume`. LangGraph persists the video plan and shot design between steps. Mongoose connects to `mongodb://127.0.0.1:27017` and defaults to database `sea_openai`. Override these with `MONGODB_URI` and `MONGODB_DB`. Conversations live in `agent_threads`, and the checkpointer uses `checkpoints` and `checkpoint_writes`.

```sh
curl -s -b "$cookie_jar" http://localhost:8080/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"สร้างคลิปป้ายโปร 299 บาท พื้นหลังโปร่งใส"}'
```

The response includes an owner-authenticated download URL in `files`. The API fields `referenceUrl` and `referenceFile` accept a public URL and the ID of an uploaded reference clip respectively. Upload bytes to `POST /agent/files?name=example.webm` as `application/octet-stream`.

### OBS overlay

1. In Studio generate an OBS link. In OBS add a **Browser Source**, paste the complete link and set the source size to 1920 × 1080.
2. Enter a SKU and price in Studio and press **Test price overlay**. Use **Play clip on overlay** to play a generated WebM. The read-only link belongs to the signed-in account. Generating another link disconnects previous viewers.
3. An integration can send the following events to `POST /agent/overlay/events` with the owner's session. The response includes the number of subscribed pages that received the event.

| Event | Payload example |
| --- | --- |
| Live price | `{"type":"price","sku":"A1","price":299}` |
| Product | `{"type":"product","name":"กาแฟเย็น"}` |
| Ingredients | `{"type":"ingredients","text":"กาแฟ · นมสด"}` |
| Sales total | `{"type":"sales","total":4200}` |
| Preloaded transparent WebM | `{"type":"promo"}`, `gift`, `flash`, `transition` |
| Generated WebM | `{"type":"clip","fileId":"<returned file ID>"}` |

Live price, product and ingredients events also accept an optional `image` as a PNG/JPEG data URL up to 180,000 characters. The overlay preloads the timeline library and static clips, then connects to the backend at `/overlay/ws`. The two playback slots restart their HyperFrames timelines with the incoming values. A third event replaces the oldest active slot. Unknown or malformed events and slow clip loads show the default live badge. Events do not wait for a model call or replay when a source reconnects. Use a single backend instance for local live delivery. For a different deployment origin, set `OVERLAY_PUBLIC_ORIGIN` on the frontend to the browser-accessible backend and forward WebSocket upgrades.

Run `npm run test:agent-mongo` from `backend/` for the restart, ownership and render checks. Set `TEST_OVERLAY_BROWSER=1` to also exercise real Chromium playback, timeline advancement, fallback, the slot limit and overlay link rotation. These tests use an isolated database and a mock OpenAI provider.

### Backend structure

The main backend already includes this structure for adding new API features.

```text
backend/
├── src/
│   ├── server.ts      # Server startup and graceful shutdown
│   ├── app.ts         # Express app and middleware registration
│   ├── env.ts         # Environment variable loading
│   ├── config/        # Server, service, and CORS configuration
│   ├── constants/     # Shared constants and error codes
│   ├── routes/        # Route definitions
│   ├── controllers/   # HTTP request handlers
│   ├── schemas/       # Request validation
│   ├── services/      # Application logic and logging
│   ├── middlewares/   # Logging, error handling, and reusable rate limiting
│   ├── docs/          # OpenAPI generation and endpoint annotations
│   ├── models/        # MongoDB thread and checkpoint storage
│   ├── types/         # Placeholder for shared type declarations
│   └── utils/         # Shared helpers
├── skills/           # Agent skill instructions and references
├── sql/              # Placeholder for SQL files
└── tests/            # API and middleware tests
```
