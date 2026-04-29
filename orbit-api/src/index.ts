import "dotenv/config";
import cors from "cors";
import express from "express";
import { verifyConnection } from "./db/connection";
import coordinatorsRouter from "./routes/coordinators";
import reinstatementsRouter from "./routes/reinstatements";
import teachersRouter from "./routes/teachers";
import vacanciesRouter from "./routes/vacancies";
import litesRouter from "./routes/lites";
import academicLoadRouter from "./routes/academic_load";
import importRouter from "./routes/import";
import dashboardRouter from "./routes/dashboard";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "4000", 10);

app.use(cors());
app.use(express.json());

app.use("/api", teachersRouter);
app.use("/api", vacanciesRouter);
app.use("/api", coordinatorsRouter);
app.use("/api", reinstatementsRouter);
app.use("/api", litesRouter);
app.use("/api", academicLoadRouter);
app.use("/api", importRouter);
app.use("/api", dashboardRouter);

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

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
