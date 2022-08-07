export interface Path {
  join: (...segments: string[]) => string;
  basename: (path: string, ext?: string) => string;
  extname: (path: string) => string;
  relative: (a: string, b: string) => string;
  dirname: (path: string) => string;
}
export interface Fs {
  readdir: (dir: string) => Promise<string[]>;
  stat: (
    dirOrFile: string,
  ) => Promise<{ isDirectory: () => boolean; mtimeMs: number }>;
  readFile: (path: string) => Promise<Buffer>;
  mkdir: (
    path: string,
    opts?: { recursive: true },
  ) => Promise<string | undefined>;
  writeFile: (path: string, contents: Buffer) => Promise<void>;
}
export interface Crypto {
  createHash: (algorithm: 'sha256') => {
    update: (content: Buffer) => { digest: (encoding: 'hex') => string };
  };
}
export type TransformFn = (
  content: Buffer,
  file: string,
) => Buffer | null | Promise<Buffer | null>;
export type FileNamerFn = (
  originalName: string,
  contents: Buffer,
) => string | Promise<string>;
export interface Prcssr {
  outDir: string;
  recursive?: boolean;
  rename?: FileNamerFn;
  include?: (name: string, isDir: boolean) => boolean;
  transform?: TransformFn;
}
export interface CmplOptions {
  entry: string;
  processors: (Prcssr | Promise<Prcssr>)[];
  path?: Path | Promise<Path>;
  fs?: Fs | Promise<Fs>;
}

export const cntntHsh =
  (
    length: number = 8,
    crypto: Crypto | Promise<Crypto> = import('node:crypto'),
    path: Path | Promise<Path> = import('node:path'),
  ): FileNamerFn =>
  async (name, content) => {
    const { createHash } = await crypto;
    const { basename, extname } = await path;

    return `${basename(name, extname(name))}-${createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, length)
      .toUpperCase()}${extname(name)}`;
  };

export async function prcss(
  file: string,
  {
    entry,
    fs = import('node:fs/promises'),
    path = import('node:path'),
  }: Pick<CmplOptions, 'entry' | 'fs' | 'path'>,
  processors: (Prcssr | null)[],
): Promise<(null | Record<string, string>)[]> {
  const { relative, dirname, join } = await path;
  const { readFile, mkdir, writeFile } = await fs;
  const contentsP = readFile(file);
  const inName = relative(entry, file);

  return Promise.all(
    processors.map(async (p) => {
      if (!p) {
        return p;
      }
      const {
        outDir,
        transform = (b) => b,
        rename = async (p) => (await path).basename(p),
      } = p;
      const contents = await transform(await contentsP, inName);
      if (contents === null) {
        return null;
      }
      const name = await rename(inName, contents);
      const targerDir = join(outDir, relative(entry, dirname(file)));
      const targetFile = join(targerDir, name);

      await mkdir(targerDir, { recursive: true });
      await writeFile(targetFile, contents);
      return { [inName]: relative(outDir, targetFile) };
    }),
  );
}

export async function cmpl({
  entry,
  processors,
  fs = import('node:fs/promises'),
  path = import('node:path'),
}: CmplOptions) {
  const manifest: Record<string, string>[] = Array.from({
    length: processors.length,
  }).map(() => ({}));
  const { relative, join, dirname } = await path;
  const { readdir, stat } = await fs;
  let entryDir: string | null;

  const handle = async (
    subEntry: string,
    parentDir: string,
    processors: (Prcssr | null)[],
  ) => {
    const entryPath = join(parentDir, subEntry);
    const isDir = (await stat(entryPath)).isDirectory();
    if (!entryDir) {
      entryDir = isDir ? entry : dirname(entry);
    }

    if (isDir) {
      let relevantDir = false;
      const dirProcessors = processors.map((p) => {
        const incl =
          p &&
          (subEntry === entry ||
            (p.recursive !== false &&
              (!p.include || p.include(relative(entryDir!, entryPath), true))));
        if (incl) {
          relevantDir = true;
        }
        return incl ? p : null;
      });

      if (relevantDir) {
        await readDir(entryPath, dirProcessors);
      }
    }

    if (!isDir) {
      let relevantFile = false;
      const fileProcessors = processors.map((p) => {
        const incl =
          p && (!p.include || p.include(relative(entryDir!, entryPath), false))
            ? p
            : null;

        if (incl) {
          relevantFile = true;
        }
        return incl;
      });

      if (!relevantFile) {
        return;
      }

      (
        await prcss(
          entryPath,
          { fs, path, entry: entry === subEntry ? entryDir! : entry },
          fileProcessors,
        )
      ).forEach((v, i) => {
        if (v !== null) {
          Object.assign(manifest[i], v);
        }
      });
    }
  };

  const readDir = async (
    dir: string,
    processors: (Prcssr | null)[],
  ): Promise<void> => {
    await Promise.all(
      (await readdir(dir)).map((e) => handle(e, dir, processors)),
    );
  };

  await handle(entry, '', await Promise.all(processors));

  if (processors.length === 1) {
    return manifest[0];
  }

  return manifest;
}

export interface WatchEvent {
  eventType: 'rename' | 'change';
  filename: string;
}
export interface WatchFs extends Fs {
  watch: (
    path: string,
    opts?: { recursive: boolean; signal?: AbortSignal },
  ) => AsyncIterable<WatchEvent>;
}

export interface WtchOpts extends Omit<CmplOptions, 'fs'> {
  signal?: AbortSignal;
  fs?: WatchFs | Promise<WatchFs>;
  poll?: boolean | number;
  onError?: (err: unknown) => void;
}

export async function* wtch({
  signal,
  entry,
  processors,
  poll = pllOptFromEnv(),
  onError = process.env.CI
    ? (err) => {
        throw err;
      }
    : (err) => console.log(err instanceof Error ? err.message : err),
  fs = import('node:fs/promises'),
  path = import('node:path'),
}: WtchOpts) {
  const cmplOpts = {
    entry,
    fs,
    processors,
    path,
  };
  const { join, dirname } = await path;
  const { watch, stat } = await fs;

  let manifest: Record<string, string>[] | null = null;
  const exportManifest = () =>
    manifest!.length === 1
      ? Object.assign({}, manifest![0])
      : manifest!.map((m) => Object.assign({}, m));

  try {
    const m = await cmpl(cmplOpts);
    manifest = Array.isArray(m) ? m : [m];
    yield exportManifest();
  } catch (err) {
    onError(err);
  }

  const isDir = (await stat(entry)).isDirectory();
  const baseDir = isDir ? entry : dirname(entry);
  const prcssOpts = isDir
    ? cmplOpts
    : {
        ...cmplOpts,
        entry: baseDir,
      };

  const recursive = (await Promise.all(processors)).some(
    ({ recursive }) => recursive !== false,
  );

  const wtchOrPll = poll
    ? createPll({
        fs,
        path,
        interval: typeof poll === 'number' ? poll : undefined,
      })
    : watch;

  for await (const event of wtchOrPll(entry, {
    recursive: isDir ? recursive : false,
    signal,
  })) {
    try {
      if (!manifest) {
        const m = await cmpl(cmplOpts);
        manifest = Array.isArray(m) ? m : [m];
        yield exportManifest();
      } else {
        switch (event.eventType) {
          case 'rename': {
            const exists = manifest.some((m) => m[event.filename]);
            if (exists) {
              manifest.forEach((m) => {
                if (m[event.filename]) {
                  delete m[event.filename];
                }
              });
              yield exportManifest();

              break;
            }
          }
          case 'change': {
            let relevantChange = false;
            const changeProcessors = (await Promise.all(processors)).map(
              (p) => {
                const incl =
                  p && (!p.include || p.include(event.filename, false))
                    ? p
                    : null;

                if (incl) {
                  relevantChange = true;
                }
                return incl;
              },
            );

            if (relevantChange) {
              (
                await prcss(
                  join(baseDir, event.filename),
                  prcssOpts,
                  changeProcessors,
                )
              ).forEach((v, i) => {
                if (v !== null) {
                  Object.assign(manifest![i], v);
                }
              });
              yield exportManifest();
            }
            break;
          }
        }
      }
    } catch (err) {
      onError(err);
    }
  }
}

function createPll({
  path,
  fs,
  interval = 300,
}: Required<Pick<CmplOptions, 'path' | 'fs'>> & { interval?: number }) {
  return async function* pll(
    entry: string,
    opts: { recursive: boolean; signal?: AbortSignal },
  ): AsyncIterable<WatchEvent> {
    const { join, relative } = await path;
    const { readdir, stat } = await fs;
    const readDir = async (
      dir: string,
      state: Record<string, number> = {},
    ): Promise<Record<string, number>> => {
      await Promise.all(
        (
          await readdir(dir)
        ).map(async (entryName) => {
          const dirEntry = join(dir, entryName);
          const s = await stat(dirEntry);
          if (s.isDirectory() && opts.recursive) {
            await readDir(dirEntry, state);
          } else {
            state[relative(entry, dirEntry)] = s.mtimeMs;
          }
        }),
      );

      return state;
    };

    let state = await readDir(entry);

    while (!opts.signal?.aborted) {
      await new Promise((res) => setTimeout(res, interval));
      if (opts.signal?.aborted) {
        break;
      }
      const nextState = await readDir(entry);
      if (opts.signal?.aborted) {
        break;
      }

      const oldEntries = Object.entries(state);
      for (let i = 0, l = oldEntries.length; i < l; i++) {
        const [filename, mtime] = oldEntries[i];
        if (!nextState[filename]) {
          yield { eventType: 'rename', filename };
        } else if (nextState[filename] !== mtime) {
          yield { eventType: 'change', filename };
        }
      }

      const newEntires = Object.entries(state);
      for (let i = 0, l = newEntires.length; i < l; i++) {
        const [filename] = newEntires[i];
        if (!state[filename]) {
          yield { eventType: 'rename', filename };
        }
      }

      state = nextState;
    }
  };
}

function pllOptFromEnv() {
  if (!process.env.CMPL_USE_POLLING) {
    return false;
  }
  const n = parseInt(process.env.CMPL_USE_POLLING);
  if (!isNaN(n)) {
    return n;
  }
  return true;
}
