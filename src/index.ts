import type { AstroInstance } from "astro";
import type { Loader, LoaderContext } from "astro/loaders";
import { experimental_AstroContainer } from "astro/container";

import { slug as githubSlug } from "github-slugger";
import { green } from "kleur/colors";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { posixRelative } from "./utils";

interface AstroContentInstance extends AstroInstance {
  meta?: Record<string, unknown>;
}

interface GenerateIdOptions {
  /** The path to the entry file, relative to the base directory. */
  entry: string;
  /** The base directory URL. */
  base: URL;
  /** The parsed, unvalidated metadata of the entry. */
  meta: AstroContentInstance["meta"];
}

interface GlobOptions {
  /**
   * A record of module paths returned by `import.meta.glob`.
   *
   * Note that the glob pattern is resolved relative to the *current* directory
   * (`src`).
   */
  modules: Record<string, unknown | (() => Promise<unknown>)>;
  /**
   * The base directory used to resolve entry IDs. A path relative to the
   * project root directory, or an absolute file URL.
   *
   * If omitted, the base is automatically inferred as the deepest common
   * directory shared by all module paths in the glob result.
   */
  base?: string | URL;
  /**
   * Function that generates an ID for an entry. Default implementation generates a slug from the entry path.
   *
   * @returns The ID of the entry. Must be unique per collection.
   **/
  generateId?: (options: GenerateIdOptions) => string;
}

function generateIdDefault({ entry, meta }: GenerateIdOptions) {
  if (meta && meta.slug) {
    return meta.slug as string;
  }
  const withoutFileExt = entry.replace(
    new RegExp(path.extname(entry) + "$"),
    "",
  );
  const rawSlugSegments = withoutFileExt.split(path.sep);
  const slug = rawSlugSegments
    .map((segment) => githubSlug(segment))
    .join("/")
    .replace(/\/index$/, "");
  return slug;
}

function inferBase(paths: string[]): string {
  const splitPaths = paths.map((p) => p.split(path.sep));

  const baseParts: string[] = [];
  let firstPath = splitPaths[0];
  for (let i = 0; i < firstPath.length; i++) {
    const segment = firstPath[i];
    if (splitPaths.every((path) => path[i] === segment))
      // If all paths have this same segment, add it to the base path
      baseParts.push(segment);
    else break;
  }

  return path.join(path.sep, ...baseParts);
}

/**
 * Loads Astro files from the provided glob as content entries. Files may export
 * a `meta` object to provide metadata (i.e., frontmatter) for each entry.
 *
 * NOTE: `meta` object must not reference external variables or imports.
 *
 * @example
 * // Loads all Astro files in `src/content/posts/`
 * astro({modules: import.meta.glob("./content/posts/*.astro")})
 */
export default function astroContentLoader({
  modules,
  base,
  generateId = generateIdDefault,
}: GlobOptions): Loader {
  const fileToIdMap = new Map<string, string>();
  // Check if the glob was configured with `eager: true`
  const eager = typeof Object.values(modules)[0] !== "function";

  async function load({
    config,
    store,
    generateDigest,
    watcher,
    logger,
    parseData,
    collection,
  }: LoaderContext) {
    const paths = Object.keys(modules);
    if (paths.length === 0) {
      logger.warn(
        `No modules found for content collection "${collection}". Ensure the glob pattern is correct and files exist.`,
      );
    }

    if (paths.length < 2 && !base) {
      logger.error(
        `Cannot infer base directory of content collection "${collection}". You must either specify a base directory, or use a glob that matches multiple files.`,
      );
      return;
    }

    const modulesAbsolute = Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => {
          const relativeToRoot = p.startsWith(".")
            ? path.join("src", p)
            : path.join(".", p);
          const absoluteUrl = new URL(relativeToRoot, config.root);
          return [
            fileURLToPath(absoluteUrl),
            eager
              ? (modules[p] as AstroContentInstance)
              : await (modules[p] as () => Promise<AstroContentInstance>)(),
          ];
        }),
      ),
    );
    const pathsAbsolute = Object.keys(modulesAbsolute);

    const baseDir = base
      ? new URL(base, config.root)
      : pathToFileURL(inferBase(pathsAbsolute));
    const baseDirPath = fileURLToPath(baseDir);

    if (!existsSync(baseDir)) {
      const message = [`The base directory "${baseDirPath}" does not exist.`];
      const relativeBaseDir = path.join(".", baseDirPath);
      if (baseDirPath.startsWith(path.sep) && existsSync(relativeBaseDir)) {
        message.push(`Did you mean "${relativeBaseDir}"?`);
      }
      logger.error(message.join(" "));
    }

    Object.keys(modulesAbsolute).map((filePath) => {
      const entry = posixRelative(baseDirPath, filePath);
      syncData(entry, modulesAbsolute[filePath] as AstroContentInstance);
    });

    if (!watcher) return;
    watcher.add(baseDirPath);

    async function onChange(changedPath: string) {
      if (Object.keys(modulesAbsolute).includes(changedPath)) {
        const entry = posixRelative(baseDirPath, changedPath);
        const oldId = fileToIdMap.get(changedPath);
        syncData(
          entry,
          modulesAbsolute[changedPath] as AstroContentInstance,
          oldId,
        );
        logger.info(`Reloaded data from ${green(entry)}`);
      }
    }
    async function onUnlink(unlinkedPath: string) {
      const id = fileToIdMap.get(unlinkedPath);
      if (id) {
        store.delete(id);
        fileToIdMap.delete(unlinkedPath);
      }
    }
    watcher.on("add", onChange);
    watcher.on("change", onChange);
    watcher.on("unlink", onUnlink);

    async function syncData(
      entry: string, // Path relative to the base directory
      instance: AstroContentInstance,
      oldId?: string,
    ) {
      const fileUrl = new URL(encodeURI(entry), baseDir);

      const id = generateId({ entry, base: baseDir, meta: instance.meta });

      if (oldId && oldId !== id) {
        store.delete(oldId);
      }

      const container = await experimental_AstroContainer.create();
      const html = await container.renderToString(instance.default);

      const existingEntry = store.get(id);
      const digest = generateDigest(JSON.stringify(instance));
      const filePath = fileURLToPath(fileUrl);

      if (
        existingEntry &&
        existingEntry.digest === digest &&
        existingEntry.filePath
      ) {
        fileToIdMap.set(filePath, id);
        return;
      }

      const relativeToRoot = posixRelative(
        fileURLToPath(config.root),
        filePath,
      );

      const data = instance.meta ?? {};

      parseData({
        id,
        data,
        filePath,
      });

      store.set({
        id,
        data,
        rendered: {
          html,
        },
        filePath: relativeToRoot,
      });

      fileToIdMap.set(filePath, id);
    }
  }
  return {
    name: "astro-content-loader",
    load,
  };
}
