// Both browser suites share the same explicit evidence-write boundary.
import {mkdir, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export async function createEvidenceCapture(suite) {
  const root = process.env.COCKPIT_EVIDENCE_DIR;
  const directory = root
    ? suite === 'selector'
      ? root
      : join(root, suite)
    : await mkdtemp(join(tmpdir(), `clawonshape-${suite}-`));
  const only = process.env.COCKPIT_EVIDENCE_FILES?.split(',').filter(Boolean);
  return {
    directory,
    async screenshot(page, filename, options = {}) {
      const relative = suite === 'selector' ? filename : `${suite}/${filename}`;
      if (only && !only.includes(relative)) {
        return;
      }
      await mkdir(directory, {recursive: true});
      await page.screenshot({...options, path: join(directory, filename)});
    },
  };
}
