import { cp, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
if (remote !== 'https://github.com/stefanavesand/OpenCatan.git') throw new Error('Publish target must be the intended stefanavesand/OpenCatan fork');
execFileSync(process.execPath, ['scripts/build-pwa.mjs'], { cwd: root, stdio: 'inherit' });
const directory = await mkdtemp(path.join(tmpdir(), 'hello-ipad-publish-'));
const args = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];
const git = (...command) => execFileSync('git', [...args, ...command], { cwd: directory, encoding: 'utf8' }).trim();
try {
  git('init', '--initial-branch=gh-pages');
  git('remote', 'add', 'origin', remote);
  const found = spawnSync('git', [...args, 'ls-remote', '--exit-code', '--heads', 'origin', 'refs/heads/gh-pages'], { cwd: directory, encoding: 'utf8' });
  if (found.status === 0) {
    git('fetch', '--depth=1', 'origin', 'gh-pages');
    git('checkout', '-B', 'gh-pages', 'FETCH_HEAD');
    git('rm', '-r', '--ignore-unmatch', '.');
  } else if (found.status !== 2) throw new Error(found.stderr || 'Cannot inspect the publishing branch');
  await cp(path.join(root, 'pwa-dist'), directory, { recursive: true });
  git('config', 'user.name', execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim());
  git('config', 'user.email', execFileSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).trim());
  git('add', '.');
  if (git('status', '--porcelain')) {
    git('commit', '-m', 'Publish verified Hello iPad offline package');
    git('push', 'origin', 'HEAD:refs/heads/gh-pages');
  }
  process.stdout.write(`Published static branch: ${git('rev-parse', 'HEAD')}\n`);
  process.stdout.write('Site URL after Pages is enabled: https://stefanavesand.github.io/OpenCatan/hello/\n');
} finally { await rm(directory, { recursive: true, force: true }); }
