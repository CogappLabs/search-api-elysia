import { Elysia, t } from "elysia";

export const models = new Elysia({ name: "models" }).model({
  error: t.Object({ error: t.String() }),
});
