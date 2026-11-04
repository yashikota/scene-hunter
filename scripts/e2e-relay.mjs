import { createHash } from "node:crypto";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { resolve } from "node:path";
const targets = {
  "linux-x64": [
    "x86_64-unknown-linux-gnu",
    "tar.gz",
    "9153e17022ac50d1b7cdb301973348277072a5fe7ccb0c284677d654f9b5c44e",
  ],
  "darwin-arm64": [
    "aarch64-apple-darwin",
    "tar.gz",
    "039b3980ed5e198de4ad1aef7a667e2d3da21b99681d128c5cc230c8cf9fc245",
  ],
  "win32-x64": [
    "x86_64-pc-windows-msvc",
    "zip",
    "099571dd41939374364c8c8e13e15d14c5a893297a10a521efd101ae05ea9415",
  ],
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error(`unsupported relay platform: ${process.platform}-${process.arch}`);
const [triple, ext, sha] = target;
const name = `moq-relay-v0.17.6-${triple}`;
const cache = resolve(".cache/moq-relay");
await mkdir(cache, { recursive: true });
const response = await fetch(
  `https://github.com/moq-dev/moq/releases/download/moq-relay-v0.17.6/${name}.${ext}`,
);
if (!response.ok) throw new Error(`relay download: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash("sha256").update(bytes).digest("hex") !== sha)
  throw new Error("relay checksum mismatch");
const archive = resolve(cache, `${name}.${ext}`);
await writeFile(archive, bytes);
execFileSync("tar", [ext === "zip" ? "-xf" : "-xzf", archive, "-C", cache]);
const binary =
  process.platform === "win32"
    ? resolve(cache, "moq-relay.exe")
    : resolve(cache, name, "bin", "moq-relay");
if (process.platform !== "win32") await chmod(binary, 0o755);
const child = spawn(binary, [resolve("tests/e2e/relay.toml")], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (e) => {
  console.error(e);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
