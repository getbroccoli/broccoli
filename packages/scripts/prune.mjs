// Removes the Compose projects of checkouts that no longer exist. Only projects that
// `pnpm dev` labelled with their checkout are considered; nothing else on the Docker host
// is touched.
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

const CHECKOUT_LABEL = "org.getbroccoli.checkout";
const PROJECT_LABEL = "com.docker.compose.project";

/** Runs a Docker command and returns its output lines. */
function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

/** Only a confirmed ENOENT counts: an unreadable folder may still be someone's checkout. */
function isDeleted(folder) {
  try {
    statSync(folder);
    return false;
  } catch (error) {
    return error.code === "ENOENT";
  }
}

function projectsOfMissingCheckouts() {
  const volumes = docker(
    "volume",
    "ls",
    "--filter",
    `label=${CHECKOUT_LABEL}`,
    "--format",
    `{{.Label "${PROJECT_LABEL}"}}\t{{.Label "${CHECKOUT_LABEL}"}}`,
  ).map((line) => line.split("\t"));
  const projects = volumes
    .filter(([project, checkout]) => project && checkout && isDeleted(checkout))
    .map(([project]) => project);
  return [...new Set(projects)];
}

function removeProject(project) {
  const filter = `label=${PROJECT_LABEL}=${project}`;
  const containers = docker("ps", "--all", "--quiet", "--filter", filter);
  if (containers.length > 0) docker("rm", "--force", "--volumes", ...containers);
  const networks = docker("network", "ls", "--quiet", "--filter", filter);
  if (networks.length > 0) docker("network", "rm", ...networks);
  const volumes = docker("volume", "ls", "--quiet", "--filter", filter);
  if (volumes.length > 0) docker("volume", "rm", ...volumes);
}

const projects = projectsOfMissingCheckouts();
for (const project of projects) {
  removeProject(project);
  console.log(`Removed ${project}`);
}
if (projects.length === 0) console.log("Nothing to prune");
