export interface Path {
  join: (...segments: string[]) => string;
  basename: (path: string, ext?: string) => string;
  extname: (path: string) => string;
  relative: (a: string, b: string) => string;
  dirname: (path: string) => string;
}
export interface Fs {
  readdir: (dir: string) => Promise<string[]>;
  stat: (dirOrFile: string) => Promise<{ isDirectory: () => boolean }>;
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
) => Buffer | Promise<Buffer>;
export type FileNamerFn = (
  originalName: string,
  contents: Buffer,
) => string | Promise<string>;
export interface CmplOptions {
  entry: string;
  outDir: string;
  recursive?: boolean;
  rename?: FileNamerFn;
  include?: (name: string, isDir: boolean) => boolean;
  transform?: TransformFn;
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
    outDir,
    transform = (b) => b,
    fs = import('node:fs/promises'),
    path = import('node:path'),
    rename = async (p) => (await path).basename(p),
  }: Pick<
    CmplOptions,
    'entry' | 'outDir' | 'rename' | 'transform' | 'fs' | 'path'
  >,
) {
  const { relative, dirname, join } = await path;
  const { readFile, mkdir, writeFile } = await fs;

  const inName = relative(entry, dirname(file));
  const contents = await transform(await readFile(file), inName);
  const name = await rename(relative(entry, file), contents);
  const targerDir = join(outDir, relative(entry, dirname(file)));
  const targetFile = join(targerDir, name);

  await mkdir(targerDir, { recursive: true });
  await writeFile(targetFile, contents);

  return { [relative(entry, file)]: relative(outDir, targetFile) };
}

export async function cmpl({
  entry,
  outDir,
  recursive = true,
  rename,
  transform,
  include = () => true,
  fs = import('node:fs/promises'),
  path = import('node:path'),
}: CmplOptions) {
  const manifest: Record<string, string> = {};
  const { relative, join, dirname } = await path;
  const { readdir, stat } = await fs;
  const processOpts = {
    entry,
    outDir,
    rename,
    transform,
    fs,
    path,
  };

  const read = async (dir: string): Promise<void> => {
    await Promise.all(
      (
        await readdir(dir)
      ).map(async (f) => {
        if ((await stat(join(dir, f))).isDirectory()) {
          if (recursive && include(relative(entry, join(dir, f)), true)) {
            return read(join(dir, f));
          } else {
            return;
          }
        }

        if (include(relative(entry, join(dir, f)), false)) {
          Object.assign(manifest, await prcss(join(dir, f), processOpts));
        }
      }),
    );
  };

  if (!(await stat(entry)).isDirectory()) {
    return prcss(entry, { ...processOpts, entry: dirname(entry) });
  }

  await read(entry);

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
}

export async function* wtch({
  signal,
  entry,
  outDir,
  recursive = true,
  rename,
  transform,
  include = () => true,
  fs = import('node:fs/promises'),
  path = import('node:path'),
}: WtchOpts) {
  const cmplOpts = {
    entry,
    outDir,
    recursive,
    rename,
    transform,
    include,
    fs,
    path,
  };
  const { join, dirname } = await path;
  const { watch, stat } = await fs;

  const manifest = await cmpl(cmplOpts);
  yield Object.assign({}, manifest);

  const isDir = (await stat(entry)).isDirectory();
  const baseDir = isDir ? entry : dirname(entry);
  const prcssOpts = isDir
    ? cmplOpts
    : {
        ...cmplOpts,
        entry: baseDir,
      };

  for await (const event of watch(entry, {
    recursive: isDir ? recursive : false,
    signal: signal,
  })) {
    switch (event.eventType) {
      case 'change':
        if (include(event.filename, true)) {
          Object.assign(
            manifest,
            await prcss(join(baseDir, event.filename), prcssOpts),
          );
          yield Object.assign({}, manifest);
        }
        break;
      case 'rename':
        if (manifest[event.filename]) {
          delete manifest[event.filename];
          yield Object.assign({}, manifest);
        } else if (include(event.filename, true)) {
          Object.assign(
            manifest,
            await prcss(join(baseDir, event.filename), prcssOpts),
          );
          yield Object.assign({}, manifest);
        }
        break;
    }
  }
}
