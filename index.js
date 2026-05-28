import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { ensureSchema } from "./db/ensureSchema.js";
import { pingDatabase } from "./db/pool.js";
import capturesRouter from "./routes/captures.routes.js";
import historyRouter from "./routes/history.routes.js";
import systemRouter, {
  createMediaMiddleware,
  errorHandler,
} from "./routes/system.routes.js";
import { setupApiSecurity } from "./config/apiSecurity.js";
import { getAppTimezone } from "./utils/appTimezone.js";
import { getApiPort, getPublicApiUrl } from "./utils/publicApiUrl.js";

const port = getApiPort();

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  "https://playface.acertijo.dev,http://localhost:5173,https://localhost:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsAllowLan =
  String(process.env.CORS_ALLOW_LAN || "false").toLowerCase() === "true";

function isLanDevOrigin(origin) {
  if (!origin) return false;

  try {
    const u = new URL(origin);

    return (
      u.protocol === "https:" &&
      (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(u.hostname) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(u.hostname) ||
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (corsAllowLan && isLanDevOrigin(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204,
};

const app = express();

app.disable("x-powered-by");

app.use(helmet());

const apiSecurity = setupApiSecurity(app);

app.use(express.json({ limit: "1mb" }));

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

app.use(apiSecurity.globalMiddleware);

//---- Routes
app.use(systemRouter);

app.use("/media", apiSecurity.mediaMiddleware, createMediaMiddleware());

app.use("/api/captures", apiSecurity.capturesMiddleware, capturesRouter);

app.use("/api/history", apiSecurity.historyMiddleware, historyRouter);

// 404 JSON limpio
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "Not found",
  });
});

// Error handler final
app.use(errorHandler);

//---- Start API
async function start() {
  await ensureSchema();
  await pingDatabase();

  app.listen(port, () => {
    console.log(`API listening at ${getPublicApiUrl()}`);
    console.log(`App timezone (día de negocio): ${getAppTimezone()}`);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `MySQL: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`,
      );
    }
  });
}

start().catch((e) => {
  console.error("[playface-api] startup failed:", e);
  process.exit(1);
});
