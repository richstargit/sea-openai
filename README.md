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
| `GET http://localhost:8080/__openapi.json` | OpenAPI document |

To run the compiled server, run `npm run build` followed by `npm start` from `backend/`. With `NODE_ENV=production`, set `APP_ORIGINS` to a comma-separated list of allowed origins in the environment or in `backend/.env.production`.

### OpenAI text generation

Set `OPENAI_API_KEY` in your environment or in `backend/.env.development` for local development. The default model is `gpt-5.4-mini`. Set `OPENAI_MODEL` to change the default, or pass `model` for an individual call.

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
│   ├── services/      # Application logic and logging
│   ├── middlewares/   # Logging, error handling, and reusable rate limiting
│   ├── docs/          # OpenAPI generation and endpoint annotations
│   ├── models/        # Placeholder for data models
│   ├── types/         # Placeholder for shared type declarations
│   └── utils/         # Shared helpers
├── sql/              # Placeholder for SQL files
└── tests/            # API and middleware tests
```
