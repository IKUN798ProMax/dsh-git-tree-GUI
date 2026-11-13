/**
 * Sub-repository discovery for one DSH workspace (local patch).
 *
 * A workspace is not always itself a git repository: it is often an umbrella
 * folder holding several independent checkouts one or two levels down
 * (`<workspace>/前端/lingxi-ui`, `<workspace>/后端/summing-server2`). The
 * upstream plugin only ever asked `git rev-parse --show-toplevel` about the
 * workspace root, so such a workspace had no branch chip at all.
 *
 * This walker reports every repository under the workspace, bounded by depth,
 * directory count and repository count, never descending into a repository it
 * already found (a repository is a boundary — nested submodule checkouts are
 * not separate entries). Build/artifact directories and hidden directories are
 * skipped: they neither are nor contain a working checkout a user manages here.
 *
 * @module dsh-git-graph/host/repo-discovery
 */

import { readdir } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'

/** How deep below the workspace the walk goes (`前端/lingxi-ui` is depth 2). */
export const DEFAULT_MAX_DEPTH = 3
/** Directory-visit budget: one runaway tree must not stall the host. */
export const DEFAULT_MAX_DIRS = 20000
/** Repository budget: the chip's picker is a menu, not an inventory. */
export const DEFAULT_MAX_REPOS = 100
/** Parallel `git status` probes (one spawn each). */
const STATUS_CONCURRENCY = 4

/** Directories that never hold a checkout the user means to switch branches in. */
const SKIP_DIRS = new Set([
  'node_modules', 'bower_components',
  'dist', 'build', 'out', 'target', 'coverage', 'release',
  '.next', '.nuxt', '.output', '.turbo', '.cache', '.parcel-cache', '.svelte-kit',
  '.venv', 'venv', 'env', '.tox', '__pycache__', 'site-packages',
  '.gradle', '.mvn', 'Pods', 'DerivedData', 'vendor',
  '.pnpm-store', 'tmp', 'temp', 'logs',
])

/** A hidden directory is tooling state, not a project root. */
function isSkipped(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.')
}

/**
 * Breadth-first walk for `.git` markers.
 * @param workspace - canonical workspace root.
 * @param maxDepth - levels below the root to visit (0 = the root only).
 * @param maxDirs - directory budget.
 * @returns the repository roots in visit order, and whether a budget cut the walk.
 */
async function walk(workspace, maxDepth, maxDirs) {
  const repos = []
  const seen = new Set([workspace])
  let frontier = [{ dir: workspace, depth: 0 }]
  let visited = 0
  let truncated = false
  while (frontier.length > 0) {
    const next = []
    for (const { dir, depth } of frontier) {
      visited += 1
      if (visited > maxDirs) {
        truncated = true
        break
      }
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      // Any `.git` entry (directory for a normal checkout, file for a linked
      // worktree or a submodule) marks this directory as a repository root.
      if (entries.some(entry => entry.name === '.git')) {
        repos.push(dir)
        continue
      }
      if (depth >= maxDepth) continue
      for (const entry of entries) {
        if (!entry.isDirectory() || isSkipped(entry.name)) continue
        const child = join(dir, entry.name)
        if (seen.has(child)) continue
        seen.add(child)
        next.push({ dir: child, depth: depth + 1 })
      }
    }
    if (truncated) break
    frontier = next
  }
  return { repos, truncated }
}

/**
 * Parse the porcelain-v2 status summary into the fields the chip needs.
 * Byte-for-byte the same counting rules as the plugin's own parser (ordinary
 * and rename records are dirty, `?` untracked, `u` conflicts), plus the short
 * head taken from `# branch.oid`.
 * @param stdout - `git status --porcelain=v2 --branch` output.
 */
export function parseStatusSummary(stdout) {
  let dirtyFiles = 0
  let untrackedFiles = 0
  let conflicts = 0
  let headName = null
  let oid = null
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    if (line.startsWith('#')) {
      const header = /^# branch\.(oid|head) (.*)$/.exec(line)
      if (header !== null) {
        if (header[1] === 'oid') oid = header[2].trim()
        else headName = header[2].trim()
      }
      continue
    }
    const type = line[0]
    if (type === '1' || type === '2') dirtyFiles += 1
    else if (type === '?') untrackedFiles += 1
    else if (type === 'u') conflicts += 1
    else if (type === '!') continue
    else dirtyFiles += 1
  }
  const unborn = oid === '(initial)'
  const branch = headName === null || headName.startsWith('(') || unborn ? '' : headName
  const head = oid === null || unborn ? '' : oid.slice(0, 7)
  return { branch, head, dirtyFiles, untrackedFiles, conflicts }
}

/**
 * `git for-each-ref` over local and remote branches, with the fields the
 * sidebar tree renders. `%(symref)` marks symbolic refs (`origin/HEAD`), which
 * are dropped: they are aliases, not branches.
 */
const REFS_FORMAT = '%(refname)%00%(refname:short)%00%(objectname:short)%00%(HEAD)%00%(symref)%00%(upstream:short)%00%(upstream:track,nobracket)'

/**
 * Parse `%(upstream:track,nobracket)` — "" | "ahead 2" | "behind 1" |
 * "ahead 2, behind 1" | "gone".
 * @param track - the track string.
 */
export function parseTrack(track) {
  const ahead = /ahead (\d+)/.exec(track)
  const behind = /behind (\d+)/.exec(track)
  return {
    ahead: ahead === null ? 0 : Number(ahead[1]),
    behind: behind === null ? 0 : Number(behind[1]),
  }
}

/** Argv for the local + remote branch listing. */
export const refsArgv = () => ['for-each-ref', 'refs/heads', 'refs/remotes', `--format=${REFS_FORMAT}`]

/**
 * Parse the branch listing into local and remote rows.
 * @param stdout - `git for-each-ref` output in {@link REFS_FORMAT}.
 */
export function parseRefs(stdout) {
  const locals = []
  const remotes = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const [refname, short, shortOid, headMark, symref, upstream, track] = line.split('\u0000')
    if (refname === void 0 || short === void 0 || short === '') continue
    if (symref !== void 0 && symref !== '') continue
    if (refname.startsWith('refs/heads/')) {
      const counts = parseTrack(track ?? '')
      locals.push({
        name: short,
        head: shortOid ?? '',
        current: headMark === '*',
        upstream: upstream ?? '',
        ahead: counts.ahead,
        behind: counts.behind,
      })
    } else if (refname.startsWith('refs/remotes/')) {
      const slash = short.indexOf('/')
      remotes.push({
        name: short,
        remote: slash === -1 ? short : short.slice(0, slash),
        branch: slash === -1 ? '' : short.slice(slash + 1),
        head: shortOid ?? '',
      })
    }
  }
  locals.sort((a, b) => a.name.localeCompare(b.name))
  remotes.sort((a, b) => a.name.localeCompare(b.name))
  return { locals, remotes }
}

/**
 * One repository's read view: `git status` (and optionally the branch refs),
 * never a mutation.
 * @param runner - the git runner seam.
 * @param root - repository root.
 * @param withRefs - also list local and remote branches.
 */
async function probe(runner, root, withRefs = false) {
  const [result, refsResult] = await Promise.all([
    runner.run(['status', '--porcelain=v2', '--branch'], root),
    withRefs ? runner.run(refsArgv(), root) : Promise.resolve(null),
  ])
  let stats
  if (result.exitCode !== 0) {
    // An unreadable repository (broken gitdir, permissions) is still a
    // repository: keep the row so the user sees why it is unusable.
    stats = { branch: '', head: '', dirtyFiles: 0, untrackedFiles: 0, conflicts: 0 }
  } else {
    stats = parseStatusSummary(result.stdout)
  }
  if (!withRefs) return stats
  const refs = refsResult !== null && refsResult.exitCode === 0
    ? parseRefs(refsResult.stdout)
    : { locals: [], remotes: [] }
  return { ...stats, ...refs }
}

/** Map with a fixed concurrency cap, preserving order. */
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      out[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return out
}

/**
 * Every git repository at or below one workspace.
 * @param runner - the host's git runner seam (`run(argv, cwd)`).
 * @param workspace - canonical workspace root.
 * @param opts - depth/budget overrides.
 * @returns `{ workspace, repos, truncated }`; `repos` is ordered with the
 *   workspace's own checkout first, then by relative path.
 */
export async function discoverRepos(runner, workspace, opts = {}) {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxDirs = opts.maxDirs ?? DEFAULT_MAX_DIRS
  const maxRepos = opts.maxRepos ?? DEFAULT_MAX_REPOS
  const { repos, truncated } = await walk(workspace, maxDepth, maxDirs)
  const limited = repos.slice(0, maxRepos)
  const entries = await mapLimit(limited, STATUS_CONCURRENCY, async (root) => {
    const stats = await probe(runner, root, opts.withRefs === true)
    const rel = relative(workspace, root).split(sep).join('/')
    return {
      root,
      name: basename(root) || root,
      relative: rel,
      main: root === workspace,
      ...stats,
    }
  })
  entries.sort((a, b) => {
    if (a.main !== b.main) return a.main ? -1 : 1
    return a.relative.localeCompare(b.relative)
  })
  return { workspace, repos: entries, truncated: truncated || repos.length > limited.length }
}
