// Builds maeth on this machine and puts it on the home server.
//
// Two pieces go up together as one release, `releases/<time>-<commit>/`:
//   web/     the client, which Caddy serves at /maeth/ straight from disk;
//   api.mjs  the API, one bundled file (no node_modules on the server), run by
//            the `maeth-api` systemd unit from `current/api.mjs`.
// The `current` symlink is swapped with a single `mv -T` (an atomic rename), so
// a page loading at that moment gets the old build or the new one, never a mix.
// Then the API process is ended and systemd (Restart=always) starts it again
// from the new release — no sudo needed for that, the process is ours.
//
// Built here, not on the server: its CPU is weak and it has no sources.
// Settings live in `.env.deploy` (not in git): DEPLOY_HOST, and optionally
// DEPLOY_DIR (/srv/maeth), DEPLOY_BASE_PATH (/maeth), DEPLOY_API_PORT (3110).
// One-time server setup (directories, unit, Caddy route): deploy/server-setup.sh.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const host = process.env.DEPLOY_HOST
const dir = process.env.DEPLOY_DIR || '/srv/maeth'
const base = `/${(process.env.DEPLOY_BASE_PATH ?? '/maeth').replace(/^\/+|\/+$/g, '')}/`
const apiPort = Number(process.env.DEPLOY_API_PORT ?? 3110)
// How many earlier releases to keep for a manual rollback (`ln -sfn releases/<…> current`).
const KEEP = 3

const step = (message) => console.log(`[deploy] ${message}`)

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, {
    cwd: repo,
    stdio: 'inherit',
    shell: process.platform === 'win32' && (command === 'npm' || command === 'npx'),
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${argv[0] ?? ''} failed (${result.status ?? result.signal})`)
  return result.stdout
}

const read = (command, argv) => run(command, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'"

/** tar of a local folder → ssh: streamed, no temporary archive on disk. */
function upload(from, remote) {
  return new Promise((resolve, reject) => {
    // The folder goes in as cwd, not `-C`: Git for Windows' tar reads `C:\…` as `host:path`.
    const tar = spawn('tar', ['-cf', '-', '.'], { cwd: from, stdio: ['ignore', 'pipe', 'inherit'] })
    const ssh = spawn('ssh', ['-o', 'BatchMode=yes', host, `bash -c ${quote(remote)}`], { stdio: ['pipe', 'inherit', 'inherit'] })
    tar.stdout.pipe(ssh.stdin)
    let left = 2
    const done = (name) => (code) => {
      if (code !== 0) reject(new Error(`${name} failed (${code})`))
      else if (--left === 0) resolve()
    }
    tar.on('error', reject).on('close', done('tar'))
    ssh.on('error', reject).on('close', done('ssh'))
  })
}

async function deploy() {
  if (!host || host.startsWith('-')) throw new Error('set DEPLOY_HOST=user@host in .env.deploy')
  if (!dir.startsWith('/') || dir.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('DEPLOY_DIR must be an absolute path on the server')
  }
  if (read('git', ['status', '--porcelain']) && !args.has('--dirty')) {
    throw new Error('uncommitted changes: commit them (or pass --dirty to deploy the working tree as is)')
  }
  const commit = read('git', ['rev-parse', '--short', 'HEAD'])
  if (!args.has('--no-push')) run('git', ['push'])

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'maeth-deploy-'))
  try {
    step(`building ${commit} for ${base}`)
    run('npx', ['tsc', '-b'])
    // BASE_PATH through the environment, not `--base=/maeth/` on the command
    // line: Git Bash would rewrite that argument into a Windows path.
    run('npx', ['vite', 'build', `--outDir=${path.join(out, 'web')}`, '--emptyOutDir'], {
      env: { ...process.env, BASE_PATH: base },
    })
    if (!fs.existsSync(path.join(out, 'web', 'index.html'))) throw new Error('build produced no index.html')
    run('npm', ['run', 'build:server', '--', `--outfile=${path.join(out, 'api.mjs')}`])
    fs.writeFileSync(path.join(out, 'COMMIT'), `${commit}\n`)

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-')
    const release = `${stamp}-${commit}`
    const remote = [
      'set -eu',
      `root=${quote(dir)}`,
      'test -w "$root" || { echo "[deploy] $root is missing or not writable: run deploy/server-setup.sh once" >&2; exit 1; }',
      'test -f "$root/shared/.env" || { echo "[deploy] $root/shared/.env is missing (server secrets)" >&2; exit 1; }',
      `rel="$root/releases/${release}"`,
      'mkdir -p "$rel"',
      'tar -xf - -C "$rel"',
      'chmod -R a+rX "$rel/web"',
      // A new symlink beside the old one, then a rename over it: an atomic swap.
      `ln -sfn "releases/${release}" "$root/.current.new"`,
      'mv -T "$root/.current.new" "$root/current"',
      // Restart the API on the new code: end the process, systemd starts it again.
      'pid=$(systemctl show -p MainPID --value maeth-api.service 2>/dev/null || echo 0)',
      '[ "${pid:-0}" != 0 ] && kill "$pid" || echo "[deploy] maeth-api had no running process; systemd is retrying it"',
      `ls -1d "$root"/releases/*/ | head -n -${KEEP + 1} | xargs -r rm -rf --`,
      // Wait for the API to answer on the new build, then check Caddy serves both halves.
      'ok=""',
      `for i in $(seq 1 30); do sleep 1; if curl -sf -o /dev/null http://127.0.0.1:${apiPort}/api/ping; then ok=1; break; fi; done`,
      '[ -n "$ok" ] || { echo "[deploy] the API did not come back: journalctl -u maeth-api -n 50" >&2; exit 1; }',
      `for path in ${base} ${base}api/ping; do`,
      '  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1$path")',
      '  [ "$code" = 200 ] || { echo "[deploy] caddy answered $code at $path" >&2; exit 1; }',
      'done',
    ].join('\n')
    step(`uploading to ${host}:${dir}/releases/${release}`)
    await upload(out, remote)
    step(`${commit} is live at ${base}`)
  } finally {
    fs.rmSync(out, { recursive: true, force: true })
  }
}

try {
  await deploy()
} catch (error) {
  console.error(`[deploy] ${error.message}`)
  process.exitCode = 1
}
