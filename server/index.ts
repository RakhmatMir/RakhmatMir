import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { isDatabaseSeeded } from "./db/client";
import "./db/migrate";
import { api } from "./routes/api";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      process.env.NODE_ENV === "production"
        ? origin
        : origin.includes("5173")
          ? origin
          : "http://127.0.0.1:5173",
    credentials: true,
  }),
);

app.route("/api", api);

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/client" }));
  app.get("*", serveStatic({ path: "./dist/client/index.html" }));
} else {
  app.get("/", (c) =>
    c.json({
      message: "Foundation School API",
      seeded: isDatabaseSeeded(),
      clientDev: "http://127.0.0.1:5173",
    }),
  );
}

const port = Number(process.env.PORT ?? 3000);
console.log(`Foundation School server on http://127.0.0.1:${port}`);
export default {
  port,
  fetch: app.fetch,
};
