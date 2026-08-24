const fs = require("node:fs");
const path = require("node:path");

const { isProtectedWorkspacePath } = require("./runtime-utils.cjs");

class DesktopSettings {
  constructor(userDataPath, { protectedWorkspacePaths = [] } = {}) {
    this.filePath = path.join(userDataPath, "desktop-settings.json");
    this.protectedWorkspacePaths = protectedWorkspacePaths;
    this.values = this.read();
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      return {};
    }
  }

  getWorkspacePath() {
    const candidate = this.values.workspacePath;
    if (
      !candidate ||
      isProtectedWorkspacePath(candidate, this.protectedWorkspacePaths)
    ) {
      return null;
    }

    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      return null;
    }

    return null;
  }

  setWorkspacePath(workspacePath) {
    if (
      isProtectedWorkspacePath(workspacePath, this.protectedWorkspacePaths)
    ) {
      throw new Error(
        "请选择具体的项目目录，不能使用磁盘根目录或系统目录。"
      );
    }

    let isDirectory = false;
    try {
      isDirectory = fs.statSync(workspacePath).isDirectory();
    } catch {
      isDirectory = false;
    }

    if (!isDirectory) {
      throw new Error("选择的工作目录不存在或不是文件夹。");
    }

    this.values.workspacePath = workspacePath;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      `${JSON.stringify(this.values, null, 2)}\n`,
      "utf8"
    );
  }
}

module.exports = { DesktopSettings };
