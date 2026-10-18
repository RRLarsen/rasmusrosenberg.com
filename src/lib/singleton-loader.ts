import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Loader } from 'astro/loaders';

/**
 * Loads a YAML file that describes one thing (the profile, the site copy) as a
 * single entry with id "main", so the file itself can stay a plain object.
 *
 * In a build, invalid data stops the build. While previewing (npm run dev), an error
 * is reported and the file stays watched, so saving a fix brings the page back.
 */
export function singleton(fileName: string): Loader {
  return {
    name: 'singleton-loader',
    load: async ({ config, store, parseData, watcher, logger }) => {
      const path = fileURLToPath(new URL(fileName, config.root));
      const sync = async () => {
        const raw = parse(await readFile(path, 'utf8'));
        const data = await parseData({ id: 'main', data: raw });
        store.clear();
        store.set({ id: 'main', data });
      };
      const report = (err: unknown) =>
        logger.error(`${fileName} could not be loaded: ${err instanceof Error ? err.message : err}`);

      if (!watcher) return sync(); // build: errors stop the build

      watcher.add(path);
      watcher.on('change', async (changed) => {
        if (changed !== path) return;
        logger.info(`Reloading ${fileName}`);
        await sync().catch(report);
      });
      await sync().catch(report);
    },
  };
}
