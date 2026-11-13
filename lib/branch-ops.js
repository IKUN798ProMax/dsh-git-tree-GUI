/**
 * Branch-level git verbs for the sidebar panel (local patch).
 *
 * Pure argv builders and parsers for the WebStorm-style branch context menu:
 * per-branch log, upstream ahead/behind, delete, new-branch-from, pull, push
 * and merge. The service owns gating and guards; this module owns the command
 * shapes and the parsing of their output.
 *
 * Every builder takes the ref as data, never as shell text: argv is spawned
 * without a shell, and the service additionally rejects refs that start with
 * `-` so an option cannot be smuggled into the ref position.
 *
 * @module dsh-git-graph/host/branch-ops
 */

/** A ref that starts with `-` would be read as an option; the service rejects it. */
export function isSafeRef(ref) {
  return typeof ref === 'string' && ref !== '' && !ref.startsWith('-')
}

/**
 * `git log <ref>` with the fields the log pane renders. `%D` carries the
 * decorations (`HEAD -> main, origin/main, tag: v1.0`).
 * @param ref - branch name or remote ref.
 * @param limit - maximum number of commits.
 */
export const logArgv = (ref, limit) => [
  'log',
  '--topo-order',
  `--format=%H%x00%h%x00%an%x00%at%x00%cn%x00%ct%x00%s%x00%P%x00%D`,
  `--max-count=${limit}`,
  ref,
  '--',
]

/**
 * Parse one `git log` page.
 * @param stdout - the log output.
 */
export function parseLog(stdout) {
  const commits = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const [oid, short, author, at, committer, committedAt, subject, parents, decorations] = line.split('\u0000')
    if (oid === undefined || oid === '') continue
    commits.push({
      oid,
      short: short ?? oid.slice(0, 7),
      author: author ?? '',
      authorTime: Number(at ?? '0') || 0,
      committer: committer ?? '',
      commitTime: Number(committedAt ?? '0') || 0,
      subject: subject ?? '',
      parents: parents === undefined || parents === '' ? [] : parents.split(' ').filter(parent => parent !== ''),
      refs: decorations === undefined || decorations === ''
        ? []
        : decorations.split(',').map(part => part.trim()).filter(part => part !== ''),
    })
  }
  return commits
}

/** `git rev-parse --abbrev-ref <ref>@{upstream}` — the tracking branch, if any. */
export const upstreamArgv = (ref) => ['rev-parse', '--abbrev-ref', `${ref}@{upstream}`]

/** `git rev-list --left-right --count <upstream>...<ref>` — behind<TAB>ahead. */
export const aheadBehindArgv = (ref, upstream) => ['rev-list', '--left-right', '--count', `${upstream}...${ref}`]

/**
 * Parse the left-right count: the left side counts commits only in the
 * upstream (behind), the right side only in the branch (ahead).
 * @param stdout - "behind\tahead" or an empty string.
 */
export function parseAheadBehind(stdout) {
  const parts = stdout.trim().split(/\s+/)
  const behind = Number.parseInt(parts[0] ?? '', 10)
  const ahead = Number.parseInt(parts[1] ?? '', 10)
  return {
    behind: Number.isFinite(behind) ? behind : 0,
    ahead: Number.isFinite(ahead) ? ahead : 0,
  }
}

/** `git branch -d|-D <name>` — local branch removal. */
export const deleteBranchArgv = (name, force) => ['branch', force === true ? '-D' : '-d', name]

/** `git switch --no-guess -c <name> <ref>` — create at <ref> and check out. */
export const createBranchFromArgv = (name, ref) => ['switch', '--no-guess', '-c', name, ref]

/** `git pull --ff-only` — update the current branch from its upstream. */
export const pullArgv = () => ['pull', '--ff-only']

/** `git fetch --prune <remote>` — refresh one remote's refs. */
export const fetchArgv = (remote) => ['fetch', '--prune', remote]

/** `git push` — publish the current branch (upstream must exist). */
export const pushArgv = () => ['push']

/** `git merge --no-edit <ref>` — merge <ref> into the current branch. */
export const mergeArgv = (ref) => ['merge', '--no-edit', ref]

/** `git rev-list --count <ref>` — total commits the branch points at. */
export const countArgv = (ref) => ['rev-list', '--count', ref]

/**
 * Classify a failed branch verb by its stderr. The service's switch path keeps
 * its own classifier for the shared switch codes; these are the extra verbs.
 * @param command - the verb that failed.
 * @param stderr - git's message.
 */
export function classifyBranchFailure(command, stderr) {
  const text = String(stderr ?? '')
  const lower = text.toLowerCase()
  if (command === 'delete') {
    if (lower.includes('not fully merged')) {
      return { code: 'branch-not-merged', message: text.trim() || 'the branch is not fully merged' }
    }
    if (lower.includes('not found')) {
      return { code: 'target-branch-not-found', message: text.trim() || 'the branch does not exist' }
    }
    if (lower.includes('checked out') || lower.includes('used by worktree')) {
      return { code: 'branch-checked-out', message: text.trim() || 'the branch is checked out' }
    }
  }
  if (command === 'merge' && (lower.includes('conflict') || lower.includes('自动合并失败'))) {
    return { code: 'merge-conflicts', message: text.trim() || 'the merge has conflicts' }
  }
  if (command === 'pull' || command === 'push') {
    if (lower.includes('no upstream') || lower.includes('no tracking information')) {
      return { code: 'no-upstream', message: text.trim() || 'the branch has no upstream' }
    }
    if (lower.includes('non-fast-forward') || lower.includes('rejected')) {
      return { code: 'push-rejected', message: text.trim() || 'the push was rejected' }
    }
  }
  return { code: 'internal', message: text.trim() || `${command} failed` }
}
