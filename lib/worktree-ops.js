/**
 * Worktree-level verbs for the Commit / Log tabs (local patch).
 *
 * Status, staging, commit, stash, and one-commit detail — the commands behind
 * the WebStorm-style "Changes" tree and the commit inspector. Pure argv
 * builders and parsers; the service owns gating and guards.
 *
 * @module dsh-git-graph/host/worktree-ops
 */

/** Refuse anything that could be read as a git option. */
export function safePathArgs(files) {
  if (!Array.isArray(files)) return null
  const out = []
  for (const file of files) {
    if (typeof file !== 'string' || file === '' || file.startsWith('-')) return null
    if (file.includes('\u0000')) return null
    out.push(file)
  }
  return out
}

/** `git status --porcelain=v1 -z --untracked-files=all`. */
export const statusFilesArgv = () => ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all']

/**
 * Parse porcelain v1 in NUL mode into the three groups the changes tree shows.
 * Rename/copy records carry the original path as a second NUL field.
 * @param stdout - the status output.
 */
export function parseStatusFiles(stdout) {
  const staged = []
  const unstaged = []
  const untracked = []
  const conflicts = []
  const parts = stdout.split('\u0000')
  let index = 0
  while (index < parts.length) {
    const entry = parts[index]
    index += 1
    if (entry === undefined || entry === '') continue
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    let original
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      original = parts[index]
      index += 1
    }
    if (x === '?' ) {
      untracked.push({ path, code: '?', original })
      continue
    }
    if (x === '!' ) continue
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      conflicts.push({ path, code: 'U', original })
      continue
    }
    if (x !== ' ' && x !== '') staged.push({ path, code: x, original })
    if (y !== ' ' && y !== '') unstaged.push({ path, code: y, original })
  }
  return { staged, unstaged, untracked, conflicts }
}

/** `git add -- <files>`. */
export const stageArgv = (files) => ['add', '--', ...files]

/** `git reset -q HEAD -- <files>` — unstage without touching the worktree. */
export const unstageArgv = (files) => ['reset', '-q', 'HEAD', '--', ...files]

/** `git checkout -- <files>` — discard worktree edits (destructive). */
export const discardArgv = (files) => ['checkout', '--', ...files]

/** `git clean -f -- <files>` — remove untracked files (destructive). */
export const cleanArgv = (files) => ['clean', '-f', '--', ...files]

/** `git commit -m <message>`. */
export const commitArgv = (message) => ['commit', '-m', message]

/** `git stash list` with the reflog subject and the commit date. */
export const stashListArgv = () => ['stash', 'list', '--format=%gd%x00%gs%x00%ci']

/** `git stash push -m <message>`. */
export const stashPushArgv = (message) => ['stash', 'push', '-m', message]

/** `git stash apply|pop|drop <ref>`. */
export const stashArgv = (verb, ref) => ['stash', verb, ref]

/** `git show -s` metadata for one commit (author and committer both carried). */
export const commitMetaArgv = (oid) => [
  'show', '-s',
  '--format=%H%x00%h%x00%an%x00%ae%x00%cn%x00%ce%x00%at%x00%ct%x00%P%x00%s%x00%b',
  oid,
]

/**
 * `git diff-tree` file list for one commit.
 *
 * `-c core.quotePath=false` keeps non-ASCII paths as UTF-8 instead of git's
 * octal C-quoting, and `--root` makes the first commit list its files too.
 */
export const commitFilesArgv = (oid) => ['-c', 'core.quotePath=false', 'diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '--no-renames', oid]

/**
 * Parse the `%gd%x00%gs%x00%ci` stash listing.
 * @param stdout - the stash list output.
 */
export function parseStashList(stdout) {
  const stashes = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const [ref, subject, date] = line.split('\u0000')
    if (ref === undefined || ref === '') continue
    stashes.push({ ref, subject: subject ?? '', date: date ?? '' })
  }
  return stashes
}

/**
 * Parse one commit's metadata line.
 * @param stdout - the `%H%x00%h%x00%an%x00%ae%x00%cn%x00%ce%x00%at%x00%ct%x00%P%x00%s%x00%b` output.
 */
export function parseCommitMeta(stdout) {
  const [oid, short, author, authorEmail, committer, committerEmail, authoredAt, committedAt, parents, subject, body] = stdout.split('\u0000')
  return {
    oid: oid ?? '',
    short: short ?? '',
    author: author ?? '',
    authorEmail: authorEmail ?? '',
    committer: committer ?? '',
    committerEmail: committerEmail ?? '',
    authorTime: Number(authoredAt ?? '0') || 0,
    commitTime: Number(committedAt ?? '0') || 0,
    parents: parents === undefined || parents === '' ? [] : parents.split(' ').filter(Boolean),
    subject: subject ?? '',
    body: (body ?? '').trim(),
  }
}

/**
 * Parse `git diff-tree --name-status` rows.
 * @param stdout - the listing.
 */
export function parseCommitFiles(stdout) {
  const files = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const parts = line.split('\t')
    if (parts.length < 2) continue
    files.push({ code: parts[0], path: parts[parts.length - 1] })
  }
  return files
}

/** `git diff --no-color [--cached] -- <file>` — working-tree or index patch. */
/** Context lines requested from git: effectively the whole file (WebStorm shows it all). */
export const DIFF_CONTEXT = 1000000

export const diffWorktreeArgv = (file, staged) => staged === true
  ? ['diff', '--no-color', `--unified=${DIFF_CONTEXT}`, '--cached', '--', file]
  : ['diff', '--no-color', `--unified=${DIFF_CONTEXT}`, '--', file]

/** `git show --no-color --format= <oid> -- <file>` — one commit's patch for a file. */
export const diffCommitArgv = (oid, file) => ['show', '--no-color', '--format=', '--no-ext-diff', `--unified=${DIFF_CONTEXT}`, oid, '--', file]

/** `git diff --no-index -- /dev/null <file>` — unversioned file seen as all-additions. */
export const diffUntrackedArgv = (file) => ['diff', '--no-color', '--no-index', `--unified=${DIFF_CONTEXT}`, '--', '/dev/null', file]
