const net = require("node:net");
const path = require("node:path");

function reservePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function getDshEntry(appPath) {
  return path.join(
    appPath,
    "node_modules",
    "@deepseek-ai",
    "dsh",
    "lib",
    "bin.js"
  );
}

function isTrustedAppUrl(candidate, expectedOrigin) {
  try {
    const url = new URL(candidate);
    return url.origin === expectedOrigin;
  } catch {
    return false;
  }
}

function isProtectedWorkspacePath(candidate, protectedPaths = []) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
    return true;
  }

  const resolvedCandidate = path.resolve(candidate);
  const normalizedCandidate = resolvedCandidate.toLowerCase();

  if (
    normalizedCandidate === path.parse(resolvedCandidate).root.toLowerCase()
  ) {
    return true;
  }

  return protectedPaths
    .filter(
      (protectedPath) =>
        typeof protectedPath === "string" && protectedPath.trim()
    )
    .some(
      (protectedPath) =>
        path.resolve(protectedPath).toLowerCase() === normalizedCandidate
    );
}

module.exports = {
  getDshEntry,
  isProtectedWorkspacePath,
  isTrustedAppUrl,
  reservePort
};
