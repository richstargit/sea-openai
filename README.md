# sea-openai

## Backend

The main API lives in `backend/` and uses Express and TypeScript. Use Node.js 22.

```sh
cd backend
npm ci
npm run dev
```

The development server defaults to port 8080. Set `PORT` when starting the server to override it.

The backend writes logs to the console. Set `ACTIVITY_LOG_ENABLED=false` to turn off activity logging.

| Endpoint | Purpose |
| --- | --- |
| `GET http://localhost:8080/` | Service name and version |
| `GET http://localhost:8080/health` | Liveness check |
| `GET http://localhost:8080/__openapi.json` | OpenAPI document |

To run the compiled server, run `npm run build` followed by `npm start` from `backend/`. With `NODE_ENV=production`, set `APP_ORIGINS` to a comma-separated list of allowed origins in the environment or in `backend/.env.production`.

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
