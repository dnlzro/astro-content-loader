import path from "node:path";

function posixifyPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function posixRelative(from: string, to: string) {
  return posixifyPath(path.relative(from, to));
}

export { posixRelative };
