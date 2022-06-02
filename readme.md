# cmpl

> no deps, no operations, no vowels

just a tiny framework to apply transformations and renaming to single files
or files in a folder. You know because gulp is to old and stuff...

this one makes 0 assumptions on the content/type of a file and by default
just copies over the entry to outDir.

I've build this for cases where a big and complex compiler is just overkill
and if we think this misses a feature we're probably better of using a real
project like esbuild, microbundle or webpack.

## Install

```
npm install cmpl
```

## Usage

```ts
import { cmpl, wtch, CmplOptions } from 'cmpl';

const options: CmplOptions = {
  /* path to entry file or directory */
  entry: __dirname,
  /* path to directory where files should be moved to */
  outDir: __dirname + '/out',
  /* if entry is directory, do we care about child dirs? */
  // recursive?: boolean;
  /* function to transform file contents */
  // transform?: TransformFn;
  /* function to determine the output name based on input name and 
     transformed content */
  // rename?: FileNamerFn;
  /* filter function to determine if a file should be included */
  // include?: (name: string) => boolean;
  /* might be a custom node:path implementation */
  // path?: Path | Promise<Path>;
  /* might be a custom node:fs implementation */
  // fs?: Fs | Promise<Fs>;
};

// copies all files in __dirname into ./out
const mnfst = await cmpl(options);
console.log(mnfst);

// copies all files in __dirname into ./out and update when files change
const ac = new AbortController();
for await (const mnfst of wtch({
  signal: ac.signal,
  ...options,
})) {
  console.log(mnfst);
}
```
