import { register } from "tsx/esm/api";

register();
const { app } = await import("./server.ts");

export default app;
