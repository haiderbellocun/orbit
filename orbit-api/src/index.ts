import cors from "cors";
import express from "express";
import { verifyConnection } from "./db/connection";
import { runStartupSchemaPatches } from "./db/startupSchemaPatches";
import reinstatementsRouter from "./routes/reinstatements";
import vacanciesRouter from "./routes/vacancies";
import academicLoadRouter from "./routes/academic_load";
import substantiveHoursRouter from "./routes/substantive_hours";
import dashboardRouter from "./routes/dashboard";
import authRouter from "./routes/auth";
import catalogRouter from "./routes/catalog";
import personalRouter from "./routes/personal";
import plantaActivaRouter from "./routes/plantaActiva";
import workforceEventsRouter from "./routes/workforce_events";
import notificationsRouter from "./routes/notifications";
import rolesRouter from "./routes/roles";
import {
  orbitAuthMiddleware,
  orbitCapabilityByPathMiddleware,
} from "./middleware/orbitAuth";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "4000", 10);

app.set("trust proxy", 1);

function allowedOrigins(): string[] {
  const configured = (process.env.CORS_ORIGIN ?? process.env.ORBIT_FRONTEND_URL ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if ((process.env.NODE_ENV ?? "").trim().toLowerCase() !== "production") {
    configured.push("http://localhost:3000");
  }
  return [...new Set(configured)];
}

const origins = allowedOrigins();
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if ((process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || origins.includes(origin.replace(/\/$/, ""))) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "2mb" }));

type RateBucket = { count: number; resetAt: number };
function rateLimiter(limit: number, windowMs: number): express.RequestHandler {
  const buckets = new Map<string, RateBucket>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > limit) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: "Demasiadas solicitudes. Inténtalo nuevamente más tarde." });
      return;
    }
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    next();
  };
}

app.use("/api", rateLimiter(600, 15 * 60 * 1000));
app.use("/api/auth", rateLimiter(30, 15 * 60 * 1000));

app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  if (req.path === "/auth/google/gis-callback") {
    next();
    return;
  }
  const origin = req.headers.origin?.replace(/\/$/, "");
  if (origin && origins.includes(origin)) {
    next();
    return;
  }
  res.status(403).json({ error: "Origen de solicitud no permitido" });
});

app.use("/api", authRouter);
app.use("/api", orbitAuthMiddleware);
app.use("/api", orbitCapabilityByPathMiddleware);
app.use("/api", dashboardRouter);
app.use("/api", catalogRouter);
app.use("/api", personalRouter);
app.use("/api", plantaActivaRouter);
app.use("/api", workforceEventsRouter);
app.use("/api", notificationsRouter);
app.use("/api", rolesRouter);
app.use("/api", vacanciesRouter);
app.use("/api", reinstatementsRouter);
app.use("/api", academicLoadRouter);
app.use("/api", substantiveHoursRouter);

app.get("/health", async (_req, res) => {
  try {
    const connected = await verifyConnection();
    if (connected) {
      res.json({ status: "ok", db: "connected" });
      return;
    }
    res.status(503).json({ status: "error", db: "disconnected" });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

async function start(): Promise<void> {
  try {
    await runStartupSchemaPatches();
  } catch (e) {
    console.error("Startup schema patches failed:", e);
  }

  app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
  });
}

void start();
