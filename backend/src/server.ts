import "dotenv/config";
import { buildApp } from "./app";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
  const app = await buildApp();
  await app.listen({ port, host });
  app.log.info(`API listening on http://${host}:${port}`);
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});