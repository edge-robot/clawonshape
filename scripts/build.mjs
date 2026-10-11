import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
await mkdir('dist', {recursive: true});
for (const file of await readdir('src')) {
  if (!file.endsWith('.ts')) continue;
  const source = await readFile(`src/${file}`, 'utf8');
  const output = stripTypeScriptTypes(source, {mode: 'strip'}).replaceAll(/(from\s+['"]\.\/[^'"]+)\.ts(['"])/g, '$1.js$2');
  await writeFile(`dist/${file.replace(/\.ts$/, '.js')}`, output);
}
