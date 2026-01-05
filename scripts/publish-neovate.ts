#!/usr/bin/env bun

import { spawn } from "bun";
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface ParsedArgs {
  help: boolean;
  skipBuild: boolean;
}

function parseArgs(): ParsedArgs {
  const args = Bun.argv.slice(2);
  return {
    help: args.includes("-h") || args.includes("--help"),
    skipBuild: args.includes("--skip-build"),
  };
}

function showHelp(): void {
  console.log(`
Usage: bun scripts/publish-neovate.ts [options]

Build and publish nextra-theme-docs-neovate package to npm.

Steps:
  1. Build nextra-theme-docs package
  2. Copy files to ./tmp (excluding node_modules, src)
  3. Rename package to nextra-theme-docs-neovate
  4. Run npm login
  5. Publish to npm

Options:
  -h, --help      Show this help message
  --skip-build    Skip the build step
`);
}

async function run(cmd: string[], cwd?: string): Promise<void> {
  console.log(`$ ${cmd.join(" ")}`);
  const proc = spawn({
    cmd,
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const rootDir = join(import.meta.dir, "..");
  const sourceDir = join(rootDir, "packages/nextra-theme-docs");
  const tmpDir = join(rootDir, "tmp");

  if (!args.skipBuild) {
    console.log("\n==> Building nextra-theme-docs...\n");
    await run(["pnpm", "--filter", "nextra-theme-docs", "build"], rootDir);
  }

  console.log("\n==> Preparing tmp directory...\n");
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }
  mkdirSync(tmpDir, { recursive: true });

  const excludes = ["node_modules", "src", ".turbo"];
  const entries = await Array.fromAsync(
    new Bun.Glob("*").scan({ cwd: sourceDir, dot: true, onlyFiles: false })
  );

  for (const entry of entries) {
    if (excludes.includes(entry)) continue;
    const srcPath = join(sourceDir, entry);
    const destPath = join(tmpDir, entry);
    cpSync(srcPath, destPath, { recursive: true });
  }

  console.log("==> Updating package.json name...\n");
  const pkgPath = join(tmpDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.name = "nextra-theme-docs-neovate";
  delete pkg.scripts?.prepublishOnly;
  if (pkg.peerDependencies?.nextra) {
    pkg.peerDependencies.nextra = pkg.version;
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  console.log("==> Running npm login...\n");
  await run(["npm", "login"], tmpDir);

  console.log("\n==> Publishing to npm...\n");
  await run(["npm", "publish"], tmpDir);

  console.log("\n==> Done!\n");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
