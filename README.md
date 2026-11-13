# dsh-git-tree-GUI

A Git panel for **DeepSeek Harness** (`dsh`): a branch tree with per-branch commit logs,
a WebStorm-style **Log / Commit / Stash** window, branch actions on right-click, whole-file
diffs you can edit, and remote-ahead notifications.

> Fork of [`@linxin666/dsh-client-ui-git-graph`](https://www.npmjs.com/package/@linxin666/dsh-client-ui-git-graph)
> 0.4.14 (Apache-2.0). The upstream author retired that plugin; this fork keeps it going and
> adds the features below. See [PATCH.md](PATCH.md) for the exact delta. Not affiliated with
> the upstream author.

## Install

```sh
dsh plugin --profile desktop add github:IKUN798ProMax/dsh-git-tree-GUI
```

Use your own profile name instead of `desktop` (`web`, …). Requires `dsh >= 0.2.1-rc.3`.
Restart the host, then refresh the page; a **Git** row appears in the sidebar.

## Features

**Branch chip (blank sessions).** A workspace that is not itself a repository still gets a
branch chip: the plugin scans its subfolders (depth 3) and offers every checkout it finds.
With more than one repository the chip reads `repo · branch` and the popover gains a picker.

**Sidebar panel — three tabs.**

- **Log** — branch tree (`HEAD` / local / remote) with ↑ahead ↓behind badges, a branch filter,
  a coloured commit graph, subject, refs, **author → committer** and date columns, and a
  text/hash filter. Click a commit for a details dialog; click a changed file for its diff.
- **Commit** — the working tree per repository, split into staged / changes / unversioned,
  each file carrying a status letter and a file-type badge (Vue, TS, MD, IMG …), with
  stage / unstage / discard, a message box and commit.
- **Stash** — the `git stash` list with apply / pop / drop, plus "shelve current changes".

**Branch actions.** Left-click only selects a branch (never checks out). Right-click opens
checkout / new branch from / update / fetch / push / merge / delete / copy name.

**Remote awareness.** Opening the panel fetches remotes (at most once per five minutes);
branches behind their upstream raise a banner and a tab badge.

**Diffs.** Clicking a changed file opens a whole-file side-by-side diff (git is asked for
unlimited context, so the entire file is shown, not just the hunks). `‹ n / N ›` jumps between
change blocks, the layout is one horizontally scrolling table with a sticky line-number column,
and uncommitted worktree files can be **edited and saved** from the viewer (atomic write).

## Notes

- Every git operation runs in the host process behind the plugin's own `/git/*` routes; the
  browser never spawns git. Routes accept only paths inside a registered workspace and only
  loopback (or paired) clients.
- The "stash" tab is real `git stash`; WebStorm's shelf format is IDE-private and is not
  reproduced.
- One anonymous install heartbeat per UTC day (random localStorage id + package name) is
  inherited from upstream; see PATCH.md.

## Layout

| Path | What |
| --- | --- |
| `lib/index.js` | host half: git service, `/git/*` routes, opt-in agent tool |
| `lib/client.js` | browser half: branch chip, sidebar panel, diffs |
| `lib/repo-discovery.js` | sub-repository discovery + ref/track parsing |
| `lib/branch-ops.js` | branch verbs (log, sync, delete, create, pull, push, merge) |
| `lib/worktree-ops.js` | status, staging, commit, stash, diff argv/parsers |
| `cordis.patch.yml` | bundle patch inserting the row into the profile |

## License

Apache-2.0 — upstream copyright belongs to the original author; modifications are described
in [PATCH.md](PATCH.md).
