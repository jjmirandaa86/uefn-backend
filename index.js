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
  process.env.CORS_ORIGINS || "https://localhost:5173,http://localhost:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsAllowLan =
  String(process.env.CORS_ALLOW_LAN || "true").toLowerCase() === "true";

/** Orígenes https en red local (p. ej. https://192.168.0.211:5173). */
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

const app = express();
app.disable("x-powered-by");
app.use(helmet());

const apiSecurity = setupApiSecurity(app);

app.use(express.json({ limit: "1mb" }));

//---- CORS
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (corsAllowLan && isLanDevOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(apiSecurity.globalMiddleware);

//---- Routes
app.use(systemRouter); //Health check
app.use("/media", apiSecurity.mediaMiddleware, createMediaMiddleware()); //Serve uploads and processed under /media/* (e.g. imageUrl of captures); short cache on images.
app.use("/api/captures", apiSecurity.capturesMiddleware, capturesRouter);
app.use("/api/history", apiSecurity.historyMiddleware, historyRouter);
app.use(errorHandler); //Handle Errors

//---- Start A
async function start() {
  await ensureSchema();
  await pingDatabase();
  app.listen(port, () => {
    console.log(`API listening at ${getPublicApiUrl()}`);
    console.log(`App timezone (día de negocio): ${getAppTimezone()}`);
    console.log(
      `MySQL: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`,
    );
  });
}

start().catch((e) => {
  console.error("[uefn-backend] startup failed:", e);
  process.exit(1);
});
