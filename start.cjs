const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const os = require("os");
const root = __dirname,
  backend = path.join(root, "backend-server"),
  frontend = path.join(root, "frontend-app");
// Address the preview server listens on. "0.0.0.0" lets phones and other
// computers on the same network open RareDrop; set RAREDROP_HOST=127.0.0.1 to
// keep it private to this computer again.
const HOST = process.env.RAREDROP_HOST || "0.0.0.0";
const children = new Set();
// Human-readable list of the addresses other devices can use.
function sharedAddresses() {
  if (HOST === "127.0.0.1" || HOST === "localhost") return [];
  if (HOST !== "0.0.0.0" && HOST !== "::") return [{ name: "RAREDROP_HOST", address: HOST }];
  const found = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces()))
    for (const entry of entries || [])
      if (entry.family === "IPv4" && !entry.internal) found.push({ name, address: entry.address });
  // Hyper-V, WSL, Docker and VM adapters are not reachable from a phone, so
  // they are hidden unless the computer has nothing else to offer.
  const virtual = /wsl|vethernet|hyper-v|virtualbox|vmware|docker|tailscale|zerotier/i;
  const real = found.filter((entry) => !virtual.test(entry.name));
  return real.length ? real : found;
}

function launch(args, cwd) {
  if (stopping) throw new Error("Startup cancelled.");
  const p = spawn(process.execPath, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(p);
  p.once("exit", () => children.delete(p));
  p.once("error", () => children.delete(p));
  return p;
}
function task(args, cwd) {
  return new Promise((resolve, reject) => {
    const p = launch(args, cwd);
    p.once("error", reject);
    p.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command exited with code ${code}`)),
    );
  });
}
function server(args, cwd) {
  const p = launch(args, cwd);
  p.once("error", (error) => {
    console.error(error.message);
    shutdown(1);
  });
  p.once("exit", (code) => {
    if (!stopping) {
      console.error(
        "A server stopped. Check whether ports 3333 and 5173 are already in use.",
      );
      shutdown(code || 1);
    }
  });
  return p;
}
let stopping = false;
function shutdown(code = 0) {
  stopping = true;
  for (const p of children) if (p.exitCode === null) p.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
function checkPort(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) =>
      reject(
        new Error(
          `Port ${port} is unavailable (${error.code}). Close the existing RareDrop window before starting again.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
async function waitUntilReady(url) {
  const deadline = Date.now() + 15000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      // The process may still be starting; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    stopping ? "Startup cancelled." : `Server did not become ready: ${url}`,
  );
}
(async () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw new Error("RareDrop requires Node.js 22.12 or newer.");
  if (
    !fs.existsSync(path.join(backend, "node_modules/express")) ||
    !fs.existsSync(path.join(frontend, "node_modules/vite"))
  ) {
    throw new Error(
      "Dependencies are missing. Follow README_先读我.md to install the backend and frontend dependencies.",
    );
  }
  await Promise.all([checkPort(3333), checkPort(5173)]);
  await task(["app/tools/seed.js"], backend);
  console.log("Building the latest frontend source…");
  await task(
    ["node_modules/vite/bin/vite.js", "build", "--configLoader", "native"],
    frontend,
  );
  server(["server.js"], backend);
  await waitUntilReady("http://127.0.0.1:3333/");
  server(
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--configLoader",
      "native",
      "--host",
      HOST,
      "--port",
      "5173",
      "--strictPort",
    ],
    frontend,
  );
  await waitUntilReady("http://127.0.0.1:5173/api/categories");
  const lines = ["", `RareDrop (this computer): http://127.0.0.1:5173/`];
  const shared = sharedAddresses();
  if (shared.length) {
    lines.push("", "Open from other devices on the same network:");
    for (const { name, address } of shared)
      lines.push(`  http://${address}:5173/   (${name})`);
    lines.push(
      "",
      "If another device cannot connect, allow Node.js on private networks when",
      "Windows asks, or run ALLOW_LAN_ACCESS.cmd once as administrator.",
    );
  } else {
    lines.push("", "Only this computer can open RareDrop (RAREDROP_HOST is local-only).");
  }
  lines.push("", "Keep this window open. Press Ctrl+C to stop both servers.", "");
  console.log(lines.join("\n"));
})().catch((error) => {
  if (stopping) return;
  console.error(error.message);
  shutdown(1);
});
