import express from "express";
import path from "node:path";
import { claimsRouter } from "./routes/claims";
import { formatMinor } from "./money";
import { seed } from "./seed";

seed(); // no-op if the database already has claims

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.locals.formatMinor = formatMinor;

app.get("/", (_req, res) => res.redirect("/claims"));
app.use("/claims", claimsRouter);

app.use((req, res) => {
  res.status(404).render("error", { message: `Not found: ${req.path}` });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Mini Claims Register listening on http://localhost:${PORT}`);
});
