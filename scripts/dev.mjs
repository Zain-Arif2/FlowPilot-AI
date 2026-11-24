import { spawn } from "node:child_process";

const workspaces = ["@flowpilot/web", "@flowpilot/api", "@flowpilot/worker"];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = workspaces.map((workspace) =>
  spawn(npmCommand, ["run", "dev", `--workspace=${workspace}`], {
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  }),
);

let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}

for (const child of children) {
  child.on("error", (error) => {
    console.error("Failed to start a workspace development server.", error);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
