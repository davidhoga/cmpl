/// <reference types="types-node-test" />

import test from 'node:test';
import assert from 'node:assert';
import { relative, join } from 'node:path';
import { cmpl, cntntHsh, wtch, WatchFs, WatchEvent } from './index';

test('copies over a single file', async () => {
  const fs = createFs(
    [
      { method: 'stat', path: 'test.json', isDir: false },
      { method: 'readFile', path: 'test.json', contents: '{"hi":"ho"}' },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test.json',
        contents: '{"hi":"ho"}',
      },
    ],
    __dirname,
  );

  assert.deepEqual(
    await cmpl({
      entry: join(__dirname, 'test.json'),
      outDir: join(__dirname, 'dist'),
      fs,
    }),
    { 'test.json': 'test.json' },
  );
  fs.done();
});

test('copies single file in directory', async () => {
  const fs = createFs(
    [
      { method: 'stat', path: '', isDir: true },
      { method: 'readdir', path: '', contents: ['test.json'] },
      { method: 'stat', path: 'test.json', isDir: false },
      { method: 'readFile', path: 'test.json', contents: '{"hi":"ho"}' },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test.json',
        contents: '{"hi":"ho"}',
      },
    ],
    __dirname,
  );

  assert.deepEqual(
    await cmpl({
      entry: __dirname,
      outDir: join(__dirname, 'dist'),
      fs,
    }),
    { 'test.json': 'test.json' },
  );
  fs.done();
});

test('copies files in nested directories', async () => {
  const fs = createFs(
    [
      { method: 'stat', path: '', isDir: true },
      { method: 'readdir', path: '', contents: ['test.json', 'deep'] },
      { method: 'stat', path: 'test.json', isDir: false },
      { method: 'stat', path: 'deep', isDir: true },
      { method: 'readdir', path: 'deep', contents: ['test2.json'] },
      { method: 'stat', path: 'deep/test2.json', isDir: false },
      { method: 'readFile', path: 'test.json', contents: '{"hi":"ho"}' },
      {
        method: 'readFile',
        path: 'deep/test2.json',
        contents: '{"hü":"hott"}',
      },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test.json',
        contents: '{"hi":"ho"}',
      },
      { method: 'mkdir', path: 'dist/deep' },
      {
        method: 'writeFile',
        path: 'dist/deep/test2.json',
        contents: '{"hü":"hott"}',
      },
    ],
    __dirname,
  );

  assert.deepEqual(
    await cmpl({
      entry: __dirname,
      outDir: join(__dirname, 'dist'),
      fs,
    }),
    {
      'deep/test2.json': 'deep/test2.json',
      'test.json': 'test.json',
    },
  );
  fs.done();
});

test('it ignores nested folders', async () => {
  const fs = createFs(
    [
      { method: 'stat', path: '', isDir: true },
      { method: 'readdir', path: '', contents: ['test.json', 'deep'] },
      { method: 'stat', path: 'test.json', isDir: false },
      { method: 'stat', path: 'deep', isDir: true },
      { method: 'readFile', path: 'test.json', contents: '{"hi":"ho"}' },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test.json',
        contents: '{"hi":"ho"}',
      },
    ],
    __dirname,
  );

  assert.deepEqual(
    await cmpl({
      entry: __dirname,
      recursive: false,
      outDir: join(__dirname, 'dist'),
      fs,
    }),
    {
      'test.json': 'test.json',
    },
  );
  fs.done();
});

test('it ignores specific files', async () => {
  const fs = createFs(
    [
      { method: 'stat', path: '', isDir: true },
      {
        method: 'readdir',
        path: '',
        contents: ['test.json', 'test2.json', 'deep'],
      },
      { method: 'stat', path: 'test.json', isDir: false },
      { method: 'stat', path: 'test2.json', isDir: false },
      { method: 'stat', path: 'deep', isDir: true },
      { method: 'readFile', path: 'test.json', contents: '{"hi":"ho"}' },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test.json',
        contents: '{"hi":"ho"}',
      },
    ],
    __dirname,
  );

  let i = 0;
  assert.deepEqual(
    await cmpl({
      entry: __dirname,
      recursive: false,
      include: (name, isDir) => {
        switch (i++) {
          case 0:
            assert.equal(name, 'test.json');
            assert.equal(isDir, false);
            break;
          case 1:
            assert.equal(name, 'test2.json');
            assert.equal(isDir, false);
            break;
          case 0:
            assert.equal(name, 'deep');
            assert.equal(isDir, true);
            break;
        }
        return name === 'test.json';
      },
      outDir: join(__dirname, 'dist'),
      fs,
    }),
    {
      'test.json': 'test.json',
    },
  );
  fs.done();
});

test('it transforms contents', async () => {
  const fs = createFs(
    [
      { method: 'stat', path: 'test.json', isDir: false },
      {
        method: 'readFile',
        path: 'test.json',
        contents: 'rofl',
      },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test.json',
        contents: 'leeeeel',
      },
    ],
    __dirname,
  );

  assert.deepEqual(
    await cmpl({
      entry: join(__dirname, 'test.json'),
      transform: (content, file) => {
        assert.equal(file, '');
        assert.equal(content.toString(), 'rofl');
        return Buffer.from('leeeeel');
      },
      outDir: join(__dirname, 'dist'),
      fs,
    }),
    {
      'test.json': 'test.json',
    },
  );
  fs.done();
});

test('it applies content hashes', async () => {
  const fs = createFs(
    [
      { method: 'stat', path: 'test.json', isDir: false },
      {
        method: 'readFile',
        path: 'test.json',
        contents: '{"hi":"ho"}',
      },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test-DF67FD3A.json',
        contents: '{"hi":"ho"}',
      },
    ],
    __dirname,
  );

  assert.deepEqual(
    await cmpl({
      entry: join(__dirname, 'test.json'),
      rename: cntntHsh(8),
      outDir: join(__dirname, 'dist'),
      fs,
    }),
    {
      'test.json': 'test-DF67FD3A.json',
    },
  );
  fs.done();
});

test('it creates custom file names', async () => {
  const fs = createFs(
    [
      { method: 'stat', path: 'test.json', isDir: false },
      {
        method: 'readFile',
        path: 'test.json',
        contents: '{"hi":"ho"}',
      },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/q3p45giunrfd.f35r',
        contents: '{"hi":"ho"}',
      },
    ],
    __dirname,
  );

  assert.deepEqual(
    await cmpl({
      entry: join(__dirname, 'test.json'),
      rename: (name, content) => {
        assert.equal(name, 'test.json');
        assert.equal(content.toString(), '{"hi":"ho"}');
        return 'q3p45giunrfd.f35r';
      },
      outDir: join(__dirname, 'dist'),
      fs,
    }),
    {
      'test.json': 'q3p45giunrfd.f35r',
    },
  );
  fs.done();
});

test('watches single file', async () => {
  const ac = new AbortController();
  const watcher = createWatcher(ac.signal);
  const fs = createFs(
    [
      { method: 'stat', path: 'test.json', isDir: false },
      {
        method: 'readFile',
        path: 'test.json',
        contents: '{"hi":"ho"}',
      },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test-DF.json',
        contents: '{"hi":"ho"}',
      },
      { method: 'stat', path: 'test.json', isDir: false },
      {
        method: 'watch',
        path: 'test.json',
        options: { recursive: false, signal: ac.signal },
        watcher,
      },
      {
        method: 'readFile',
        path: 'test.json',
        contents: '{"ho":"hi"}',
      },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test-9E.json',
        contents: '{"ho":"hi"}',
      },
    ],
    __dirname,
  );

  const wtchr = wtch({
    signal: ac.signal,
    rename: cntntHsh(2),
    entry: join(__dirname, 'test.json'),
    outDir: join(__dirname, 'dist'),
    fs,
  });

  let i = 0;
  for await (const manifest of wtchr) {
    switch (i++) {
      case 0:
        assert.deepEqual(manifest, {
          'test.json': 'test-DF.json',
        });
        watcher.emit({ eventType: 'change', filename: 'test.json' });
        break;
      case 1:
        assert.deepEqual(manifest, {
          'test.json': 'test-9E.json',
        });
        ac.abort();
        break;
      default:
        throw new Error('NEIN');
    }
  }
  fs.done();
});

test('ignores newly added files', async () => {
  const ac = new AbortController();
  const watcher = createWatcher(ac.signal);
  const fs = createFs(
    [
      { method: 'stat', path: '', isDir: true },
      { method: 'readdir', path: '', contents: ['test.json'] },
      { method: 'stat', path: 'test.json', isDir: false },
      {
        method: 'readFile',
        path: 'test.json',
        contents: '{"hi":"ho"}',
      },
      { method: 'mkdir', path: 'dist' },
      {
        method: 'writeFile',
        path: 'dist/test.json',
        contents: '{"hi":"ho"}',
      },
      { method: 'stat', path: '', isDir: true },
      {
        method: 'watch',
        path: '',
        options: { recursive: true, signal: ac.signal },
        watcher,
      },
    ],
    __dirname,
  );

  const wtchr = wtch({
    signal: ac.signal,
    entry: __dirname,
    include: (name) => name === 'test.json',
    outDir: join(__dirname, 'dist'),
    fs,
  });

  let i = 0;
  for await (const manifest of wtchr) {
    switch (i++) {
      case 0:
        assert.deepEqual(manifest, {
          'test.json': 'test.json',
        });
        watcher.emit({ eventType: 'change', filename: 'test2.json' });
        ac.abort();
        break;
      default:
        throw new Error('NEIN');
    }
  }
  fs.done();
});

interface ExpectedReaddir {
  method: 'readdir';
  path: string;
  contents: string[] | Error;
}
interface ExpectedStat {
  method: 'stat';
  path: string;
  isDir: boolean | Error;
}
interface ExpectedMkdir {
  method: 'mkdir';
  path: string;
  error?: Error;
}
interface ExpectedReadFile {
  method: 'readFile';
  path: string;
  contents: Buffer | string | Error;
}
interface ExpectedWriteFile {
  method: 'writeFile';
  path: string;
  contents: Buffer | string | Error;
}
interface ExpectedWatch {
  method: 'watch';
  path: string;
  options: { recursive?: boolean; signal?: AbortSignal };
  watcher: AsyncIterable<WatchEvent> | Error;
}

type ExpectedCall =
  | ExpectedReaddir
  | ExpectedStat
  | ExpectedMkdir
  | ExpectedReadFile
  | ExpectedWriteFile
  | ExpectedWatch;

function createWatcher(signal: AbortSignal) {
  let next:
    | null
    | [(value: IteratorResult<WatchEvent>) => void, (err: Error) => void];

  let lastVal: WatchEvent | null = null;

  signal.addEventListener('abort', async () => {
    await new Promise((res) => setImmediate(res));
    if (!next) {
      throw new Error('NO NEXT');
    }
    next[0]({ value: lastVal, done: true });
  });
  return {
    async emit(event: WatchEvent | Error) {
      await new Promise((res) => setImmediate(res));
      if (!next) {
        throw new Error('NO NEXT');
      }
      if (event instanceof Error) {
        next[1](event);
      } else {
        lastVal = event;
        next[0]({ value: event });
      }
      next = null;
    },
    [Symbol.asyncIterator]: () => ({
      next(): Promise<IteratorResult<WatchEvent>> {
        return new Promise<IteratorResult<WatchEvent>>((res, rej) => {
          next = [res, rej];
        });
      },
    }),
  };
}

function createFs(
  expectedCalls: ExpectedCall[],
  baseDir: string,
): WatchFs & { done: () => void } {
  let i = 0;
  const getNextCall = <M extends ExpectedCall>(
    method: M['method'],
    args: any,
  ): M => {
    // console.log(`${i++} --- fs.${method}(${JSON.stringify(args)})`);
    const next = expectedCalls.shift();
    assert.ok(next !== undefined, `Unexpected call to fs.${method}`);
    const { method: exMeth, ...exArgs } = next;
    assert.ok(
      exMeth === method,
      `Expected fs.${exMeth}(${JSON.stringify(
        exArgs,
      )}) call - got fs.${method}(${JSON.stringify(args)})`,
    );
    return next as any;
  };
  // let
  return {
    readdir: async (dir) => {
      const { path, contents } = getNextCall<ExpectedReaddir>(
        'readdir',
        relative(baseDir, dir),
      );
      assert.equal(relative(baseDir, dir), path);
      if (contents instanceof Error) {
        throw contents;
      }
      return contents;
    },
    stat: async (p) => {
      const { path, isDir } = getNextCall<ExpectedStat>(
        'stat',
        relative(baseDir, p),
      );
      assert.equal(relative(baseDir, p), path);
      if (isDir instanceof Error) {
        throw isDir;
      }
      return {
        isDirectory: () => isDir,
      };
    },
    mkdir: async (p) => {
      const { path, error } = getNextCall<ExpectedMkdir>(
        'mkdir',
        relative(baseDir, p),
      );
      assert.equal(relative(baseDir, p), path);
      if (error) {
        throw error;
      }
      return undefined;
    },
    readFile: async (p) => {
      const { path, contents } = getNextCall<ExpectedReadFile>(
        'readFile',
        relative(baseDir, p),
      );
      assert.equal(relative(baseDir, p), path);
      if (contents instanceof Error) {
        throw contents;
      }
      return contents instanceof Buffer ? contents : Buffer.from(contents);
    },
    writeFile: async (p, c) => {
      const { path, contents } = getNextCall<ExpectedWriteFile>('writeFile', [
        relative(baseDir, p),
        c,
      ]);
      assert.equal(relative(baseDir, p), path);
      if (contents instanceof Error) {
        throw contents;
      }
      assert.equal(c.toString(), contents.toString());
    },
    watch: (p, o) => {
      const { path, options, watcher } = getNextCall<ExpectedWatch>('watch', [
        relative(baseDir, p),
        o,
      ]);
      assert.equal(relative(baseDir, p), path);
      assert.deepEqual(options, o);
      if (watcher instanceof Error) {
        throw watcher;
      }

      return watcher;
    },
    done() {
      assert.ok(
        expectedCalls.length === 0,
        `Got ${expectedCalls.length} trailing expectations on fs`,
      );
    },
  };
}
