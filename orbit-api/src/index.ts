import cors from "cors";
import express from "express";
import {
  getDatabaseConfigSummary,
  verifyConnection,
} from "./db/connection";
import coordinatorsRouter from "./routes/coordinators";
import reinstatementsRouter from "./routes/reinstatements";
import teachersRouter from "./routes/teachers";
import vacanciesRouter from "./routes/vacancies";
import litesRouter from "./routes/lites";
import academicLoadRouter from "./routes/academic_load";
import importRouter from "./routes/import";
import dashboardRouter from "./routes/dashboard";
import authRouter from "./routes/auth";

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const NODE_ENV = process.env.NODE_ENV ?? "development";
const rawApiPrefix = (process.env.API_PREFIX ?? "/api").trim() || "/api";
const API_PREFIX = rawApiPrefix.startsWith("/")
  ? rawApiPrefix
  : `/${rawApiPrefix}`;

const corsOrigin = process.env.CORS_ORIGIN?.trim();
if (corsOrigin) {
  app.use(cors({ origin: corsOrigin }));
} else {
  app.use(cors());
}
app.use(express.json());

app.use("/api", teachersRouter);
app.use("/api", vacanciesRouter);
app.use("/api", coordinatorsRouter);
app.use("/api", reinstatementsRouter);
app.use("/api", litesRouter);
app.use("/api", academicLoadRouter);
app.use("/api", importRouter);
app.use("/api", dashboardRouter);
app.use("/api", authRouter);

app.get("/health", async (_req, res) => {
  const payload: { status: string; db?: string } = { status: "ok" };
  try {
    const connected = await verifyConnection();
    payload.db = connected ? "connected" : "disconnected";
  } catch {
    payload.db = "disconnected";
  }
  res.status(200).json(payload);
});

app.listen(PORT, "0.0.0.0", () => {
  const dbSummary = getDatabaseConfigSummary();
  console.log(`[orbit-api] Listening on 0.0.0.0:${PORT}`);
  console.log(`[orbit-api] NODE_ENV=${NODE_ENV}`);
  console.log(`[orbit-api] API prefix=${API_PREFIX}`);
  console.log(
    `[orbit-api] Database host=${dbSummary.host} port=${dbSummary.port} user=${dbSummary.user} database=${dbSummary.database} schema=${dbSummary.schema} ssl=${dbSummary.ssl}`,
  );

  void (async () => {
    try {
      const ok = await verifyConnection();
      console.log(
        `[orbit-api] Startup database probe: ${ok ? "connected" : "failed"}`,
      );
    } catch (err) {
      console.warn(
        "[orbit-api] Startup database probe failed (service is still up):",
        err instanceof Error ? err.message : err,
      );
    }
  })();
});
