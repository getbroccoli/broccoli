import { type ChildProcess, spawn, type SpawnOptions } from "node:child_process";

/**
 * Starts `program` with its writable memory capped, through util-linux's `prlimit` and no shell,
 * so no path becomes shell code. macOS has no `prlimit` and does not enforce the cap, so there the
 * program starts uncapped. A missing program exits with 127 under `prlimit`.
 */
export function spawnWithMemoryLimit(
  limitMb: number,
  program: string,
  args: readonly string[],
  options: SpawnOptions,
): ChildProcess {
  if (process.platform === "darwin") return spawn(program, args, options);
  return spawn("/usr/bin/prlimit", [`--data=${limitMb * 1024 * 1024}`, program, ...args], options);
}
