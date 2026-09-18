// Stage the self-contained QRE engine for packaging.
//
// electron-builder ships whatever is under build/qre-engine as extraResources.
// This script fills that directory with:
//
//   build/qre-engine/python/runtime/   a relocatable standalone CPython 3.13
//                                      with qdk[qre] installed into it
//   build/qre-engine/python/*.py       the estimate.py wrapper and friends
//   build/qre-engine/benchmarks/       the bundled Q# project
//
// It runs on the host platform and produces a bundle for THAT platform's OS and
// architecture — a venv is not relocatable and a macOS build cannot produce a
// working Windows interpreter, so the release matrix runs one job per target.
//
// Standalone interpreters come from astral-sh/python-build-standalone. We ask
// the GitHub API for the latest release and pick the matching `install_only`
// asset, so there is no release date hard-coded here to rot.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_SRC = path.join(APP_DIR, "src", "main", "engine");
const OUT_DIR = path.join(APP_DIR, "build", "qre-engine");
const RUNTIME_DIR = path.join(OUT_DIR, "python", "runtime");
const PYTHON_MINOR = "3.13";

/** python-build-standalone target triple for this host. */
function targetTriple() {
  const { platform, arch } = process;
  if (platform === "darwin") {
    if (arch === "arm64") return "aarch64-apple-darwin";
    if (arch === "x64") return "x86_64-apple-darwin";
  } else if (platform === "win32") {
    if (arch === "x64") return "x86_64-pc-windows-msvc";
  } else if (platform === "linux") {
    if (arch === "x64") return "x86_64-unknown-linux-gnu";
  }
  throw new Error(`Unsupported platform/arch for a standalone Python: ${platform}/${arch}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${String(result.status)}`);
  }
}

async function findStandaloneAsset(triple) {
  const headers = { "User-Agent": "qre-dashboard-bundler", Accept: "application/vnd.github+json" };
  const token = process.env["GITHUB_TOKEN"];
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(
    "https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest",
    { headers },
  );
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} listing python-build-standalone releases`);
  }
  const release = await response.json();
  const assets = Array.isArray(release.assets) ? release.assets : [];
  // e.g. cpython-3.13.7+20250818-aarch64-apple-darwin-install_only.tar.gz
  //
  // Exclude the freethreaded and debug variants: their ABI differs from the
  // standard CPython that qdk's binary wheels target, and their interpreter is
  // laid out differently (python3.13t rather than python3).
  const match = assets.find(
    (asset) =>
      typeof asset.name === "string" &&
      asset.name.startsWith(`cpython-${PYTHON_MINOR}.`) &&
      asset.name.includes(triple) &&
      asset.name.endsWith("install_only.tar.gz") &&
      !asset.name.includes("freethreaded") &&
      !asset.name.includes("debug"),
  );
  if (!match) {
    throw new Error(
      `No install_only asset for cpython-${PYTHON_MINOR}.* / ${triple} in ${release.tag_name ?? "latest"}`,
    );
  }
  return match.browser_download_url;
}

async function download(url, destination) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

async function main() {
  const triple = targetTriple();
  console.log(`Bundling QRE engine for ${process.platform}/${process.arch} (${triple})`);

  // Start clean so a stale interpreter from a previous run never ships.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(path.join(OUT_DIR, "python"), { recursive: true });

  // 1. The wrapper scripts and the Q# benchmarks, mirroring the dev layout so
  //    the runtime resolves them identically (see main.ts engineDir).
  cpSync(path.join(ENGINE_SRC, "python"), path.join(OUT_DIR, "python"), {
    recursive: true,
    filter: (source) =>
      ![".venv", "__pycache__", ".qre-cache", ".matplotlib", "runtime"].some((skip) =>
        source.split(path.sep).includes(skip),
      ),
  });
  cpSync(path.join(ENGINE_SRC, "benchmarks"), path.join(OUT_DIR, "benchmarks"), {
    recursive: true,
  });

  // 2. The standalone interpreter.
  const workDir = await mkdtemp(path.join(tmpdir(), "qre-python-"));
  const archive = path.join(workDir, "python.tar.gz");
  await download(await findStandaloneAsset(triple), archive);
  // bsdtar ships on macOS and Windows 10+; the archive expands to a top-level
  // `python/` directory, which becomes our runtime dir.
  run("tar", ["-xzf", archive, "-C", workDir]);
  // verbatimSymlinks: keep the distribution's relative symlinks (e.g.
  // bin/python3 -> python3.13) as-is. Without it, cpSync rewrites them to
  // absolute paths into the temp dir, which is deleted next — leaving the
  // interpreter a dangling link.
  cpSync(path.join(workDir, "python"), RUNTIME_DIR, {
    recursive: true,
    verbatimSymlinks: true,
  });
  rmSync(workDir, { recursive: true, force: true });

  // 3. Install qdk[qre] into the standalone (NOT a venv — installing directly
  //    keeps the tree relocatable onto a user's machine).
  const py =
    process.platform === "win32"
      ? path.join(RUNTIME_DIR, "python.exe")
      : path.join(RUNTIME_DIR, "bin", "python3");
  if (!existsSync(py)) throw new Error(`Standalone interpreter missing at ${py}`);
  const requirements = path.join(ENGINE_SRC, "python", "requirements.txt");
  run(py, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(py, ["-m", "pip", "install", "--no-cache-dir", "--no-warn-script-location", "-r", requirements]);

  // 4. Prove qdk imports in the freshly assembled interpreter before it ships.
  run(py, ["-c", "import qdk.qre; print('qdk.qre import OK')"]);

  console.log(`\nQRE engine staged at ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
