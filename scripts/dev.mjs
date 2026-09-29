import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const extra = process.argv.slice(2);
if (extra[0] === "--") extra.shift();
const args = [nextBin, "dev", ...extra];
const child = spawn(process.execPath, args, { stdio: ["inherit", "pipe", "pipe"] });
let opened = false;

function onOutput(chunk, stream) {
  const output = chunk.toString();
  stream.write(output);
  if (opened || !/Ready in|Local:/i.test(output)) return;
  const match = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
  if (!match) return;
  opened = true;
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const openArgs = process.platform === "win32" ? ["/c", "start", match[0]] : [match[0]];
  const browser = spawn(command, openArgs, { stdio: "ignore", detached: true });
  browser.on("error", () => {});
  browser.unref();
}

child.stdout.on("data", (chunk) => onOutput(chunk, process.stdout));
child.stderr.on("data", (chunk) => onOutput(chunk, process.stderr));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => { process.exitCode = code ?? 0; });
