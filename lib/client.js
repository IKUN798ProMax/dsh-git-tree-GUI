window.__ModuleLoader__.load({
	id: "@linxin666/dsh-client-ui-git-graph",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/sse-leader.ts
		/** Live relays keyed by event name + URL (one per tab, ref-counted by listeners). */
		const relays = /* @__PURE__ */ new Map();
		/**
		* Subscribe to an SSE endpoint shared across every tab of the browser.
		* @param url - same-origin EventSource URL (including its query string).
		* @param eventName - the SSE event field to listen for (e.g. 'change').
		* @param onEvent - fired with the raw event data string on every push.
		* @param seams - constructor overrides (tests).
		* @returns the disposer; destroying the LAST local listener tears the relay down.
		*/
		function subscribeSharedEvents(url, eventName, onEvent, seams = {}) {
			const key = eventName + " " + url;
			let relay = relays.get(key);
			if (relay === void 0) {
				relay = createRelay(key, url, eventName, seams);
				relays.set(key, relay);
			}
			relay.listeners.add(onEvent);
			return () => {
				const current = relays.get(key);
				if (current === void 0) return;
				current.listeners.delete(onEvent);
				if (current.listeners.size === 0) {
					current.destroy();
					relays.delete(key);
				}
			};
		}
		function createRelay(key, url, eventName, seams) {
			const listeners = /* @__PURE__ */ new Set();
			const dispatch = (data) => {
				for (const listener of [...listeners]) listener(data);
			};
			const EventSourceImpl = seams.eventSource ?? EventSource;
			const ChannelImpl = seams.broadcastChannel ?? (typeof BroadcastChannel === "undefined" ? void 0 : BroadcastChannel);
			const locks = seams.locks ?? (typeof navigator === "undefined" || navigator.locks === void 0 ? void 0 : navigator.locks);
			if (ChannelImpl === void 0 || locks === void 0) {
				const source = new EventSourceImpl(url);
				source.addEventListener(eventName, (raw) => {
					dispatch(raw.data);
				});
				return {
					listeners,
					destroy: () => {
						source.close();
					}
				};
			}
			const channel = new ChannelImpl("dsh-sse:" + key);
			channel.addEventListener("message", (raw) => {
				dispatch(raw.data);
			});
			const abort = new AbortController();
			let release;
			let source;
			locks.request("dsh-sse:" + key, { signal: abort.signal }, () => {
				source = new EventSourceImpl(url);
				source.addEventListener(eventName, (raw) => {
					const data = raw.data;
					channel.postMessage(data);
					dispatch(data);
				});
				return new Promise((resolve) => {
					release = resolve;
				});
			}).catch(() => {});
			return {
				listeners,
				destroy() {
					channel.close();
					abort.abort();
					release?.();
					source?.close();
				}
			};
		}
		//#endregion
		//#region src/client/api.ts
		/**
		* Browser client for the host /git/* routes: typed JSON envelope calls plus
		* the SSE change subscription. Same-origin relative fetch (the page and the
		* routes share the webserver).
		* @module dsh-git-graph/client/api
		*/
		/** Transport failure (fetch threw or the response was not JSON). */
		const TRANSPORT_ERROR = {
			code: "internal",
			message: "git route unavailable"
		};
		/**
		* POST one JSON payload and decode the envelope; never throws.
		*
		* `path` is DOCUMENT-RELATIVE (no leading slash): the harness serves the GUI
		* with `<base href="./">`, so a sub-path deployment resolves the route
		* against its entry directory. A root-absolute path escapes that prefix and
		* never reaches the host route (issue #1707); the official client posts its
		* own routes the same way.
		*/
		async function post(path, payload) {
			let response;
			try {
				response = await fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
			} catch {
				return {
					ok: false,
					error: TRANSPORT_ERROR
				};
			}
			try {
				const envelope = await response.json();
				if (typeof envelope !== "object" || envelope === null) return {
					ok: false,
					error: TRANSPORT_ERROR
				};
				const record = envelope;
				if (record.ok === true) return {
					ok: true,
					value: record.value
				};
				return {
					ok: false,
					error: record.error ?? TRANSPORT_ERROR
				};
			} catch {
				return {
					ok: false,
					error: TRANSPORT_ERROR
				};
			}
		}
		/** Typed git operations over the wire. */
		var GitApi = class {
			/** The repository snapshot (null: not a git repository / not a workspace). */
			status(path) {
				return post("git/status", { path });
			}
			/** Local branch list with the current branch marked. */
			branches(path) {
				return post("git/branches", { path });
			}
			/** Workspace-level `git switch --no-guess <branch>` (host guards first). */
			switchBranch(path, branch) {
				return post("git/switch", {
					path,
					branch
				});
			}
			/** `git switch --no-guess -c <name>` from the current HEAD. */
			createBranch(path, name) {
				return post("git/create-branch", {
					path,
					name
				});
			}
			/** Topo-ordered commit graph across branches/tags/remotes. */
			graph(path, limit) {
				return post("git/graph", limit === void 0 ? { path } : {
					path,
					limit
				});
			}
			/** All linked worktrees of the workspace's repository. */
			worktrees(path) {
				return post("git/worktrees", { path });
			}
			/** Create a managed worktree on a new wt/<name> branch (host picks the path). */
			addWorktree(path, name, baseRef) {
				return post("git/worktree-add", baseRef === void 0 ? {
					path,
					name
				} : {
					path,
					name,
					baseRef
				});
			}
			/** Remove a managed worktree (dirty rejects unless force; deleteBranch drops the wt/ branch). */
			removeWorktree(path, worktreePath, opts) {
				return post("git/worktree-remove", {
					path,
					worktreePath,
					force: opts?.force === true,
					deleteBranch: opts?.deleteBranch === true
				});
			}
			/** The live feature config (auto-isolation flags + managed worktree home). */
			config() {
				return post("git/config", {});
			}
			/**
			* Local patch: every git repository at or below the workspace. A workspace
			* that is not itself a repository is usually an umbrella folder holding a
			* few independent checkouts; each becomes a selectable target.
			*/
			discover(path) {
				return post("git/discover", { path });
			}
			/**
			* Local patch: the sidebar overview — every repository under the workspace
			* with its local and remote branches (read-only).
			*/
			overview(path) {
				return post("git/overview", { path });
			}
			/** Local patch: one branch's commit log. */
			branchLog(path, ref, limit) {
				return post("git/log", limit === void 0 ? { path, ref } : { path, ref, limit });
			}
			/** Local patch: ahead/behind against the branch's upstream. */
			branchSync(path, ref) {
				return post("git/sync", { path, ref });
			}
			/** Local patch: delete one local branch. */
			deleteBranch(path, name, force) {
				return post("git/branch-delete", { path, name, force: force === true });
			}
			/** Local patch: create a branch at an existing ref and check it out. */
			createBranchFrom(path, name, ref) {
				return post("git/branch-create-from", { path, name, ref });
			}
			/** Local patch: `pull --ff-only` the current branch. */
			pullBranch(path, ref) {
				return post("git/pull", { path, ref });
			}
			/** Local patch: fetch one remote. */
			fetchRemote(path, remote) {
				return post("git/fetch", { path, remote });
			}
			/** Local patch: push the current branch. */
			pushBranch(path) {
				return post("git/push", { path });
			}
			/** Local patch: merge a ref into the current branch. */
			mergeBranch(path, ref) {
				return post("git/merge", { path, ref });
			}
			/** Local patch: working-tree status (staged / unstaged / untracked). */
			files(path) {
				return post("git/files", { path });
			}
			/** Local patch: stage / unstage / discard / clean selected paths. */
			fileOp(path, verb, files) {
				return post("git/file-op", { path, verb, files });
			}
			/** Local patch: commit the current index. */
			commit(path, message) {
				return post("git/commit", { path, message });
			}
			/** Local patch: the stash list. */
			stashList(path) {
				return post("git/stash-list", { path });
			}
			/** Local patch: stash push / apply / pop / drop. */
			stashOp(path, verb, ref, message) {
				return post("git/stash", { path, verb, ref, message });
			}
			/** Local patch: one commit's metadata and changed files. */
			commitDetail(path, oid) {
				return post("git/commit-detail", { path, oid });
			}
			/** Local patch: unified diff of one file (worktree / index / commit). */
			fileDiff(path, file, opts = {}) {
				return post("git/diff", { path, file, oid: opts.oid, stage: opts.stage });
			}
			/** Local patch: read a working-tree file as text (diff editor). */
			fileContent(path, file) {
				return post("git/file-content", { path, file });
			}
			/** Local patch: overwrite a working-tree file. */
			writeFile(path, file, content) {
				return post("git/file-write", { path, file, content });
			}
		};
		/**
		* Subscribe to host-pushed branch-state changes for one workspace path (the
		* host polls the workspace while a subscriber is connected). Reconnects are
		* handled by the EventSource; the caller re-subscribes when the path changes.
		* @param path - workspace root to watch.
		* @param onChange - fired on every pushed change.
		* @returns the disposer closing the stream.
		*/
		function subscribeChanges(path, onChange) {
			return subscribeSharedEvents(`git/events?path=${encodeURIComponent(path)}`, "change", () => {
				onChange();
			});
		}
		//#endregion
		//#region \0dsh-css:packages/dsh-git-graph/src/client/chips/context.module.css.mjs
		const css = "._7rgC5q_anchor{position:relative}._7rgC5q_chipWrap{display:inline-flex;position:relative}._7rgC5q_anchorHero{align-items:center;padding-left:0;display:inline-flex}._7rgC5q_chip{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-tool-bar-fill);height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;border-radius:999px;align-items:center;gap:6px;padding:0 10px;font-size:12px;line-height:1;transition:background-color .12s,border-color .12s,color .12s,gap .12s,padding .12s;display:inline-flex}._7rgC5q_chip:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_chip:active{background:var(--dsw-alias-interactive-bg-active)}._7rgC5q_chip:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);outline:none}._7rgC5q_chip:disabled{opacity:.55;cursor:not-allowed}._7rgC5q_chip:disabled:hover{background:var(--dsw-alias-button-tool-bar-fill)}._7rgC5q_chipOpen{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}._7rgC5q_chipLabel{text-overflow:ellipsis;max-width:220px;overflow:hidden}._7rgC5q_chipChevron{color:var(--dsw-alias-label-tertiary)}._7rgC5q_chipHero{max-width:min(100%,240px);height:auto;min-height:28px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:16px;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}._7rgC5q_chipHero:hover,._7rgC5q_chipHero:active,._7rgC5q_chipHero._7rgC5q_chipOpen{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_chipHero ._7rgC5q_chipLabel{max-width:180px}._7rgC5q_chipHero ._7rgC5q_chipChevron{color:var(--dsw-alias-label-caption)}._7rgC5q_backdrop{z-index:30;position:fixed;inset:0}._7rgC5q_popover{z-index:100;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:280px;max-height:360px;box-shadow:var(--dsw-shadow-lv3);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);left:0;overflow:hidden}._7rgC5q_popoverHero{top:calc(100% + 4px);bottom:auto}._7rgC5q_popoverUp{top:auto;bottom:calc(100% + 8px)}._7rgC5q_popoverDown{top:calc(100% + 4px);bottom:auto}._7rgC5q_searchBox{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);border:2px solid #0000;border-radius:8px;align-items:center;gap:6px;margin:8px;padding:6px 10px;transition:border-color .12s,box-shadow .12s;display:flex}._7rgC5q_searchBox:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:none}body[data-ds-dark-theme] ._7rgC5q_searchBox{background:var(--dsw-alias-bg-base)}._7rgC5q_searchInput{min-width:0;color:var(--dsw-alias-label-primary);background:0 0;border:none;outline:none;flex:1;font-size:13px;transition:box-shadow .12s}._7rgC5q_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}._7rgC5q_list{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2) transparent;flex:1;min-height:64px;max-height:178px;padding:2px 6px 6px;overflow:hidden auto}._7rgC5q_list::-webkit-scrollbar{width:6px}._7rgC5q_list::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2);border-radius:3px}._7rgC5q_list::-webkit-scrollbar-track{background:0 0}._7rgC5q_item{box-sizing:border-box;cursor:pointer;text-align:left;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;width:100%;min-width:0;max-width:100%;padding:7px 8px;transition:background-color .12s;display:flex;position:relative}._7rgC5q_item:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_item:active{background:var(--dsw-alias-interactive-bg-active)}._7rgC5q_item:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);outline:none}._7rgC5q_item:disabled{opacity:.55;cursor:not-allowed}._7rgC5q_item:disabled:hover{background:0 0}._7rgC5q_itemText{flex:1;min-width:0}._7rgC5q_itemName{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:13px;display:block;overflow:hidden}._7rgC5q_itemPath{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);margin-top:1px;font-size:11px;overflow:hidden}._7rgC5q_check{color:var(--dsw-alias-brand-primary);flex:none}._7rgC5q_empty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:14px 10px;font-size:12px}._7rgC5q_dirty{color:var(--dsw-alias-state-warn-primary);margin:0 10px 4px;font-size:11px}._7rgC5q_notice{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-state-error-primary);border-radius:8px;margin:0 8px 8px;padding:6px 10px;font-size:12px}._7rgC5q_noticeOk{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary)}._7rgC5q_footer{border-top:1px solid var(--dsw-alias-border-l1);flex-direction:column;gap:2px;padding:6px;display:flex}._7rgC5q_footerItem{cursor:pointer;color:var(--dsw-alias-label-primary);text-align:left;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:7px 10px;font-size:13px;transition:background-color .12s;display:flex}._7rgC5q_footerItem:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_footerItem:active{background:var(--dsw-alias-interactive-bg-active)}._7rgC5q_footerItem:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);outline:none}._7rgC5q_footerItem:disabled{opacity:.55;cursor:not-allowed}._7rgC5q_footerItem:disabled:hover{background:0 0}._7rgC5q_footerItemDisabled{opacity:.55;cursor:not-allowed}._7rgC5q_footerItemDisabled:hover{background:0 0}._7rgC5q_footerHint{color:var(--dsw-alias-label-tertiary);margin-left:auto;font-size:11px}._7rgC5q_dialog{z-index:50;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);width:min(760px,100vw - 48px);max-height:min(76vh,720px);box-shadow:0 12px 32px var(--dsw-alias-bg-mask-2);border-radius:12px;flex-direction:column;padding:16px 16px 12px;display:flex;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)}._7rgC5q_dialogHeader{justify-content:space-between;align-items:flex-start;gap:12px;padding:0 4px;display:flex}._7rgC5q_dialogHeading{min-width:0}._7rgC5q_dialogClose{width:26px;height:26px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:8px;flex:none;justify-content:center;align-items:center;margin:-2px;transition:background-color .12s,color .12s;display:inline-flex}._7rgC5q_dialogClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._7rgC5q_dialogClose:active{background:var(--dsw-alias-interactive-bg-active)}._7rgC5q_dialogClose:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);outline:none}._7rgC5q_dialogTitle{color:var(--dsw-alias-label-primary);margin:0 0 2px;font-size:15px;font-weight:600}._7rgC5q_dialogDescription{color:var(--dsw-alias-label-secondary);margin:0 0 12px;font-size:12px;line-height:1.5}._7rgC5q_dialogField{flex-direction:column;gap:6px;display:flex}._7rgC5q_dialogLabel{color:var(--dsw-alias-label-secondary);font-size:12px}._7rgC5q_dialogInput{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;outline:none;padding:8px 10px;font-size:13px;transition:border-color .12s,box-shadow .12s}._7rgC5q_dialogInput:focus{border-color:var(--dsw-alias-brand-primary)}._7rgC5q_dialogInput:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}._7rgC5q_dialogError{color:var(--dsw-alias-state-error-primary);margin-top:8px;font-size:12px}._7rgC5q_dialogActions{justify-content:flex-end;gap:8px;margin-top:14px;display:flex}._7rgC5q_dialogButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-tool-bar-fill);color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:8px;padding:6px 14px;font-size:13px;transition:background-color .12s,border-color .12s,color .12s}._7rgC5q_dialogButton:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_dialogButton:active{background:var(--dsw-alias-interactive-bg-active)}._7rgC5q_dialogButton:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);outline:none}._7rgC5q_dialogButton:disabled{opacity:.55;cursor:not-allowed}._7rgC5q_dialogButton:disabled:hover{background:var(--dsw-alias-button-tool-bar-fill)}._7rgC5q_dialogButtonPrimary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-button-contrast-fill);transition:background-color .12s,border-color .12s,filter .12s}._7rgC5q_dialogButtonPrimary:hover{background:var(--dsw-alias-button-primary-hover)}._7rgC5q_dialogButtonPrimary:active{filter:brightness(.92)}._7rgC5q_dialogButtonPrimary:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-button-contrast-fill), 0 0 0 4px var(--dsw-alias-brand-primary);outline:none}._7rgC5q_dialogButtonPrimary:disabled{opacity:.6;cursor:not-allowed}._7rgC5q_dialogButtonPrimary:disabled:hover{background:var(--dsw-alias-brand-primary)}._7rgC5q_graphBody{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;flex:1;min-height:240px;margin-top:10px;padding:4px;overflow-y:auto}._7rgC5q_graphSubtitle{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px}._7rgC5q_graphRow{border-radius:8px;align-items:center;gap:10px;padding:7px 8px;font-size:12px;display:flex}._7rgC5q_graphRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_graphLanes{color:var(--dsw-alias-label-tertiary);flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.4;display:flex}._7rgC5q_graphLaneCell{text-align:center;flex:none;width:15px;display:inline-block}._7rgC5q_graphLaneNode,._7rgC5q_graphLaneMerge{color:var(--dsw-alias-brand-primary);font-weight:700}._7rgC5q_graphLanePass{color:var(--dsw-alias-label-tertiary)}._7rgC5q_graphOid{min-width:58px;color:var(--dsw-alias-label-tertiary);flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}._7rgC5q_graphMain{flex-direction:column;flex:1;gap:3px;min-width:0;display:flex}._7rgC5q_graphSubject{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;overflow:hidden}._7rgC5q_graphMeta{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:11px;display:flex}._7rgC5q_graphMetaSep{color:var(--dsw-alias-label-tertiary);flex:none}._7rgC5q_graphRef{text-overflow:ellipsis;background:var(--dsw-alias-bg-layer-2);max-width:120px;color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 6px;font-size:10px;overflow:hidden}._7rgC5q_graphRefCurrent{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-button-contrast-fill)}[data-gitgraph-chip-anchor][data-gitgraph-stock-light]{--gitgraph-stock-ink-rgb:15, 17, 21;--gitgraph-stock-ink:#0f1115;--gitgraph-stock-on-success:#fff;--gitgraph-stock-success-fill:#137333;--gitgraph-stock-success-border:#0f5f2b;--dsw-alias-button-tool-bar-fill:rgba(var(--gitgraph-stock-ink-rgb), .04);--dsw-alias-button-tool-bar-hover:rgba(var(--gitgraph-stock-ink-rgb), .08);--dsw-alias-border-l2:rgba(var(--gitgraph-stock-ink-rgb), .16);--dsw-alias-interactive-bg-hover:rgba(var(--gitgraph-stock-ink-rgb), .06);--dsw-alias-interactive-bg-active:rgba(var(--gitgraph-stock-ink-rgb), .1);--dsw-alias-label-primary:var(--gitgraph-stock-ink);--dsw-alias-label-secondary:var(--gitgraph-stock-ink);--dsw-alias-label-tertiary:rgba(var(--gitgraph-stock-ink-rgb), .56);--dsw-alias-button-contrast-fill:var(--gitgraph-stock-on-success)}[data-gitgraph-chip-anchor][data-gitgraph-stock-light] ._7rgC5q_noticeOk{background:var(--gitgraph-stock-success-fill);color:var(--gitgraph-stock-on-success);box-shadow:inset 0 0 0 1px var(--gitgraph-stock-success-border)}._7rgC5q_graphEmpty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 10px;font-size:12px}._7rgC5q_graphMore{border:1px solid var(--dsw-alias-border-l1);width:100%;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:8px;margin-top:8px;padding:6px;font-size:12px;transition:background-color .12s;display:block}._7rgC5q_graphMore:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_graphMore:active{background:var(--dsw-alias-interactive-bg-active)}._7rgC5q_graphMore:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);outline:none}@media (prefers-reduced-motion:reduce){._7rgC5q_chip,._7rgC5q_searchBox,._7rgC5q_searchInput,._7rgC5q_item,._7rgC5q_footerItem,._7rgC5q_dialogClose,._7rgC5q_dialogInput,._7rgC5q_dialogButton,._7rgC5q_dialogButtonPrimary,._7rgC5q_graphMore{transition:none}}._7rgC5q_item:after{content:attr(data-tip);z-index:80;background:var(--dsw-alias-label-primary,#111);color:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l1,#ffffff40);white-space:normal;word-break:break-all;box-shadow:var(--dsw-shadow-lv3);pointer-events:none;border-radius:8px;padding:6px 8px;font-size:12px;line-height:1.5;display:none;position:absolute;bottom:calc(100% + 4px);left:0;right:0}._7rgC5q_item[data-tip=\"\"]:after{display:none!important}._7rgC5q_item[data-tip-dir=down]:after{top:calc(100% + 4px);bottom:auto}._7rgC5q_item[data-tip-ready=true]:hover:after{display:block}._7rgC5q_managerList{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;flex:1;min-height:120px;margin-top:10px;padding:4px;overflow-y:auto}._7rgC5q_managerRow{border-radius:8px;justify-content:space-between;align-items:flex-start;gap:10px;padding:8px;font-size:12px;display:flex}._7rgC5q_managerRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_managerInfo{flex-direction:column;flex:1;gap:3px;min-width:0;display:flex}._7rgC5q_managerHeadline{color:var(--dsw-alias-label-primary);align-items:center;gap:6px;display:flex}._7rgC5q_managerBranch{text-overflow:ellipsis;white-space:nowrap;font-weight:500;overflow:hidden}._7rgC5q_managerBadge{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 6px;font-size:10px}._7rgC5q_managerOid{color:var(--dsw-alias-label-tertiary);flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}._7rgC5q_managerPath{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;overflow:hidden}._7rgC5q_managerConfirm{color:var(--dsw-alias-state-error-primary);align-items:center;gap:8px;margin-top:2px;font-size:12px;display:flex}._7rgC5q_managerActions{flex-direction:column;flex:none;align-items:flex-end;gap:6px;display:flex}._7rgC5q_managerCheck{color:var(--dsw-alias-label-secondary);cursor:pointer;align-items:center;gap:4px;font-size:11px;display:flex}._7rgC5q_repoSection{display:flex;flex-direction:column;gap:1px;max-height:140px;overflow-y:auto;border-bottom:1px solid var(--dsw-alias-border-l1);padding:6px 6px 4px;scrollbar-width:thin}._7rgC5q_repoHeading{color:var(--dsw-alias-label-tertiary);padding:0 8px 2px;font-size:11px}._7rgC5q_repoRow{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:6px 8px;border:none;border-radius:8px;background:0 0;color:inherit;text-align:left;cursor:pointer;transition:background-color .12s}._7rgC5q_repoRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_repoRow:active{background:var(--dsw-alias-interactive-bg-active)}._7rgC5q_repoRow:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);outline:none}._7rgC5q_repoRowActive{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_repoText{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}._7rgC5q_repoName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:13px}._7rgC5q_repoMeta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px}._7rgC5q_panel{box-sizing:border-box;height:100%;overflow-y:auto;padding:20px 24px 32px;color:var(--dsw-alias-label-primary);font-size:13px}._7rgC5q_panelHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}._7rgC5q_panelHeading{display:flex;flex-direction:column;gap:2px;min-width:0}._7rgC5q_panelTitle{font-size:16px;font-weight:600;line-height:1.3}._7rgC5q_panelSub{color:var(--dsw-alias-label-tertiary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_panelToolbar{display:flex;align-items:center;gap:8px;flex:none}._7rgC5q_panelSelect{height:28px;max-width:220px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px}._7rgC5q_panelRefresh{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-button-tool-bar-fill);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}._7rgC5q_panelRefresh:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_panelRefresh:disabled{opacity:.55;cursor:not-allowed}._7rgC5q_panelNotice{margin-bottom:10px;padding:6px 10px;border-radius:8px;font-size:12px;background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-state-error-primary)}._7rgC5q_panelNoticeOk{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary)}._7rgC5q_panelBody{display:flex;flex-direction:column;gap:14px}._7rgC5q_panelEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:18px 0;text-align:center}._7rgC5q_repoBlock{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px 12px;background:var(--dsw-alias-bg-layer-2)}._7rgC5q_repoHead{display:flex;align-items:center;gap:8px;min-width:0;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}._7rgC5q_repoName{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_repoPath{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_repoStats{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}._7rgC5q_refGroup{display:flex;flex-direction:column;gap:1px;margin-bottom:8px}._7rgC5q_refGroup:last-child{margin-bottom:0}._7rgC5q_refGroupTitle{color:var(--dsw-alias-label-tertiary);font-size:11px;padding:2px 6px}._7rgC5q_refRow{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:4px 6px;border:none;border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}._7rgC5q_refRow:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._7rgC5q_refRow:disabled{cursor:default}._7rgC5q_refRowActive{color:var(--dsw-alias-label-primary);font-weight:600;background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_refRowRemote{cursor:default;color:var(--dsw-alias-label-tertiary)}._7rgC5q_refDot{flex:none;width:12px;text-align:center;font-size:9px;color:var(--dsw-alias-brand-primary)}._7rgC5q_refRowRemote ._7rgC5q_refDot{color:var(--dsw-alias-label-tertiary)}._7rgC5q_refName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_refOid{flex:none;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}._7rgC5q_refBusy{flex:none;color:var(--dsw-alias-brand-primary);font-size:11px}._7rgC5q_panel{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}._7rgC5q_panelBody{display:flex;flex-direction:row;align-items:stretch;gap:14px;flex:1;min-height:0}._7rgC5q_tree{flex:0 0 320px;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:2px}._7rgC5q_logPane{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}._7rgC5q_logHead{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}._7rgC5q_logBranch{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46%}._7rgC5q_logSync{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}._7rgC5q_logAhead{color:var(--dsw-alias-state-success-primary)}._7rgC5q_logBehind{color:var(--dsw-alias-state-warn-primary)}._7rgC5q_logUpstream{color:var(--dsw-alias-label-secondary)}._7rgC5q_logList{flex:1;min-height:0;overflow:auto;padding:4px}._7rgC5q_logRow{display:flex;align-items:flex-start;gap:8px;padding:5px 8px;border-radius:6px;font-size:12px}._7rgC5q_logRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_logLanes{flex:none;display:flex;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.4}._7rgC5q_logLaneCell{flex:none;width:13px;text-align:center;display:inline-block}._7rgC5q_logLaneNode,._7rgC5q_logLaneMerge{color:var(--dsw-alias-brand-primary);font-weight:700}._7rgC5q_logLanePass{color:var(--dsw-alias-label-tertiary)}._7rgC5q_logOid{flex:none;min-width:56px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;padding-top:1px}._7rgC5q_logMain{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}._7rgC5q_logSubject{font-size:13px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_logMeta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;font-size:11px;color:var(--dsw-alias-label-tertiary)}._7rgC5q_logMetaSep{color:var(--dsw-alias-label-tertiary)}._7rgC5q_logRef{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 6px;font-size:10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_logRefCurrent{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-button-contrast-fill)}._7rgC5q_logEmpty{color:var(--dsw-alias-label-tertiary);text-align:center;font-size:12px;padding:34px 12px}._7rgC5q_logMore{border:1px solid var(--dsw-alias-border-l1);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:8px;width:100%;padding:6px;margin:6px 0;font-size:12px;cursor:pointer}._7rgC5q_logMore:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_menuBackdrop{z-index:900;position:fixed;inset:0}._7rgC5q_menu{z-index:901;position:fixed;display:flex;flex-direction:column;gap:1px;padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:10px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3)}._7rgC5q_menuItem{border:none;background:0 0;color:var(--dsw-alias-label-primary);text-align:left;font-size:13px;padding:7px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}._7rgC5q_menuItem:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_menuItemDanger{color:var(--dsw-alias-state-error-primary)}._7rgC5q_menuItemDisabled{opacity:.5;cursor:default}._7rgC5q_promptBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:8px 10px;margin-bottom:10px}._7rgC5q_promptLabel{color:var(--dsw-alias-label-secondary);font-size:12px}._7rgC5q_promptInput{flex:1;min-width:160px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;padding:5px 8px;outline:none}._7rgC5q_promptInput:focus{border-color:var(--dsw-alias-brand-primary)}._7rgC5q_promptButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-tool-bar-fill);color:var(--dsw-alias-label-primary);border-radius:6px;font-size:12px;padding:5px 10px;cursor:pointer}._7rgC5q_promptButton:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_promptButton:disabled{opacity:.55;cursor:not-allowed}._7rgC5q_promptButtonPrimary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-button-contrast-fill)}._7rgC5q_promptButtonDanger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}._7rgC5q_panelTitleRow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}._7rgC5q_tabs{display:flex;gap:2px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:2px}._7rgC5q_tab{border:none;background:0 0;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;padding:4px 12px;border-radius:6px;cursor:pointer}._7rgC5q_tab:hover{color:var(--dsw-alias-label-primary)}._7rgC5q_tabActive{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600}._7rgC5q_treeSearch{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;font-size:12px;padding:6px 10px;outline:none}._7rgC5q_treeSearch:focus{border-color:var(--dsw-alias-brand-primary)}._7rgC5q_repoHint{color:var(--dsw-alias-label-tertiary);font-size:11px;padding:6px 6px 2px}._7rgC5q_logSearch{width:180px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;font-size:12px;padding:4px 8px;outline:none}._7rgC5q_logSearch:focus{border-color:var(--dsw-alias-brand-primary)}._7rgC5q_logAuthor{flex:none;width:130px;color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_logDate{flex:none;width:124px;text-align:right;color:var(--dsw-alias-label-tertiary);font-size:11px}._7rgC5q_logRowActive{background:var(--dsw-alias-interactive-bg-active)}._7rgC5q_detailPane{flex:0 0 300px;min-height:0;display:flex;flex-direction:column;gap:8px;border-left:1px solid var(--dsw-alias-border-l1);padding:0 0 0 12px;overflow:auto}._7rgC5q_detailHead{display:flex;align-items:center;gap:8px;min-width:0}._7rgC5q_detailHash{flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary)}._7rgC5q_detailSubject{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_detailBody{white-space:pre-wrap;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:8px 10px}._7rgC5q_detailMeta{display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--dsw-alias-label-tertiary)}._7rgC5q_detailFiles{display:flex;flex-direction:column;gap:1px}._7rgC5q_fileRow{display:flex;align-items:center;gap:8px;padding:3px 4px;border-radius:6px;font-size:12px;min-width:0}._7rgC5q_fileLetter{flex:none;width:14px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:700}._7rgC5q_fileName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}._7rgC5q_fileDir{flex:none;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px}._7rgC5q_statusAdded{color:var(--dsw-alias-state-success-primary)}._7rgC5q_statusDeleted{color:var(--dsw-alias-state-error-primary)}._7rgC5q_statusRenamed{color:#a472e6}._7rgC5q_statusConflict{color:var(--dsw-alias-state-error-primary)}._7rgC5q_statusModified{color:var(--dsw-alias-brand-primary)}._7rgC5q_commitTab{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;overflow:auto;padding-right:2px}._7rgC5q_commitToolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}._7rgC5q_commitCount{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-left:auto}._7rgC5q_changeRow{display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:6px;cursor:pointer;font-size:12px;min-width:0}._7rgC5q_changeRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_commitBox{display:flex;flex-direction:column;gap:8px;margin-top:auto;padding-top:6px}._7rgC5q_commitMessage{min-height:70px;resize:vertical;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;font-family:inherit;font-size:12px;padding:8px 10px;outline:none}._7rgC5q_commitMessage:focus{border-color:var(--dsw-alias-brand-primary)}._7rgC5q_stashRow{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2)}._7rgC5q_stashInfo{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}._7rgC5q_stashSubject{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_stashMeta{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}._7rgC5q_stashActions{display:flex;align-items:center;gap:6px;flex:none}._7rgC5q_logRow{display:flex;align-items:center;gap:8px;width:100%;min-width:0;box-sizing:border-box;padding:6px 8px;border-radius:6px;font-size:12px;cursor:pointer;overflow:hidden}._7rgC5q_logLanes{flex:none;max-width:150px;overflow:hidden}._7rgC5q_logMain{flex:1 1 auto;min-width:60px;display:flex;flex-direction:column;gap:2px;overflow:hidden}._7rgC5q_logSubject{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}._7rgC5q_logMeta{flex-wrap:nowrap;overflow:hidden}._7rgC5q_logAuthor{flex:0 1 96px;max-width:130px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary)}._7rgC5q_logDate{flex:0 0 110px;text-align:right;font-size:11px;color:var(--dsw-alias-label-tertiary)}._7rgC5q_detailBackdrop{z-index:940;position:fixed;inset:0;background:rgba(0,0,0,.45)}._7rgC5q_detailDialog{z-index:941;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(880px,92vw);max-height:82vh;display:flex;flex-direction:column;gap:10px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-shadow-lv3);overflow:auto}._7rgC5q_detailDialogHead{display:flex;align-items:center;justify-content:space-between;gap:10px}._7rgC5q_detailDialogTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}._7rgC5q_detailClose{border:none;background:0 0;color:var(--dsw-alias-label-tertiary);font-size:18px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:6px}._7rgC5q_detailClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._7rgC5q_detailPane{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:10px;padding:0;border:none;overflow:auto}._7rgC5q_tree{flex:0 1 280px;min-width:180px}._7rgC5q_logPane{min-width:260px}._7rgC5q_refRowCurrent{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);font-weight:600}._7rgC5q_refRowCurrent:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, transparent)}._7rgC5q_refDotCurrent{color:var(--dsw-alias-brand-primary);font-size:11px}._7rgC5q_refBadge{flex:none;border-radius:999px;padding:0 6px;font-size:10px;line-height:16px;font-weight:600;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-button-contrast-fill)}._7rgC5q_laneColor0{color:#d0a215}._7rgC5q_laneColor1{color:#3fa66f}._7rgC5q_laneColor2{color:#4a8fd4}._7rgC5q_laneColor3{color:#a472e6}._7rgC5q_laneColor4{color:#d4645a}._7rgC5q_laneColor5{color:#5ab3b8}._7rgC5q_logLaneNode,._7rgC5q_logLaneMerge{font-weight:700}._7rgC5q_logPass{color:inherit}._7rgC5q_logRowMerge ._7rgC5q_logSubject{color:var(--dsw-alias-label-tertiary)}._7rgC5q_logAuthor{font-weight:600;color:var(--dsw-alias-label-primary)}._7rgC5q_treeAhead{flex:none;color:#3fa66f;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}._7rgC5q_treeBehind{flex:none;color:#4a8fd4;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}._7rgC5q_remoteBanner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid #4a8fd4;border-radius:8px;background:color-mix(in srgb, #4a8fd4 12%, transparent);padding:6px 10px;margin-bottom:8px;font-size:12px}._7rgC5q_remoteBannerTitle{color:#4a8fd4;font-weight:600}._7rgC5q_remoteBannerItem{border:none;background:0 0;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;cursor:pointer;padding:2px 6px;border-radius:6px}._7rgC5q_remoteBannerItem:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_tabBadge{display:inline-block;min-width:16px;margin-left:4px;padding:0 5px;border-radius:999px;background:#4a8fd4;color:#fff;font-size:10px;line-height:16px;text-align:center}._7rgC5q_refBadge{background:#3b82f6;color:#fff;border-radius:999px;padding:0 6px;font-size:10px;line-height:16px;font-weight:600}._7rgC5q_refRowCurrent{background:rgba(59,130,246,.18);box-shadow:inset 3px 0 0 #3b82f6;color:var(--dsw-alias-label-primary);font-weight:600}._7rgC5q_refRowCurrent:hover{background:rgba(59,130,246,.26)}._7rgC5q_refDotCurrent{color:#3b82f6}._7rgC5q_statusModified{color:#3b82f6}._7rgC5q_promptButtonPrimary{border-color:#3b82f6;background:#3b82f6;color:#fff}._7rgC5q_promptButtonPrimary:hover{background:#2f6fd0}._7rgC5q_promptButtonPrimary:disabled{opacity:.6}._7rgC5q_logRefCurrent{background:#3b82f6;color:#fff}._7rgC5q_tabActive{background:rgba(59,130,246,.18);color:var(--dsw-alias-label-primary);font-weight:600}._7rgC5q_tab{color:var(--dsw-alias-label-secondary)}._7rgC5q_fileNameBtn{border:none;background:0 0;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;padding:0;text-align:left;cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_fileNameBtn:hover{text-decoration:underline;color:#3b82f6}._7rgC5q_fileRowBtn{display:flex;align-items:center;gap:8px;padding:3px 4px;border:none;border-radius:6px;background:0 0;font-family:inherit;font-size:12px;text-align:left;cursor:pointer;min-width:0}._7rgC5q_fileRowBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_diffHeadInfo{display:flex;align-items:center;gap:10px;min-width:0}._7rgC5q_diffPath{color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7rgC5q_diffBody{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5}._7rgC5q_diffLine{white-space:pre;padding:0 10px}._7rgC5q_diffMeta{color:var(--dsw-alias-label-tertiary)}._7rgC5q_diffHunk{color:#4a8fd4;background:rgba(74,143,212,.1)}._7rgC5q_diffAdd{color:#3fa66f;background:rgba(63,166,111,.14)}._7rgC5q_diffDel{color:#d4645a;background:rgba(212,100,90,.14)}._7rgC5q_diffCtx{color:var(--dsw-alias-label-secondary)}._7rgC5q_diffTools{display:flex;align-items:center;gap:6px;flex:none}._7rgC5q_diffModeBtn{border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer}._7rgC5q_diffModeBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}._7rgC5q_diffModeActive{background:#3b82f6;border-color:#3b82f6;color:#fff}._7rgC5q_splitBody{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5}._7rgC5q_splitRow{display:grid;grid-template-columns:52px minmax(0,1fr) 52px minmax(0,1fr);align-items:stretch}._7rgC5q_splitNo{color:var(--dsw-alias-label-tertiary);text-align:right;padding:0 6px;user-select:none;border-right:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)}._7rgC5q_splitCell{white-space:pre;padding:0 8px;overflow-x:auto;min-width:0}._7rgC5q_splitDel{background:rgba(212,100,90,.16);color:#e08a80}._7rgC5q_splitAdd{background:rgba(63,166,111,.16);color:#7ed09b}._7rgC5q_splitHunk{color:#4a8fd4;background:rgba(74,143,212,.12);padding:0 8px;white-space:pre}._7rgC5q_fileLetter{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;background:color-mix(in srgb,currentColor 16%,transparent);font-size:11px;font-weight:700;flex:none}._7rgC5q_fileKind{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:22px;height:16px;padding:0 4px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:9px;font-weight:700;letter-spacing:.02em;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.35)}._7rgC5q_diffNav{display:flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:1px}._7rgC5q_diffNavBtn{border:none;background:0 0;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1;cursor:pointer;padding:0 7px;border-radius:4px}._7rgC5q_diffNavBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._7rgC5q_diffNavBtn:disabled{opacity:.35;cursor:default}._7rgC5q_diffCount{color:var(--dsw-alias-label-tertiary);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;min-width:44px;text-align:center}._7rgC5q_splitRowChange{scroll-margin:80px}._7rgC5q_splitScroll{overflow:auto;max-height:64vh;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}._7rgC5q_splitTable{border-collapse:collapse;min-width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5}._7rgC5q_splitTable td{padding:0 8px;vertical-align:top;white-space:pre}._7rgC5q_splitRow{display:table-row}._7rgC5q_splitNo{color:var(--dsw-alias-label-tertiary);text-align:right;user-select:none;background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);border-right:1px solid var(--dsw-alias-border-l1);min-width:44px}._7rgC5q_splitNoRight{border-left:1px solid var(--dsw-alias-border-l1)}._7rgC5q_splitHunkRow{display:table-row}._7rgC5q_splitHunk{color:#4a8fd4;background:rgba(74,143,212,.12);white-space:pre;font-size:12px}._7rgC5q_splitCell{min-width:220px}._7rgC5q_splitBody{display:block}._7rgC5q_diffEditor{width:100%;min-height:52vh;max-height:64vh;resize:vertical;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;padding:8px 10px;outline:none;white-space:pre;overflow:auto;tab-size:2}._7rgC5q_diffEditor:focus{border-color:#3b82f6}._7rgC5q_splitNo{position:sticky;left:0;z-index:1;background:var(--dsw-alias-bg-base)}._7rgC5q_splitNoRight{position:static;left:auto;background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}._7rgC5q_selectAll{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none;padding:2px 4px;border-radius:6px}._7rgC5q_selectAll:hover{color:var(--dsw-alias-label-primary)}._7rgC5q_selectAllCount{color:var(--dsw-alias-label-tertiary);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}._7rgC5q_changeRow{flex-wrap:wrap;align-items:flex-start}._7rgC5q_filePathBtn{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;flex:1 1 220px;min-width:0;border:none;background:0 0;font-family:inherit;font-size:12px;padding:0;text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary)}._7rgC5q_filePathBtn:hover ._7rgC5q_fileName{text-decoration:underline;color:#3b82f6}._7rgC5q_fileDirFull{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:pre-wrap;word-break:break-all;min-width:0}._7rgC5q_filePathText{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;flex:1 1 auto;min-width:0;font-size:12px}";
		const tagId = "@linxin666/dsh-client-ui-git-graph/packages/dsh-git-graph/src/client/chips/context.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-client-ui-git-graph";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var context_module_css_default = {
			"anchor": "_7rgC5q_anchor",
			"anchorHero": "_7rgC5q_anchorHero",
			"backdrop": "_7rgC5q_backdrop",
			"check": "_7rgC5q_check",
			"chip": "_7rgC5q_chip",
			"chipChevron": "_7rgC5q_chipChevron",
			"chipHero": "_7rgC5q_chipHero",
			"chipLabel": "_7rgC5q_chipLabel",
			"chipOpen": "_7rgC5q_chipOpen",
			"chipWrap": "_7rgC5q_chipWrap",
			"dialog": "_7rgC5q_dialog",
			"dialogActions": "_7rgC5q_dialogActions",
			"dialogButton": "_7rgC5q_dialogButton",
			"dialogButtonPrimary": "_7rgC5q_dialogButtonPrimary",
			"dialogClose": "_7rgC5q_dialogClose",
			"dialogDescription": "_7rgC5q_dialogDescription",
			"dialogError": "_7rgC5q_dialogError",
			"dialogField": "_7rgC5q_dialogField",
			"dialogHeader": "_7rgC5q_dialogHeader",
			"dialogHeading": "_7rgC5q_dialogHeading",
			"dialogInput": "_7rgC5q_dialogInput",
			"dialogLabel": "_7rgC5q_dialogLabel",
			"dialogTitle": "_7rgC5q_dialogTitle",
			"dirty": "_7rgC5q_dirty",
			"empty": "_7rgC5q_empty",
			"footer": "_7rgC5q_footer",
			"footerHint": "_7rgC5q_footerHint",
			"footerItem": "_7rgC5q_footerItem",
			"footerItemDisabled": "_7rgC5q_footerItemDisabled",
			"graphBody": "_7rgC5q_graphBody",
			"graphEmpty": "_7rgC5q_graphEmpty",
			"graphLaneCell": "_7rgC5q_graphLaneCell",
			"graphLaneMerge": "_7rgC5q_graphLaneMerge",
			"graphLaneNode": "_7rgC5q_graphLaneNode",
			"graphLanePass": "_7rgC5q_graphLanePass",
			"graphLanes": "_7rgC5q_graphLanes",
			"graphMain": "_7rgC5q_graphMain",
			"graphMeta": "_7rgC5q_graphMeta",
			"graphMetaSep": "_7rgC5q_graphMetaSep",
			"graphMore": "_7rgC5q_graphMore",
			"graphOid": "_7rgC5q_graphOid",
			"graphRef": "_7rgC5q_graphRef",
			"graphRefCurrent": "_7rgC5q_graphRefCurrent",
			"graphRow": "_7rgC5q_graphRow",
			"graphSubject": "_7rgC5q_graphSubject",
			"graphSubtitle": "_7rgC5q_graphSubtitle",
			"item": "_7rgC5q_item",
			"itemName": "_7rgC5q_itemName",
			"itemPath": "_7rgC5q_itemPath",
			"itemText": "_7rgC5q_itemText",
			"list": "_7rgC5q_list",
			"managerActions": "_7rgC5q_managerActions",
			"managerBadge": "_7rgC5q_managerBadge",
			"managerBranch": "_7rgC5q_managerBranch",
			"managerCheck": "_7rgC5q_managerCheck",
			"managerConfirm": "_7rgC5q_managerConfirm",
			"managerHeadline": "_7rgC5q_managerHeadline",
			"managerInfo": "_7rgC5q_managerInfo",
			"managerList": "_7rgC5q_managerList",
			"managerOid": "_7rgC5q_managerOid",
			"managerPath": "_7rgC5q_managerPath",
			"managerRow": "_7rgC5q_managerRow",
			"notice": "_7rgC5q_notice",
			"noticeOk": "_7rgC5q_noticeOk",
			"popover": "_7rgC5q_popover",
			"popoverDown": "_7rgC5q_popoverDown",
			"popoverHero": "_7rgC5q_popoverHero",
			"popoverUp": "_7rgC5q_popoverUp",
			"tree": "_7rgC5q_tree",
			"logPane": "_7rgC5q_logPane",
			"logHead": "_7rgC5q_logHead",
			"logBranch": "_7rgC5q_logBranch",
			"logSync": "_7rgC5q_logSync",
			"logAhead": "_7rgC5q_logAhead",
			"logBehind": "_7rgC5q_logBehind",
			"logUpstream": "_7rgC5q_logUpstream",
			"logList": "_7rgC5q_logList",
			"logRow": "_7rgC5q_logRow",
			"logLanes": "_7rgC5q_logLanes",
			"logLaneCell": "_7rgC5q_logLaneCell",
			"logLaneNode": "_7rgC5q_logLaneNode",
			"logLaneMerge": "_7rgC5q_logLaneMerge",
			"logLanePass": "_7rgC5q_logLanePass",
			"logOid": "_7rgC5q_logOid",
			"logMain": "_7rgC5q_logMain",
			"logSubject": "_7rgC5q_logSubject",
			"logMeta": "_7rgC5q_logMeta",
			"logMetaSep": "_7rgC5q_logMetaSep",
			"logRef": "_7rgC5q_logRef",
			"logRefCurrent": "_7rgC5q_logRefCurrent",
			"logEmpty": "_7rgC5q_logEmpty",
			"logMore": "_7rgC5q_logMore",
			"menuBackdrop": "_7rgC5q_menuBackdrop",
			"menu": "_7rgC5q_menu",
			"menuItem": "_7rgC5q_menuItem",
			"menuItemDanger": "_7rgC5q_menuItemDanger",
			"menuItemDisabled": "_7rgC5q_menuItemDisabled",
			"promptBar": "_7rgC5q_promptBar",
			"promptLabel": "_7rgC5q_promptLabel",
			"promptInput": "_7rgC5q_promptInput",
			"promptButton": "_7rgC5q_promptButton",
			"promptButtonPrimary": "_7rgC5q_promptButtonPrimary",
			"promptButtonDanger": "_7rgC5q_promptButtonDanger",
			"panelTitleRow": "_7rgC5q_panelTitleRow",
			"tabs": "_7rgC5q_tabs",
			"tab": "_7rgC5q_tab",
			"tabActive": "_7rgC5q_tabActive",
			"treeSearch": "_7rgC5q_treeSearch",
			"repoHint": "_7rgC5q_repoHint",
			"logSearch": "_7rgC5q_logSearch",
			"logAuthor": "_7rgC5q_logAuthor",
			"logDate": "_7rgC5q_logDate",
			"logRowActive": "_7rgC5q_logRowActive",
			"detailPane": "_7rgC5q_detailPane",
			"detailHead": "_7rgC5q_detailHead",
			"detailHash": "_7rgC5q_detailHash",
			"detailSubject": "_7rgC5q_detailSubject",
			"detailBody": "_7rgC5q_detailBody",
			"detailMeta": "_7rgC5q_detailMeta",
			"detailFiles": "_7rgC5q_detailFiles",
			"fileRow": "_7rgC5q_fileRow",
			"fileLetter": "_7rgC5q_fileLetter",
			"fileName": "_7rgC5q_fileName",
			"fileDir": "_7rgC5q_fileDir",
			"statusAdded": "_7rgC5q_statusAdded",
			"statusDeleted": "_7rgC5q_statusDeleted",
			"statusRenamed": "_7rgC5q_statusRenamed",
			"statusConflict": "_7rgC5q_statusConflict",
			"statusModified": "_7rgC5q_statusModified",
			"commitTab": "_7rgC5q_commitTab",
			"commitToolbar": "_7rgC5q_commitToolbar",
			"commitCount": "_7rgC5q_commitCount",
			"changeRow": "_7rgC5q_changeRow",
			"commitBox": "_7rgC5q_commitBox",
			"commitMessage": "_7rgC5q_commitMessage",
			"stashRow": "_7rgC5q_stashRow",
			"stashInfo": "_7rgC5q_stashInfo",
			"stashSubject": "_7rgC5q_stashSubject",
			"stashMeta": "_7rgC5q_stashMeta",
			"stashActions": "_7rgC5q_stashActions",
			"detailBackdrop": "_7rgC5q_detailBackdrop",
			"detailDialog": "_7rgC5q_detailDialog",
			"detailDialogHead": "_7rgC5q_detailDialogHead",
			"detailDialogTitle": "_7rgC5q_detailDialogTitle",
			"detailClose": "_7rgC5q_detailClose",
			"refRowCurrent": "_7rgC5q_refRowCurrent",
			"refDotCurrent": "_7rgC5q_refDotCurrent",
			"refBadge": "_7rgC5q_refBadge",
			"laneColor0": "_7rgC5q_laneColor0",
			"laneColor1": "_7rgC5q_laneColor1",
			"laneColor2": "_7rgC5q_laneColor2",
			"laneColor3": "_7rgC5q_laneColor3",
			"laneColor4": "_7rgC5q_laneColor4",
			"laneColor5": "_7rgC5q_laneColor5",
			"treeAhead": "_7rgC5q_treeAhead",
			"treeBehind": "_7rgC5q_treeBehind",
			"remoteBanner": "_7rgC5q_remoteBanner",
			"remoteBannerTitle": "_7rgC5q_remoteBannerTitle",
			"remoteBannerItem": "_7rgC5q_remoteBannerItem",
			"tabBadge": "_7rgC5q_tabBadge",
			"fileNameBtn": "_7rgC5q_fileNameBtn",
			"fileRowBtn": "_7rgC5q_fileRowBtn",
			"diffHeadInfo": "_7rgC5q_diffHeadInfo",
			"diffPath": "_7rgC5q_diffPath",
			"diffBody": "_7rgC5q_diffBody",
			"diffLine": "_7rgC5q_diffLine",
			"diffMeta": "_7rgC5q_diffMeta",
			"diffHunk": "_7rgC5q_diffHunk",
			"diffAdd": "_7rgC5q_diffAdd",
			"diffDel": "_7rgC5q_diffDel",
			"diffCtx": "_7rgC5q_diffCtx",
			"diffTools": "_7rgC5q_diffTools",
			"diffModeBtn": "_7rgC5q_diffModeBtn",
			"diffModeActive": "_7rgC5q_diffModeActive",
			"splitBody": "_7rgC5q_splitBody",
			"splitRow": "_7rgC5q_splitRow",
			"splitNo": "_7rgC5q_splitNo",
			"splitCell": "_7rgC5q_splitCell",
			"splitDel": "_7rgC5q_splitDel",
			"splitAdd": "_7rgC5q_splitAdd",
			"splitHunk": "_7rgC5q_splitHunk",
			"fileKind": "_7rgC5q_fileKind",
			"diffNav": "_7rgC5q_diffNav",
			"diffNavBtn": "_7rgC5q_diffNavBtn",
			"diffCount": "_7rgC5q_diffCount",
			"splitRowChange": "_7rgC5q_splitRowChange",
			"splitScroll": "_7rgC5q_splitScroll",
			"splitTable": "_7rgC5q_splitTable",
			"splitHunkRow": "_7rgC5q_splitHunkRow",
			"splitNoRight": "_7rgC5q_splitNoRight",
			"diffEditor": "_7rgC5q_diffEditor",
			"selectAll": "_7rgC5q_selectAll",
			"selectAllCount": "_7rgC5q_selectAllCount",
			"filePathBtn": "_7rgC5q_filePathBtn",
			"fileDirFull": "_7rgC5q_fileDirFull",
			"filePathText": "_7rgC5q_filePathText",
			"panel": "_7rgC5q_panel",
			"panelBody": "_7rgC5q_panelBody",
			"panelEmpty": "_7rgC5q_panelEmpty",
			"panelHeader": "_7rgC5q_panelHeader",
			"panelHeading": "_7rgC5q_panelHeading",
			"panelNotice": "_7rgC5q_panelNotice",
			"panelNoticeOk": "_7rgC5q_panelNoticeOk",
			"panelRefresh": "_7rgC5q_panelRefresh",
			"panelSelect": "_7rgC5q_panelSelect",
			"panelSub": "_7rgC5q_panelSub",
			"panelTitle": "_7rgC5q_panelTitle",
			"panelToolbar": "_7rgC5q_panelToolbar",
			"refBusy": "_7rgC5q_refBusy",
			"refDot": "_7rgC5q_refDot",
			"refGroup": "_7rgC5q_refGroup",
			"refGroupTitle": "_7rgC5q_refGroupTitle",
			"refName": "_7rgC5q_refName",
			"refOid": "_7rgC5q_refOid",
			"refRow": "_7rgC5q_refRow",
			"refRowActive": "_7rgC5q_refRowActive",
			"refRowRemote": "_7rgC5q_refRowRemote",
			"repoBlock": "_7rgC5q_repoBlock",
			"repoHead": "_7rgC5q_repoHead",
			"repoName": "_7rgC5q_repoName",
			"repoPath": "_7rgC5q_repoPath",
			"repoStats": "_7rgC5q_repoStats",
			"repoHeading": "_7rgC5q_repoHeading",
			"repoMeta": "_7rgC5q_repoMeta",
			"repoName": "_7rgC5q_repoName",
			"repoRow": "_7rgC5q_repoRow",
			"repoRowActive": "_7rgC5q_repoRowActive",
			"repoSection": "_7rgC5q_repoSection",
			"repoText": "_7rgC5q_repoText",
			"searchBox": "_7rgC5q_searchBox",
			"searchInput": "_7rgC5q_searchInput"
		};
		//#endregion
		//#region src/client/chips/Chip.tsx
		/** Join conditional class names (the dependency-free clsx stand-in). */
		function cx(...parts) {
			return parts.filter((part) => typeof part === "string" && part !== "").join(" ");
		}
		/** The pill button shared by the project and branch chips. */
		function Chip({ icon, label, ariaLabel, open, onClick, hero = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				"data-gitgraph-chip": true,
				className: cx(context_module_css_default.chip, open && context_module_css_default.chipOpen, hero && context_module_css_default.chipHero),
				onClick,
				"aria-label": ariaLabel,
				"aria-expanded": open,
				children: [
					icon,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: context_module_css_default.chipLabel,
						title: label,
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineMedium, {
						className: context_module_css_default.chipChevron,
						size: 12
					})
				]
			});
		}
		/** Full-screen transparent backdrop closing the open popover/dialog on click. */
		function Backdrop({ onClose }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: context_module_css_default.backdrop,
				onClick: onClose
			});
		}
		//#endregion
		//#region src/client/chips/error-copy.ts
		/** The blocked-file sentence tail: quoted paths plus the overflow count. */
		function pathsText(error, t) {
			return `${(error.paths ?? []).map((path) => `"${path}"`).join(t("error.pathsSeparator"))}${error.moreFiles !== void 0 && error.moreFiles > 0 ? ` ${t("error.moreFiles", { count: error.moreFiles })}` : ""}`;
		}
		/**
		* One readable message for a git operation rejection.
		* @param error - the classified git error.
		* @param t - the git-graph namespace translate seat.
		* @returns the sentence for the error's code.
		*/
		function errorMessage(error, t) {
			switch (error.code) {
				case "conflicts-present": return t("error.conflictsPresent");
				case "operation-in-progress": return t("error.operationInProgress");
				case "branch-in-other-worktree": return t("error.branchInOtherWorktree");
				case "tracked-changes-would-be-overwritten": return t("error.trackedOverwrite", { paths: pathsText(error, t) });
				case "untracked-changes-would-be-overwritten": return t("error.untrackedOverwrite", { paths: pathsText(error, t) });
				case "target-branch-not-found": return t("error.targetBranchNotFound");
				case "invalid-branch-name": return t("error.invalidBranchName");
				case "branch-already-exists": return t("error.branchAlreadyExists");
				case "workspace-unknown": return t("error.workspaceUnknown");
				case "invalid-worktree-name": return t("error.invalidWorktreeName");
				case "worktree-already-exists": return t("error.worktreeAlreadyExists");
				case "worktree-dirty": return t("error.worktreeDirty");
				case "worktree-not-found": return t("error.worktreeNotFound");
				case "worktree-is-main": return t("error.worktreeIsMain");
				case "base-ref-not-found": return t("error.baseRefNotFound");
				case "branch-not-merged": return t("error.branchNotMerged");
				case "branch-checked-out": return t("error.branchCheckedOut");
				case "merge-conflicts": return t("error.mergeConflicts");
				case "no-upstream": return t("error.noUpstream");
				case "push-rejected": return t("error.pushRejected");
				case "not-current-branch": return t("error.notCurrentBranch");
				case "internal": return t("error.requestFailed", { error: error.message });
			}
		}
		//#endregion
		//#region src/client/chips/BranchPopover.tsx
		/**
		* The branch picker popover: searchable local branch list with the current
		* branch checked, the dirtiness line, switch feedback (success/error), and
		* the footer flows (create branch / Git graph).
		* @module dsh-git-graph/client/chips/BranchPopover
		*/
		/** How long the success notice stays before the popover closes itself. */
		const SUCCESS_DISMISS_MS = 900;
		/** Air kept between the popover and the window's edges. */
		const VIEWPORT_MARGIN_PX = 8;
		/** Air between the chip and the popover, matching the two anchor rules in the stylesheet. */
		const ANCHOR_GAP_PX = 8;
		/** CSS pixel length, or 0 for the `auto` a shrunken list reports. */
		function px(value) {
			const parsed = Number.parseFloat(value);
			return Number.isFinite(parsed) ? parsed : 0;
		}
		/** The box's outer height. */
		function borderBoxHeight(element) {
			const styles = getComputedStyle(element);
			return element.getBoundingClientRect().height + px(styles.borderTopWidth) + px(styles.borderBottomWidth);
		}
		/** The popover's scrollable content: the branch list (the side test reads it by this marker). */
		function listElements(popover) {
			return Array.from(popover.querySelectorAll("[data-gitgraph-branch-list]"));
		}
		/** The room on one side of the anchor, in CSS pixels. */
		function roomOnSide(side, anchor, viewportHeight) {
			return side === "down" ? viewportHeight - VIEWPORT_MARGIN_PX - anchor.bottom - ANCHOR_GAP_PX : anchor.top - ANCHOR_GAP_PX - VIEWPORT_MARGIN_PX;
		}
		/**
		* Pick the side the popover opens on: the side with the room an ideal
		* (uncapped) card needs, else the side with the more room.
		*
		* Every seat has its own side — the dock row opens upward, the hero row opens
		* downward like the official workspace picker beside it — but the room is
		* measured, not assumed: a skin can put the hero row at the bottom of the page
		* (Claude Code's studio home does), where the room below is the footer, so a
		* card that only ever opened downward ran off the window and the composer's own
		* scroll container clipped it. Measuring the ideal height measures the list at
		* its natural size even while the card's `max-height` cap is in effect, so a
		* capped card does not make the room look larger than it is.
		*
		* @param anchor - the box the card is anchored to.
		* @param idealHeight - the popover's uncapped height.
		* @param viewportHeight - the window's height.
		* @param preferred - the side to keep while it has the room.
		*/
		function resolvePopoverDirection(anchor, idealHeight, viewportHeight, preferred) {
			const preferredRoom = roomOnSide(preferred, anchor, viewportHeight);
			if (preferredRoom >= idealHeight) return preferred;
			const other = preferred === "down" ? "up" : "down";
			return roomOnSide(other, anchor, viewportHeight) > preferredRoom ? other : preferred;
		}
		/**
		* The popover's height with its natural list: the chrome plus the list at its
		* content height, which the card's `max-height` cap has otherwise already
		* shrunk (a scrolled list reports its own box, not its content).
		*
		* The chrome is the card's own outer height minus the list's laid-out outer
		* height, so padding, gaps and every sibling (search box, notice, footer) come
		* along without walking them, and only the list's content has to be read from
		* the list itself.
		*/
		function idealPopoverHeight(popover) {
			const lists = listElements(popover);
			if (lists.length === 0) return popover.getBoundingClientRect().height;
			const chrome = Math.max(0, borderBoxHeight(popover) - lists.reduce((sum, list) => sum + borderBoxHeight(list), 0));
			let listsHeight = 0;
			for (const list of lists) {
				const styles = getComputedStyle(list);
				listsHeight += Math.max(px(styles.minHeight), list.scrollHeight) + px(styles.paddingTop) + px(styles.paddingBottom) + px(styles.borderTopWidth) + px(styles.borderBottomWidth);
			}
			return chrome + listsHeight;
		}
		/**
		* The branch picker popover.
		* @param props - see {@link BranchPopoverProps}.
		*/
		function BranchPopover({ view, onSwitch, onSwitched, onCreate, onGraph, onCreateWorktree, onManageWorktrees, onClose, t, hero = false, repos = [], repoRoot, onSelectRepo }) {
			const [query, setQuery] = (0, react.useState)("");
			const [pending, setPending] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [success, setSuccess] = (0, react.useState)(null);
			const [direction, setDirection] = (0, react.useState)(hero ? "down" : "up");
			const popoverRef = (0, react.useRef)(null);
			const dismissTimer = (0, react.useRef)(void 0);
			const [tipReadyName, setTipReadyName] = (0, react.useState)(null);
			const [tipActive, setTipActive] = (0, react.useState)(false);
			const [tipDir, setTipDir] = (0, react.useState)("up");
			const tipTimer = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				if (dismissTimer.current !== void 0) clearTimeout(dismissTimer.current);
				if (tipTimer.current !== void 0) clearTimeout(tipTimer.current);
			}, []);
			const filtered = (0, react.useMemo)(() => {
				const needle = query.trim().toLowerCase();
				if (needle === "") return view.branches;
				return view.branches.filter((branch) => branch.name.toLowerCase().includes(needle));
			}, [view.branches, query]);
			const place = (0, react.useCallback)(() => {
				const popover = popoverRef.current;
				const anchor = popover?.parentElement;
				if (popover === null || popover === void 0 || anchor === null || anchor === void 0) return;
				const next = resolvePopoverDirection(anchor.getBoundingClientRect(), idealPopoverHeight(popover), window.innerHeight, hero ? "down" : "up");
				setDirection((current) => current === next ? current : next);
			}, [hero]);
			(0, react.useLayoutEffect)(() => {
				place();
			}, [
				place,
				filtered.length,
				error,
				success
			]);
			(0, react.useEffect)(() => {
				window.addEventListener("resize", place);
				return () => {
					window.removeEventListener("resize", place);
				};
			}, [place]);
			const switchTo = (branch) => {
				if (pending !== null) return;
				setPending(branch);
				setError(null);
				setSuccess(null);
				onSwitch(branch).then((result) => {
					if (result.ok) {
						onSwitched();
						setSuccess(t("toast.switchSuccess", { branchName: result.branch }));
						dismissTimer.current = setTimeout(onClose, SUCCESS_DISMISS_MS);
						return;
					}
					setError(errorMessage(result.error, t));
				}).finally(() => {
					setPending(null);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Backdrop, { onClose }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: popoverRef,
				className: cx(context_module_css_default.popover, hero && context_module_css_default.popoverHero, direction === "up" ? context_module_css_default.popoverUp : context_module_css_default.popoverDown),
				role: "listbox",
				"aria-label": t("branch.search"),
				"data-gitgraph-popover": true,
				"data-gitgraph-side": direction,
				children: [
					/* Local patch: repository picker for a workspace holding several checkouts. */
					repos.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.repoSection,
						"data-gitgraph-repo-list": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: context_module_css_default.repoHeading,
							children: t("repo.heading")
						}), repos.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: cx(context_module_css_default.repoRow, entry.root === repoRoot && context_module_css_default.repoRowActive),
							"data-gitgraph-repo": entry.root,
							"aria-pressed": entry.root === repoRoot,
							title: entry.root,
							onClick: () => {
								if (entry.root !== repoRoot) onSelectRepo(entry.root);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: context_module_css_default.repoText,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: context_module_css_default.repoName,
									children: entry.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: context_module_css_default.repoMeta,
									children: `${entry.relative === "" ? t("repo.root") : entry.relative} · ${entry.branch === "" ? t("branch.detached") : entry.branch}`
								})]
							}), entry.root === repoRoot && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineMedium, {
								className: context_module_css_default.check,
								size: 14
							})]
						}, entry.root))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.searchBox,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, { size: 14 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: context_module_css_default.searchInput,
							value: query,
							onChange: (event) => {
								setQuery(event.target.value);
							},
							placeholder: t("branch.search"),
							autoFocus: true
						})]
					}),
					view.dirtyFiles > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: context_module_css_default.dirty,
						children: t("branch.dirty", { count: view.dirtyFiles })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: context_module_css_default.list,
						"data-gitgraph-branch-list": true,
						onMouseLeave: () => {
							if (tipTimer.current !== void 0) {
								clearTimeout(tipTimer.current);
								tipTimer.current = void 0;
							}
							setTipActive(false);
							setTipReadyName(null);
						},
						children: filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: context_module_css_default.empty,
							children: t("branch.empty")
						}) : filtered.map((branch) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: cx(context_module_css_default.item, branch.current && context_module_css_default.itemActive),
							onClick: () => {
								switchTo(branch.name);
							},
							role: "option",
							"aria-selected": branch.current,
							"data-tip": branch.name.length > 18 ? branch.name : "",
							"data-tip-ready": branch.name === tipReadyName ? "true" : "",
							"aria-label": branch.name,
							"data-tip-dir": tipDir,
							onMouseEnter: (event) => {
								if (tipTimer.current !== void 0) clearTimeout(tipTimer.current);
								const list = event.currentTarget.parentElement;
								if (list !== null) {
									const itemTop = event.currentTarget.getBoundingClientRect().top;
									const listTop = list.getBoundingClientRect().top;
									setTipDir(itemTop - listTop < 56 ? "down" : "up");
								}
								if (tipActive) setTipReadyName(branch.name);
								else tipTimer.current = setTimeout(() => {
									setTipActive(true);
									setTipReadyName(branch.name);
								}, 500);
							},
							disabled: pending !== null,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 14 }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: context_module_css_default.itemText,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: context_module_css_default.itemName,
										title: branch.name,
										children: branch.name
									})
								}),
								branch.current && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineMedium, {
									className: context_module_css_default.check,
									size: 14
								})
							]
						}, branch.name))
					}),
					success !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: cx(context_module_css_default.notice, context_module_css_default.noticeOk),
						children: success
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: context_module_css_default.notice,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.footer,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: context_module_css_default.footerItem,
								onClick: onCreate,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 14 }), t("branch.create")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: context_module_css_default.footerItem,
								onClick: onGraph,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 14 }), t("branch.graph")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: context_module_css_default.footerItem,
								onClick: onCreateWorktree,
								"data-dsh-part": "worktree-create",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 14 }), t("worktree.create")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: context_module_css_default.footerItem,
								onClick: onManageWorktrees,
								"data-dsh-part": "worktree-manage",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 14 }), t("worktree.manage")]
							})
						]
					})
				]
			})] });
		}
		//#endregion
		//#region src/core/git-command.ts
		/**
		* Sanitize a user/agent-supplied worktree name into a safe directory and
		* branch component: lowercase, alnum plus ._-, no leading/trailing dash/dot,
		* capped at 64 chars. Returns null when nothing usable remains.
		* @param raw - the proposed worktree name.
		*/
		function sanitizeWorktreeName(raw) {
			const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+/, "").replace(/[-.]+$/, "").slice(0, 64);
			if (cleaned === "" || cleaned === "." || cleaned === "..") return null;
			return cleaned;
		}
		new TextEncoder();
		new TextDecoder();
		/**
		* Pure mirror of `git check-ref-format --branch` short-name rules, for
		* instant client-side feedback; the host's check-ref-format call stays the
		* authoritative gate. Returns the reason when the name is invalid.
		* @param name - proposed branch name (short form, no refs/ prefix).
		* @returns null when valid, else a short reason.
		*/
		function validateBranchName(name) {
			if (name === "") return "empty";
			if (name === "@") return "at-sign";
			if (name.startsWith("-")) return "leading-dash";
			if (name.endsWith(".")) return "trailing-dot";
			if (name.endsWith(".lock")) return "lock-suffix";
			if (name.includes("..")) return "double-dot";
			if (name.includes("@{")) return "at-brace";
			if (name.includes("//")) return "double-slash";
			if (name.includes(" ")) return "space";
			if (name.includes("~") || name.includes("^") || name.includes(":")) return "forbidden-char";
			if (name.includes("?") || name.includes("*") || name.includes("[") || name.includes("\\")) return "forbidden-char";
			for (const ch of name) {
				const code = ch.codePointAt(0);
				if (code !== void 0 && (code < 32 || code === 127)) return "control-char";
			}
			for (const component of name.split("/")) {
				if (component === "") return "empty-component";
				if (component.startsWith(".")) return "dot-component";
				if (component.endsWith(".lock")) return "lock-suffix";
			}
			if (name.length > 1e3) return "too-long";
			return null;
		}
		//#endregion
		//#region src/client/chips/CreateBranchDialog.tsx
		/**
		* The create-branch dialog: name input with the pure validation mirror for
		* instant feedback, the host `check-ref-format` gate as the authority, and
		* readable rejection copy.
		* @module dsh-git-graph/client/chips/CreateBranchDialog
		*/
		/**
		* The create-and-switch dialog.
		* @param props - see {@link CreateBranchDialogProps}.
		*/
		function CreateBranchDialog({ onCreate, onClose, t }) {
			const [name, setName] = (0, react.useState)("");
			const [pending, setPending] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const submit = () => {
				if (pending) return;
				const trimmed = name.trim();
				if (validateBranchName(trimmed) !== null) {
					setError(t("error.invalidBranchName"));
					return;
				}
				setPending(true);
				setError(null);
				onCreate(trimmed).then((result) => {
					if (result.ok) {
						onClose();
						return;
					}
					setError(errorMessage(result.error, t));
				}).finally(() => {
					setPending(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Backdrop, { onClose }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: context_module_css_default.dialog,
				role: "dialog",
				"aria-label": t("branch.createDialog.title"),
				"data-gitgraph-dialog": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: context_module_css_default.dialogTitle,
						children: t("branch.createDialog.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: context_module_css_default.dialogDescription,
						children: t("branch.createDialog.description")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.dialogField,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: context_module_css_default.dialogLabel,
							htmlFor: "git-graph-branch-name",
							children: t("branch.createDialog.nameLabel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "git-graph-branch-name",
							className: context_module_css_default.dialogInput,
							value: name,
							onChange: (event) => {
								setName(event.target.value);
							},
							placeholder: t("branch.createDialog.placeholder"),
							onKeyDown: (event) => {
								if (event.key === "Enter") submit();
							},
							autoFocus: true
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: context_module_css_default.dialogError,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: context_module_css_default.dialogButton,
							onClick: onClose,
							children: t("branch.createDialog.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: context_module_css_default.dialogButtonPrimary,
							onClick: submit,
							disabled: pending || name.trim() === "",
							children: t("branch.createDialog.confirm")
						})]
					})
				]
			})] });
		}
		//#endregion
		//#region src/client/chips/CreateWorktreeDialog.tsx
		/**
		* The create-worktree dialog: name input with the sanitizer mirror for
		* instant feedback, a base-branch picker (default: the checkout's current
		* branch), and readable rejection copy. Success registers the worktree as a
		* workspace and starts a new session in it (the owner owns that flow).
		* @module dsh-git-graph/client/chips/CreateWorktreeDialog
		*/
		/**
		* The create-worktree-and-start-session dialog.
		* @param props - see {@link CreateWorktreeDialogProps}.
		*/
		function CreateWorktreeDialog({ branches, currentBranch, onCreate, onClose, t }) {
			const [name, setName] = (0, react.useState)("");
			const [baseRef, setBaseRef] = (0, react.useState)(currentBranch);
			const [pending, setPending] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const sanitized = sanitizeWorktreeName(name);
			const submit = () => {
				if (pending) return;
				if (sanitized === null) {
					setError(t("error.invalidWorktreeName"));
					return;
				}
				setPending(true);
				setError(null);
				onCreate(sanitized, baseRef === "" ? void 0 : baseRef).then((result) => {
					if (result.ok) {
						onClose();
						return;
					}
					setError(errorMessage(result.error, t));
				}).finally(() => {
					setPending(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Backdrop, { onClose }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: context_module_css_default.dialog,
				role: "dialog",
				"aria-label": t("worktree.dialog.title"),
				"data-gitgraph-worktree-dialog": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: context_module_css_default.dialogTitle,
						children: t("worktree.dialog.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: context_module_css_default.dialogDescription,
						children: t("worktree.dialog.description")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.dialogField,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: context_module_css_default.dialogLabel,
							htmlFor: "git-graph-worktree-name",
							children: t("worktree.dialog.nameLabel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "git-graph-worktree-name",
							className: context_module_css_default.dialogInput,
							value: name,
							onChange: (event) => {
								setName(event.target.value);
							},
							placeholder: t("worktree.dialog.namePlaceholder"),
							onKeyDown: (event) => {
								if (event.key === "Enter") submit();
							},
							autoFocus: true
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.dialogField,
						style: { marginTop: 10 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: context_module_css_default.dialogLabel,
							htmlFor: "git-graph-worktree-base",
							children: t("worktree.dialog.baseLabel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							id: "git-graph-worktree-base",
							className: context_module_css_default.dialogInput,
							value: baseRef,
							onChange: (event) => {
								setBaseRef(event.target.value);
							},
							children: branches.map((branch) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: branch.name,
								children: branch.name
							}, branch.name))
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: context_module_css_default.dialogError,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: context_module_css_default.dialogButton,
							onClick: onClose,
							children: t("worktree.dialog.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: context_module_css_default.dialogButtonPrimary,
							onClick: submit,
							disabled: pending || name.trim() === "",
							children: t("worktree.dialog.confirm")
						})]
					})
				]
			})] });
		}
		//#endregion
		//#region src/client/worktrees/WorktreeManager.tsx
		/**
		* The worktree manager dialog: every linked worktree of the repository with
		* its branch/head, plus removal of managed worktrees. Dirty worktrees reject
		* once and surface an inline force-confirm; the wt/ branch survives removal
		* unless the row's delete-branch checkbox is on. The primary checkout row is
		* display-only.
		* @module dsh-git-graph/client/worktrees/WorktreeManager
		*/
		/**
		* The worktree manager dialog.
		* @param props - see {@link WorktreeManagerProps}.
		*/
		function WorktreeManager({ fetchWorktrees, onRemove, onClose, t }) {
			const [view, setView] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			/** Row awaiting an inline force-confirm after a worktree-dirty rejection. */
			const [forcePath, setForcePath] = (0, react.useState)(null);
			/** Rows whose wt/ branch should be deleted together with the worktree. */
			const [branchDelete, setBranchDelete] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [pending, setPending] = (0, react.useState)(null);
			const reload = (0, react.useCallback)(() => {
				let live = true;
				setLoading(true);
				fetchWorktrees().then((fresh) => {
					if (!live) return;
					setView(fresh);
					setLoading(false);
				});
				return () => {
					live = false;
				};
			}, [fetchWorktrees]);
			(0, react.useEffect)(() => reload(), [reload]);
			const remove = (item, force) => {
				if (pending !== null) return;
				setPending(item.path);
				setError(null);
				onRemove(item.path, {
					force,
					deleteBranch: branchDelete.has(item.path)
				}).then((result) => {
					if (result.ok) {
						setForcePath(null);
						reload();
						return;
					}
					if (result.error.code === "worktree-dirty" && !force) {
						setForcePath(item.path);
						return;
					}
					setError(errorMessage(result.error, t));
				}).finally(() => {
					setPending(null);
				});
			};
			const toggleBranchDelete = (path) => {
				setBranchDelete((previous) => {
					const next = new Set(previous);
					if (next.has(path)) next.delete(path);
					else next.add(path);
					return next;
				});
			};
			const rows = view?.worktrees ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Backdrop, { onClose }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: context_module_css_default.dialog,
				role: "dialog",
				"aria-label": t("worktree.manager.title"),
				"data-gitgraph-worktree-manager": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: context_module_css_default.dialogTitle,
						children: t("worktree.manager.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.managerList,
						children: [
							loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: context_module_css_default.graphEmpty,
								children: t("worktree.manager.loading")
							}),
							!loading && rows.length <= 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: context_module_css_default.graphEmpty,
								children: t("worktree.manager.empty")
							}),
							!loading && rows.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: context_module_css_default.managerRow,
								"data-main": item.main || void 0,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: context_module_css_default.managerInfo,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: context_module_css_default.managerHeadline,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 13 }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: context_module_css_default.managerBranch,
													children: item.branch === "" ? t("worktree.manager.detached") : item.branch
												}),
												item.main && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: context_module_css_default.managerBadge,
													children: t("worktree.manager.main")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: context_module_css_default.managerOid,
													children: item.head.slice(0, 7)
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: context_module_css_default.managerPath,
											title: item.path,
											children: item.path
										}),
										forcePath === item.path && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: context_module_css_default.managerConfirm,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("worktree.manager.forceConfirm") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: context_module_css_default.dialogButton,
												disabled: pending !== null,
												onClick: () => {
													remove(item, true);
												},
												children: t("worktree.manager.forceYes")
											})]
										})
									]
								}), !item.main && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: context_module_css_default.managerActions,
									children: [item.branch.startsWith("wt/") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: context_module_css_default.managerCheck,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: branchDelete.has(item.path),
											onChange: () => {
												toggleBranchDelete(item.path);
											}
										}), t("worktree.manager.deleteBranch")]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: context_module_css_default.dialogButton,
										disabled: pending !== null,
										onClick: () => {
											remove(item, false);
										},
										children: t("worktree.manager.remove")
									})]
								})]
							}, item.path))
						]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: context_module_css_default.dialogError,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: context_module_css_default.dialogActions,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cx(context_module_css_default.dialogButton),
							onClick: onClose,
							children: t("worktree.manager.close")
						})
					})
				]
			})] });
		}
		//#endregion
		//#region src/core/types.ts
		/**
		* Minimal lane assignment over topo-ordered rows: each lane waits for one
		* commit; the first parent continues the node's lane, further parents start
		* (or join) lanes to the right. Correct for linear, branched, and merged
		* histories; the columns alone carry the topology (the renderer draws them
		* as monospace lane text).
		* @param rows - topo-ordered rows with parents (later rows = ancestors).
		* @returns per-row lane maps.
		*/
		function computeLanes(rows) {
			const later = /* @__PURE__ */ new Set();
			for (const row of rows) for (const parent of row.parents) later.add(parent);
			const lanes = [];
			const result = [];
			for (const row of rows) {
				let nodeColumn = lanes.findIndex((pending) => pending === row.oid);
				if (nodeColumn === -1) {
					lanes.push(row.oid);
					nodeColumn = lanes.length - 1;
				}
				const columns = [];
				for (let i = 0; i < lanes.length; i += 1) {
					const pending = lanes[i];
					if (pending === null) columns.push("gap");
					else if (i === nodeColumn) columns.push(row.parents.length > 1 ? "merge" : "node");
					else if (pending === row.oid) columns.push("gap");
					else if (typeof pending === "string" && later.has(pending)) columns.push("pass");
					else columns.push("gap");
				}
				const [first, ...rest] = row.parents.filter((parent) => later.has(parent));
				for (let i = 0; i < lanes.length; i += 1) if (lanes[i] === row.oid && i !== nodeColumn) lanes[i] = null;
				lanes[nodeColumn] = first ?? null;
				for (const parent of rest) if (!lanes.includes(parent)) lanes.push(parent);
				while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
				result.push({
					columns,
					nodeColumn,
					merge: row.parents.length > 1
				});
			}
			return result;
		}
		//#endregion
		//#region src/client/graph/GraphDialog.tsx
		/**
		* The Git graph panel: a read-only commit list with lane topology, ref
		* labels, and paging (git log --branches --tags --remotes --topo-order).
		* @module dsh-git-graph/client/graph/GraphDialog
		*/
		/** Initial page size of the graph fetch. */
		const INITIAL_LIMIT = 200;
		/** Page size of one "load more" step. */
		const PAGE_STEP = 100;
		/** Lane glyph → the rendered monospace character. */
		function glyphChar(glyph) {
			switch (glyph) {
				case "node": return "●";
				case "merge": return "◆";
				case "pass": return "│";
				case "gap": return " ";
			}
		}
		/** Seconds per time bucket (relative timestamps). */
		const MINUTE = 60;
		const HOUR = 60 * MINUTE;
		const DAY = 24 * HOUR;
		/**
		* A compact relative timestamp (GitHub-style): "just now", "5 分钟前",
		* falling back to a plain date past 30 days.
		* @param epochSeconds - commit author time in seconds.
		* @param t - the dictionary.
		* @returns the display string.
		*/
		function formatTime(epochSeconds, t) {
			const elapsed = Math.max(0, Math.floor(Date.now() / 1e3) - epochSeconds);
			if (elapsed < MINUTE) return t("graph.time.justNow");
			if (elapsed < HOUR) return t("graph.time.minutesAgo", { count: Math.floor(elapsed / MINUTE) });
			if (elapsed < DAY) return t("graph.time.hoursAgo", { count: Math.floor(elapsed / HOUR) });
			if (elapsed < 30 * DAY) return t("graph.time.daysAgo", { count: Math.floor(elapsed / DAY) });
			const date = /* @__PURE__ */ new Date(epochSeconds * 1e3);
			const pad = (n) => String(n).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
		}
		/**
		* The Git graph panel.
		* @param props - see {@link GraphDialogProps}.
		*/
		function GraphDialog({ graph, onClose, t }) {
			const [view, setView] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const requestSeq = (0, react.useRef)(0);
			const load = (0, react.useCallback)((limit) => {
				const seq = requestSeq.current + 1;
				requestSeq.current = seq;
				setLoading(true);
				graph(limit).then((next) => {
					if (seq !== requestSeq.current) return;
					setView(next);
					setError(next === null ? t("error.internal") : null);
				}).catch(() => {
					if (seq !== requestSeq.current) return;
					setError(t("error.internal"));
				}).finally(() => {
					if (seq === requestSeq.current) setLoading(false);
				});
			}, [graph, t]);
			const loadRef = (0, react.useRef)(load);
			loadRef.current = load;
			(0, react.useEffect)(() => {
				loadRef.current(INITIAL_LIMIT);
			}, []);
			const lanes = (0, react.useMemo)(() => {
				if (view === null) return [];
				return computeLanes(view.commits);
			}, [view]);
			const laneCount = (0, react.useMemo)(() => {
				let count = 0;
				for (const row of lanes) count = Math.max(count, row.columns.length);
				return count;
			}, [lanes]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Backdrop, { onClose }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: context_module_css_default.dialog,
				role: "dialog",
				"aria-label": t("graph.title"),
				"data-gitgraph-dialog": true,
				"data-dsh-plugin": "git-graph",
				"data-dsh-part": "dialog",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.dialogHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: context_module_css_default.dialogHeading,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: context_module_css_default.dialogTitle,
								children: t("graph.title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: context_module_css_default.graphSubtitle,
								children: t("graph.subtitle", {
									count: view === null ? 0 : view.commits.length,
									lanes: laneCount
								})
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: context_module_css_default.dialogClose,
							onClick: onClose,
							"aria-label": t("graph.close"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutlineRegular, { size: 16 })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: context_module_css_default.graphBody,
						children: loading && view === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: context_module_css_default.graphEmpty,
							children: t("graph.loading")
						}) : error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: context_module_css_default.graphEmpty,
							children: error
						}) : view === null || view.commits.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: context_module_css_default.graphEmpty,
							children: t("graph.empty")
						}) : view.commits.map((commit, index) => {
							const row = lanes[index];
							if (row === void 0) return null;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: context_module_css_default.graphRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: context_module_css_default.graphLanes,
										"aria-hidden": "true",
										"data-gitgraph-lanes": true,
										children: row.columns.map((glyph, column) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"data-gitgraph-glyph": glyph,
											className: cx(context_module_css_default.graphLaneCell, glyph === "node" && context_module_css_default.graphLaneNode, glyph === "merge" && context_module_css_default.graphLaneMerge, glyph === "pass" && context_module_css_default.graphLanePass),
											children: glyphChar(glyph)
										}, column))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: context_module_css_default.graphOid,
										title: commit.oid,
										children: commit.oid.slice(0, 7)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: context_module_css_default.graphMain,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: context_module_css_default.graphSubject,
											title: commit.subject,
											children: commit.subject
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: context_module_css_default.graphMeta,
											children: [
												commit.refs.map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													title: ref,
													"data-gitgraph-ref": true,
													"data-gitgraph-ref-current": ref === view.branch || void 0,
													className: cx(context_module_css_default.graphRef, ref === view.branch && context_module_css_default.graphRefCurrent),
													children: ref
												}, ref)),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: commit.author }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: context_module_css_default.graphMetaSep,
													children: "·"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatTime(commit.authorTime, t) })
											]
										})]
									})
								]
							}, commit.oid);
						})
					}),
					view !== null && view.hasMore && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: context_module_css_default.graphMore,
						onClick: () => {
							load(view.commits.length + PAGE_STEP);
						},
						children: t("graph.loadMore")
					})
				]
			})] });
		}
		const SKIN_CENTER_BODY_ATTR = "data-dsh-skin-center";
		const DARK_THEME_BODY_ATTR = "data-ds-dark-theme";
		const DSH_BODY_ATTR_PREFIX = "data-dsh-";
		/** Whether a body attribute belongs to an applied skin rather than the skin center shell. */
		function hasAppliedSkinBodyAttr(name) {
			return name.startsWith(DSH_BODY_ATTR_PREFIX) && name !== SKIN_CENTER_BODY_ATTR;
		}
		/** Whether the page is using the unskinned stock light theme. */
		function readStockLightTheme() {
			if (typeof document === "undefined") return false;
			const body = document.body;
			if (!body.hasAttribute(SKIN_CENTER_BODY_ATTR) || body.hasAttribute(DARK_THEME_BODY_ATTR)) return false;
			return !body.getAttributeNames().some(hasAppliedSkinBodyAttr);
		}
		/** Track stock-light theme changes from body attributes. */
		function useStockLightTheme() {
			const [stockLightTheme, setStockLightTheme] = (0, react.useState)(readStockLightTheme);
			(0, react.useEffect)(() => {
				const update = () => {
					setStockLightTheme(readStockLightTheme());
				};
				update();
				if (typeof document === "undefined" || typeof MutationObserver !== "function") return void 0;
				const observer = new MutationObserver(update);
				observer.observe(document.body, { attributes: true });
				return () => {
					observer.disconnect();
				};
			}, []);
			return stockLightTheme;
		}
		function isConnectedElement(node) {
			return node instanceof HTMLElement && node.isConnected;
		}
		/**
		* Resolve the hero workspace row element that the branch chip should join
		* during the blank-session hero phase.
		*/
		function findHeroRow(anchor) {
			if (anchor === null || !anchor.isConnected) return null;
			const outlet = anchor.parentElement;
			if (outlet === null) return null;
			const prev = outlet.previousElementSibling;
			if (prev !== null && isConnectedElement(prev) && prev.className.includes("heroWorkspaceRow")) return prev;
			const rowInStack = outlet.closest("[class*=\"composerStack\"], [class*=\"composerHero\"]")?.querySelector("[class*=\"heroWorkspaceRow\"]");
			if (rowInStack !== null && isConnectedElement(rowInStack)) return rowInStack;
			if (typeof document !== "undefined") {
				const docRow = document.querySelector("[class*=\"heroWorkspaceRow\"]");
				if (docRow !== null && isConnectedElement(docRow)) return docRow;
			}
			return null;
		}
		/**
		* Resolve the hero row's trailing options group. That group carries
		* `margin-left: auto`, so every later sibling is pushed to the row's right
		* edge: a chip appended after it would sit above the composer card's top-right
		* corner instead of beside the agent-preset seat.
		*/
		function findHeroTrailingGroup(row) {
			for (const child of Array.from(row.children)) {
				if (!(child instanceof HTMLElement)) continue;
				if ((child.getAttribute("class") ?? "").includes("heroOptions")) return child;
			}
			return null;
		}
		/**
		* The git branch selector chip for blank sessions.
		* @param props - the composed entry props of whichever seat it mounted in.
		*/
		function BranchChip(props) {
			const sessionId = props.sessionId;
			const blankSession = props.useSessions((state) => {
				if (sessionId === void 0) return false;
				return state.byId?.[sessionId]?.blank === true;
			});
			const sessionSnapshot = props.session;
			const heroSeat = sessionSnapshot?.blank === true && (sessionSnapshot.openState === "open" || blankSession === true);
			const stockLightTheme = useStockLightTheme();
			/** Repository state: undefined = loading, null = not a repository, else the snapshot. */
			const [repo, setRepo] = (0, react.useState)(void 0);
			/** Local patch: repositories found under the workspace, and the pinned one. */
			const [repoList, setRepoList] = (0, react.useState)(void 0);
			const [repoRoot, setRepoRoot] = (0, react.useState)(void 0);
			/** Fresh branch list, fetched when the branch popover opens. */
			const [branchesView, setBranchesView] = (0, react.useState)(null);
			const [branchOpen, setBranchOpen] = (0, react.useState)(false);
			const [createOpen, setCreateOpen] = (0, react.useState)(false);
			const [graphOpen, setGraphOpen] = (0, react.useState)(false);
			const [worktreeCreateOpen, setWorktreeCreateOpen] = (0, react.useState)(false);
			const [worktreeManageOpen, setWorktreeManageOpen] = (0, react.useState)(false);
			const [heroRow, setHeroRow] = (0, react.useState)(null);
			const anchorRef = (0, react.useRef)(null);
			const chipRef = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				if (!heroSeat || repo === void 0 || repo === null) {
					setHeroRow(null);
					return;
				}
				const update = () => {
					const found = findHeroRow(anchorRef.current);
					setHeroRow((prev) => prev === found ? prev : found);
				};
				update();
				const parent = anchorRef.current?.parentElement;
				if (parent === null || parent === void 0 || typeof MutationObserver === "undefined") return void 0;
				const observer = new MutationObserver(update);
				observer.observe(parent.parentElement ?? parent, {
					childList: true,
					subtree: true
				});
				return () => {
					observer.disconnect();
				};
			}, [heroSeat, repo !== void 0 && repo !== null]);
			(0, react.useLayoutEffect)(() => {
				if (!heroSeat || heroRow === null) return;
				const anchor = chipRef.current;
				if (anchor === null || anchor.parentElement !== heroRow) return;
				const trailing = findHeroTrailingGroup(heroRow);
				if (trailing === null || anchor.nextElementSibling === trailing) return;
				heroRow.insertBefore(anchor, trailing);
			});
			const refetch = (0, react.useCallback)(() => {
				let live = true;
				props.repoStatus(sessionId).then((status) => {
					if (live) setRepo(status);
				}).catch(() => {
					if (live) setRepo(null);
				});
				return () => {
					live = false;
				};
			}, [props.repoStatus, sessionId]);
			const lastFocusRefetch = (0, react.useRef)(0);
			/** Local patch: the session whose repositories were already discovered (one walk per session). */
			const discoveredFor = (0, react.useRef)(void 0);
			// Local patch: discover the workspace's repositories once per session and
			// track the pinned one. A workspace that is itself a repository discovers
			// exactly that one entry, so the upstream single-repository behavior is
			// unchanged; an umbrella workspace lists its sub-repositories instead.
			(0, react.useEffect)(() => {
				if (!heroSeat) return void 0;
				if (discoveredFor.current === sessionId) return void 0;
				discoveredFor.current = sessionId;
				let live = true;
				props.repos(sessionId).then((view) => {
					if (!live) return;
					const entries = view === null || view === void 0 ? [] : view.repos;
					setRepoList(entries);
					setRepoRoot(view === null || view === void 0 ? void 0 : view.selected);
				}).catch(() => {
					if (!live) return;
					setRepoList([]);
					setRepoRoot(void 0);
				});
				return () => {
					live = false;
				};
			}, [heroSeat, props.repos, sessionId]);
			(0, react.useEffect)(() => {
				if (!heroSeat) return void 0;
				return refetch();
			}, [heroSeat, refetch, repoRoot]);
			(0, react.useEffect)(() => {
				if (!heroSeat) return void 0;
				const unsubscribe = props.subscribeChanges(sessionId, () => {
					refetch();
				});
				const onFocus = () => {
					const now = Date.now();
					if (now - lastFocusRefetch.current < 5e3) return;
					lastFocusRefetch.current = now;
					refetch();
				};
				window.addEventListener("focus", onFocus);
				return () => {
					unsubscribe();
					window.removeEventListener("focus", onFocus);
				};
			}, [
				heroSeat,
				props.subscribeChanges,
				sessionId,
				refetch,
				repoRoot
			]);
			const closeCreate = () => {
				setCreateOpen(false);
				refetch();
			};
			(0, react.useEffect)(() => {
				if (!heroSeat || !branchOpen) return void 0;
				let live = true;
				setBranchesView(null);
				props.branches(sessionId).then((view) => {
					if (live) setBranchesView(view);
				});
				return () => {
					live = false;
				};
			}, [
				heroSeat,
				branchOpen,
				props.branches,
				sessionId,
				repoRoot
			]);
			if (!heroSeat || repo === void 0 || repo === null) return null;
			const openBranchPopover = () => {
				setBranchOpen((open) => !open);
			};
			// Local patch: with more than one repository under the workspace the chip
			// names the repository alongside the branch, so the pill stays honest
			// about which checkout it will switch.
			const repoEntries = repoList === void 0 || repoList === null ? [] : repoList;
			const branchLabel = repo.branch === "" ? props.t("branch.detached") : repo.branch;
			const currentRepo = repoEntries.find((entry) => entry.root === repoRoot);
			const chipLabel = repoEntries.length > 1 && currentRepo !== void 0 ? `${currentRepo.name} · ${branchLabel}` : branchLabel;
			const chipNode = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: chipRef,
				"data-gitgraph-chip-anchor": true,
				"data-dsh-plugin": "git-graph",
				"data-dsh-part": "chip",
				"data-gitgraph-stock-light": stockLightTheme || void 0,
				className: cx(context_module_css_default.anchor, heroSeat && context_module_css_default.anchorHero),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: context_module_css_default.chipWrap,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chip, {
							hero: heroSeat,
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 14 }),
							label: chipLabel,
							ariaLabel: props.t("chip.aria.branch"),
							open: branchOpen,
							onClick: openBranchPopover
						}), branchOpen && branchesView !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BranchPopover, {
							hero: heroSeat,
							view: branchesView,
							repos: repoEntries,
							repoRoot,
							onSelectRepo: (root) => {
								props.selectRepo(sessionId, root);
								setRepoRoot(root);
							},
							onSwitch: (branch) => props.switchBranch(sessionId, branch),
							onSwitched: refetch,
							onCreate: () => {
								setBranchOpen(false);
								setCreateOpen(true);
							},
							onGraph: () => {
								setBranchOpen(false);
								setGraphOpen(true);
							},
							onCreateWorktree: () => {
								setBranchOpen(false);
								setWorktreeCreateOpen(true);
							},
							onManageWorktrees: () => {
								setBranchOpen(false);
								setWorktreeManageOpen(true);
							},
							onClose: () => {
								setBranchOpen(false);
							},
							t: props.t
						})]
					}),
					createOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreateBranchDialog, {
						onCreate: (name) => props.createBranch(sessionId, name),
						onClose: closeCreate,
						t: props.t
					}),
					graphOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GraphDialog, {
						graph: (limit) => props.graph(sessionId, limit),
						onClose: () => {
							setGraphOpen(false);
						},
						t: props.t
					}),
					worktreeCreateOpen && branchesView !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreateWorktreeDialog, {
						branches: branchesView.branches,
						currentBranch: branchesView.branch,
						onCreate: (name, baseRef) => props.createWorktreeSession(sessionId, name, baseRef),
						onClose: () => {
							setWorktreeCreateOpen(false);
							refetch();
						},
						t: props.t
					}),
					worktreeManageOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorktreeManager, {
						fetchWorktrees: () => props.worktrees(sessionId),
						onRemove: (worktreePath, opts) => props.removeWorktree(sessionId, worktreePath, opts),
						onClose: () => {
							setWorktreeManageOpen(false);
						},
						t: props.t
					})
				]
			});
			if (heroSeat) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: anchorRef,
				style: { display: "none" }
			}), heroRow !== null && isConnectedElement(heroRow) ? (0, react_dom.createPortal)(chipNode, heroRow) : chipNode] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: anchorRef,
				style: { display: "contents" },
				children: chipNode
			});
		}
		//#endregion
		//#region src/client/sidebar/BranchPanel.tsx
		/**
		* Local patch: the WebStorm-style Git panel.
		*
		* Three tabs mirroring the WebStorm Git tool window:
		* - 日志: branch tree (HEAD / local / remote, ahead-behind badges, filter)
		*   plus the selected branch's commits with author, committer and date
		*   columns, and a commit inspector (metadata + changed files).
		* - 提交: working tree per repository — staged, changed and untracked files
		*   with status letters and checkboxes, stage/unstage/discard actions and a
		*   commit message box.
		* - 储藏: stash list with apply / pop / drop and a "shelve" action.
		*
		* Left-clicking a branch only selects it; branch actions live in the
		* right-click menu, exactly like WebStorm.
		* @module dsh-git-graph/client/sidebar/BranchPanel
		*/
		const h = react_jsx_runtime.jsx;
		const hs = react_jsx_runtime.jsxs;
		const Frag = react_jsx_runtime.Fragment;
		const C = context_module_css_default;
		const SIDEBAR_PANEL_ID = "git-graph-branches";
		/** Log page size (and the load-more step). */
		const LOG_PAGE = 100;
		/** Menu width, used to keep the popup inside the viewport. */
		const MENU_WIDTH = 236;
		/** Background fetch cadence: one remote refresh per five minutes. */
		const FETCH_INTERVAL_MS = 5 * 60 * 1e3;
		/** Last path segment, for the compact workspace label. */
		function workspaceLabel(path) {
			if (path === void 0 || path === "") return "";
			const parts = path.split(/[\\/]+/).filter((part) => part !== "");
			return parts.length === 0 ? path : parts[parts.length - 1];
		}
		/** The sidebar row: the host draws the label, this is the glyph. */
		function GitGraphSidebarRow(owner = {}) {
			return h(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: owner.size ?? 16 });
		}
		/** Run `onClose` when Escape is pressed while `active`. */
		function useEscape(active, onClose) {
			(0, react.useEffect)(() => {
				if (!active) return void 0;
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [active, onClose]);
		}
		/** WebStorm-style date: 今天 HH:mm, else YYYY/M/D HH:mm. */
		function formatCommitDate(epochSeconds, t) {
			if (epochSeconds <= 0) return "";
			const date = /* @__PURE__ */ new Date(epochSeconds * 1e3);
			const now = /* @__PURE__ */ new Date();
			const pad = (value) => String(value).padStart(2, "0");
			const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
			if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return `${t("panel.today")} ${clock}`;
			return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${clock}`;
		}
		/** One-letter status code the changes tree shows. */
		function statusLetter(code) {
			if (code === void 0 || code === "" || code === " ") return "M";
			return code;
		}
		/** CSS bucket for one status letter. */
		function statusBucket(code) {
			switch (statusLetter(code)) {
				case "A":
				case "?": return C.statusAdded;
				case "D": return C.statusDeleted;
				case "R":
				case "C": return C.statusRenamed;
				case "U": return C.statusConflict;
				default: return C.statusModified;
			}
		}
		/**
 * Turn one file's unified diff into side-by-side rows (WebStorm's default view).
 * Contiguous `-` and `+` runs are paired row by row so a modification reads as
 * one left/right row; unpaired lines get a blank half.
 * @param text - the unified diff.
 */
function splitDiffRows(text) {
  const rows = [];
  let leftNo = 0;
  let rightNo = 0;
  let dels = [];
  let adds = [];
  const flush = () => {
    const count = Math.max(dels.length, adds.length);
    for (let i = 0; i < count; i += 1) {
      const del = dels[i];
      const add = adds[i];
      rows.push({
        kind: del !== void 0 && add !== void 0 ? "mod" : del !== void 0 ? "del" : "add",
        leftNo: del === void 0 ? "" : del.no,
        leftText: del === void 0 ? "" : del.text,
        rightNo: add === void 0 ? "" : add.no,
        rightText: add === void 0 ? "" : add.text
      });
    }
    dels = [];
    adds = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("@@")) {
      flush();
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match !== null) {
        leftNo = Number(match[1]);
        rightNo = Number(match[2]);
      }
      rows.push({
        kind: "hunk",
        text: line
      });
      continue;
    }
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("old mode") || line.startsWith("new mode") || line.startsWith("similarity index") || line.startsWith("rename ") || line.startsWith("Binary files")) {
      flush();
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    if (line.startsWith("-")) {
      dels.push({
        no: leftNo,
        text: line.slice(1)
      });
      leftNo += 1;
      continue;
    }
    if (line.startsWith("+")) {
      adds.push({
        no: rightNo,
        text: line.slice(1)
      });
      rightNo += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      flush();
      rows.push({
        kind: "ctx",
        leftNo,
        leftText: line.slice(1),
        rightNo,
        rightText: line.slice(1)
      });
      leftNo += 1;
      rightNo += 1;
    }
  }
  flush();
  return rows;
}
/** CSS class for one unified-diff line. */
		function diffLineClass(line) {
			if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("old mode") || line.startsWith("new mode") || line.startsWith("similarity index") || line.startsWith("rename ")) return C.diffMeta;
			if (line.startsWith("@@")) return C.diffHunk;
			if (line.startsWith("+")) return C.diffAdd;
			if (line.startsWith("-")) return C.diffDel;
			return C.diffCtx;
		}
		/**
 * File-kind badge for the changes tree: a short label and a colour per
 * extension, so a `.vue` never looks like a `.ts` at a glance.
 */
const FILE_KINDS = {
  vue: ["V", "#41b883"], ts: ["TS", "#3178c6"], tsx: ["TSX", "#3178c6"], mts: ["TS", "#3178c6"], cts: ["TS", "#3178c6"],
  js: ["JS", "#c9a227"], jsx: ["JSX", "#61dafb"], mjs: ["JS", "#c9a227"], cjs: ["JS", "#c9a227"],
  json: ["{}", "#b8a13a"], md: ["MD", "#519aba"], mdx: ["MD", "#519aba"],
  css: ["CSS", "#42a5f5"], scss: ["SC", "#c6538c"], sass: ["SA", "#c6538c"], less: ["LE", "#5b7fbf"],
  html: ["H", "#e44d26"], htm: ["H", "#e44d26"], xml: ["XML", "#e37933"],
  java: ["J", "#b07219"], kt: ["KT", "#a97bff"], py: ["PY", "#3572a5"], go: ["GO", "#00add8"],
  rs: ["RS", "#dea584"], sql: ["SQL", "#e38c00"], yml: ["Y", "#cb171e"], yaml: ["Y", "#cb171e"],
  sh: ["SH", "#89e051"], bash: ["SH", "#89e051"], zsh: ["SH", "#89e051"],
  env: ["ENV", "#ecd53f"], png: ["IMG", "#a074c4"], jpg: ["IMG", "#a074c4"], jpeg: ["IMG", "#a074c4"],
  gif: ["IMG", "#a074c4"], webp: ["IMG", "#a074c4"], ico: ["IMG", "#a074c4"], svg: ["SVG", "#a074c4"],
  lock: ["LK", "#8b8b8b"], gradle: ["GR", "#4a9e8f"], properties: ["PR", "#8b8b8b"],
  toml: ["TM", "#9c4221"], ini: ["INI", "#8b8b8b"], conf: ["CF", "#8b8b8b"],
  pdf: ["PDF", "#d9534f"], zip: ["ZIP", "#8b8b8b"], jar: ["JAR", "#8b8b8b"],
}
function fileKindInfo(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name.startsWith(".env")) return { label: "ENV", color: "#ecd53f" };
  if (name === "Dockerfile") return { label: "DKR", color: "#2496ed" };
  if (name === "Makefile") return { label: "MK", color: "#6b7280" };
  const dot = name.lastIndexOf(".");
  const ext = dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
  const hit = FILE_KINDS[ext];
  if (hit !== void 0) return { label: hit[0], color: hit[1] };
  return { label: ext === "" ? "TXT" : ext.slice(0, 3).toUpperCase(), color: "#6b7280" };
}
/** One file-kind badge. */
function fileKindBadge(path) {
  const info = fileKindInfo(path);
  return h("span", {
    className: C.fileKind,
    style: {
      background: info.color
    },
    title: path,
    "aria-hidden": "true",
    children: info.label
  });
}
/** Directory part of a repository-relative path. */
		function dirOf(path) {
			const index = path.lastIndexOf("/");
			return index === -1 ? "" : path.slice(0, index);
		}
		/** Short file name. */
		function baseOf(path) {
			const index = path.lastIndexOf("/");
			return index === -1 ? path : path.slice(index + 1);
		}
		/**
		* The Git panel.
		* @param props - injected face plus the locale seat.
		*/
		function BranchSidebarPanel(props) {
			const t = typeof props.t === "function" ? props.t : props.translate;
			const [tab, setTab] = (0, react.useState)("log");
			const [workspace, setWorkspace] = (0, react.useState)(() => props.initialWorkspace());
			const [view, setView] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(null);
			const [selected, setSelected] = (0, react.useState)(null);
			const [logView, setLogView] = (0, react.useState)(null);
			const [logLoading, setLogLoading] = (0, react.useState)(false);
			const [syncView, setSyncView] = (0, react.useState)(null);
			const [treeSearch, setTreeSearch] = (0, react.useState)("");
			const [logSearch, setLogSearch] = (0, react.useState)("");
			const [detail, setDetail] = (0, react.useState)(null);
			const [menu, setMenu] = (0, react.useState)(null);
			const [pending, setPending] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)("");
			const [filesByRepo, setFilesByRepo] = (0, react.useState)({});
			const [chosen, setChosen] = (0, react.useState)({});
			/** Once any checkbox is touched, an empty selection means "nothing", not "everything". */
			const [selectionTouched, setSelectionTouched] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)("");
			const [stashesByRepo, setStashesByRepo] = (0, react.useState)({});
			const [diffView, setDiffView] = (0, react.useState)(null);
			/** Diff presentation: side-by-side (default, like WebStorm) or unified. */
			const [diffMode, setDiffMode] = (0, react.useState)("split");
			/** Index of the change block the diff viewer is pointing at. */
			const [diffCursor, setDiffCursor] = (0, react.useState)(0);
			const diffBodyRef = (0, react.useRef)(null);
			/** Inline editor over the working-tree file behind the diff. */
			const [editing, setEditing] = (0, react.useState)(false);
			const [editText, setEditText] = (0, react.useState)("");
			const [editError, setEditError] = (0, react.useState)(null);
			const [editLoading, setEditLoading] = (0, react.useState)(false);
			const [stashMessage, setStashMessage] = (0, react.useState)("");
			const overviewSeq = (0, react.useRef)(0);
			const logSeq = (0, react.useRef)(0);
			const detailSeq = (0, react.useRef)(0);
			const lastFetch = (0, react.useRef)(0);
			const diffSeq = (0, react.useRef)(0);
			const loadOverview = (0, react.useCallback)((path) => {
				overviewSeq.current += 1;
				const seq = overviewSeq.current;
				setLoading(true);
				setError(null);
				props.overview(path).then((result) => {
					if (overviewSeq.current !== seq) return;
					if (result.ok !== true) {
						setView(null);
						setError(errorMessage(result.error, t));
					} else if (result.value === null || result.value === void 0) {
						setView(null);
						setError(t("error.workspaceUnknown"));
					} else setView(result.value);
					setLoading(false);
				}).catch(() => {
					if (overviewSeq.current !== seq) return;
					setView(null);
					setError(t("error.internal"));
					setLoading(false);
				});
			}, [props.overview, t]);
			const loadLog = (0, react.useCallback)((root, ref, limit) => {
				logSeq.current += 1;
				const seq = logSeq.current;
				setLogLoading(true);
				Promise.all([props.branchLog(root, ref, limit), props.branchSync(root, ref)]).then(([logResult, syncResult]) => {
					if (logSeq.current !== seq) return;
					setLogLoading(false);
					if (logResult.ok !== true) {
						setLogView(null);
						setError(errorMessage(logResult.error, t));
						return;
					}
					setLogView(logResult.value);
					setSyncView(syncResult.ok === true ? syncResult.value : null);
				}).catch(() => {
					if (logSeq.current !== seq) return;
					setLogLoading(false);
					setLogView(null);
					setError(t("error.internal"));
				});
			}, [props.branchLog, props.branchSync, t]);
			const loadDetail = (0, react.useCallback)((root, oid) => {
				detailSeq.current += 1;
				const seq = detailSeq.current;
				setDetail(null);
				props.commitDetail(root, oid).then((result) => {
					if (detailSeq.current !== seq) return;
					if (result.ok === true) setDetail(result.value);
				}).catch(() => {});
			}, [props.commitDetail]);
			const openDiff = (root, file, opts, title) => {
				diffSeq.current += 1;
				const seq = diffSeq.current;
				setEditing(false);
				setEditError(null);
				setDiffCursor(0);
				setDiffView({
					title,
					path: file,
					root,
					opts,
					editable: opts !== void 0 && (opts.stage === "unstaged" || opts.stage === "untracked"),
					text: "",
					loading: true,
					error: null
				});
				props.fileDiff(root, file, opts).then((result) => {
					if (diffSeq.current !== seq) return;
					if (result.ok !== true) {
						setDiffView({
							title,
							path: file,
							text: "",
							loading: false,
							error: errorMessage(result.error, t)
						});
						return;
					}
					setDiffView({
						title,
						path: file,
						root,
						opts,
						editable: opts !== void 0 && (opts.stage === "unstaged" || opts.stage === "untracked"),
						text: result.value.diff,
						loading: false,
						error: null,
						truncated: result.value.truncated === true,
						binary: result.value.binary === true
					});
				}).catch(() => {
					if (diffSeq.current !== seq) return;
					setDiffView({
						title,
						path: file,
						text: "",
						loading: false,
						error: t("error.internal")
					});
				});
			};
			const closeDiff = () => {
				setEditing(false);
				setEditError(null);
				setDiffView(null);
			};
			/** Load the working-tree file into the inline editor. */
			const startEdit = () => {
				if (diffView === null) return;
				setEditing(true);
				setEditError(null);
				setEditLoading(true);
				props.fileContent(diffView.root, diffView.path).then((result) => {
					setEditLoading(false);
					if (result.ok !== true) {
						setEditError(errorMessage(result.error, t));
						return;
					}
					setEditText(result.value.content);
				}).catch(() => {
					setEditLoading(false);
					setEditError(t("error.internal"));
				});
			};
			/** Write the edited text back and reload the diff. */
			const saveEdit = () => {
				if (diffView === null) return;
				setEditError(null);
				props.writeFile(diffView.root, diffView.path, editText).then((result) => {
					if (result.ok !== true) {
						setEditError(errorMessage(result.error, t));
						return;
					}
					setEditing(false);
					setNotice(t("panel.done.saved", { path: diffView.path }));
					if (view !== null) loadFiles(view.repos);
					openDiff(diffView.root, diffView.path, diffView.opts ?? {}, diffView.title);
				}).catch(() => setEditError(t("error.internal")));
			};
			const loadFiles = (0, react.useCallback)((repos) => {
				Promise.all(repos.map((repo) => props.files(repo.root).then((result) => [repo.root, result.ok === true ? result.value : null]).catch(() => [repo.root, null]))).then((pairs) => {
					const next = {};
					for (const [root, status] of pairs) next[root] = status;
					setFilesByRepo(next);
				});
			}, [props.files]);
			const loadStashes = (0, react.useCallback)((repos) => {
				Promise.all(repos.map((repo) => props.stashList(repo.root).then((result) => [repo.root, result.ok === true ? result.value.stashes : []]).catch(() => [repo.root, []]))).then((pairs) => {
					const next = {};
					for (const [root, stashes] of pairs) next[root] = stashes;
					setStashesByRepo(next);
				});
			}, [props.stashList]);
			(0, react.useEffect)(() => {
				if (workspace === void 0 || workspace === "") {
					setLoading(false);
					return;
				}
				loadOverview(workspace);
			}, [loadOverview, workspace]);
			(0, react.useEffect)(() => {
				if (view === null) return;
				if (tab === "commit") loadFiles(view.repos);
				else if (tab === "stash") loadStashes(view.repos);
			}, [tab, view, loadFiles, loadStashes]);
			(0, react.useEffect)(() => {
				if (view === null || view.repos.length === 0) return;
				const now = Date.now();
				if (lastFetch.current !== 0 && now - lastFetch.current < FETCH_INTERVAL_MS) return;
				lastFetch.current = now;
				const jobs = [];
				for (const repo of view.repos) {
					const remotes = [...new Set(repo.remotes.map((branch) => branch.remote))];
					for (const remote of remotes) jobs.push(props.fetchRemote(repo.root, remote).catch(() => null));
				}
				if (jobs.length === 0) return;
				Promise.all(jobs).then(() => {
					if (workspace !== void 0 && workspace !== "") loadOverview(workspace);
				});
			}, [view, workspace, loadOverview, props.fetchRemote]);
			(0, react.useEffect)(() => {
				if (selected === null) {
					setLogView(null);
					setSyncView(null);
					setDetail(null);
					return;
				}
				loadLog(selected.root, selected.name, LOG_PAGE);
			}, [loadLog, selected]);
			useEscape(menu !== null, () => setMenu(null));
			useEscape(detail !== null, () => setDetail(null));
			useEscape(diffView !== null, () => setDiffView(null));
			(0, react.useEffect)(() => {
				if (diffView === null || diffView.loading) return;
				const host = diffBodyRef.current;
				if (host === null) return;
				const node = host.querySelector(`[data-diff-change-start="${diffCursor}"]`);
				if (node !== null && typeof node.scrollIntoView === "function") node.scrollIntoView({
					block: "center",
					behavior: "smooth"
				});
			}, [diffCursor, diffView, diffMode]);
			const repos = view === null ? [] : view.repos;
			const behindList = repos.flatMap((repo) => repo.locals.filter((branch) => branch.behind > 0).map((branch) => ({
				repo,
				branch
			})));
			const workspaces = props.listWorkspaces();
			const refresh = (root, ref) => {
				if (workspace !== void 0 && workspace !== "") loadOverview(workspace);
				if (root !== void 0) loadLog(root, ref, LOG_PAGE);
				if (tab === "commit" && view !== null) loadFiles(view.repos);
				if (tab === "stash" && view !== null) loadStashes(view.repos);
			};
			const act = (run, done, onSuccess) => {
				setBusy(done);
				setError(null);
				setNotice(null);
				run().then((result) => {
					setBusy(null);
					if (result === void 0 || result.ok !== true) {
						setError(result === void 0 ? t("error.internal") : errorMessage(result.error, t));
						return;
					}
					setNotice(done);
					if (onSuccess !== void 0) onSuccess();
					refresh(selected === null ? void 0 : selected.root, selected === null ? void 0 : selected.name);
				}).catch(() => {
					setBusy(null);
					setError(t("error.internal"));
				});
			};
			/* -------- branch tree / menu -------- */
			const select = (repo, branch, remote) => {
				setSelected({
					root: repo.root,
					name: branch.name,
					remote,
					current: remote === void 0 && branch.current === true
				});
				setDetail(null);
			};
			const openMenu = (event, repo, branch, remote) => {
				event.preventDefault();
				const x = Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8));
				const y = Math.max(8, Math.min(event.clientY, window.innerHeight - 280));
				setMenu({
					x,
					y,
					root: repo.root,
					name: branch.name,
					remote,
					current: remote === void 0 && branch.current === true
				});
			};
			const closePending = () => {
				setPending(null);
				setDraft("");
			};
			const menuItems = () => {
				if (menu === null) return [];
				const items = [];
				items.push({
					id: "checkout",
					label: t("panel.checkout"),
					disabled: menu.current || busy !== null,
					run: () => act(() => props.switchBranch(menu.root, menu.name), t("panel.done.checkout", { branchName: menu.name }))
				});
				items.push({
					id: "new-from",
					label: t("panel.newFrom", { branchName: menu.name }),
					disabled: busy !== null,
					run: () => {
						setPending({
							kind: "create",
							root: menu.root,
							ref: menu.name
						});
						setDraft("");
					}
				});
				if (menu.remote !== void 0) items.push({
					id: "fetch",
					label: t("panel.fetch", { remote: menu.remote }),
					disabled: busy !== null,
					run: () => act(() => props.fetchRemote(menu.root, menu.remote), t("panel.done.fetch", { remote: menu.remote }))
				});
				else if (menu.current) {
					items.push({
						id: "pull",
						label: t("panel.update"),
						disabled: busy !== null,
						run: () => act(() => props.pullBranch(menu.root, menu.name), t("panel.done.pull", { branchName: menu.name }))
					});
					items.push({
						id: "push",
						label: t("panel.push"),
						disabled: busy !== null,
						run: () => act(() => props.pushBranch(menu.root), t("panel.done.push"))
					});
				} else {
					items.push({
						id: "merge",
						label: t("panel.merge", { branchName: menu.name }),
						disabled: busy !== null,
						run: () => act(() => props.mergeBranch(menu.root, menu.name), t("panel.done.merge", { branchName: menu.name }))
					});
					items.push({
						id: "delete",
						label: t("panel.delete"),
						danger: true,
						disabled: busy !== null,
						run: () => setPending({
							kind: "delete",
							root: menu.root,
							name: menu.name
						})
					});
				}
				items.push({
					id: "copy",
					label: t("panel.copy"),
					disabled: false,
					run: () => {
						try {
							Promise.resolve(navigator.clipboard.writeText(menu.name)).catch(() => {});
						} catch {}
						setNotice(t("panel.done.copy", { branchName: menu.name }));
					}
				});
				return items;
			};
			/* -------- commit tab -------- */
			const fileKey = (root, path) => root + "|" + path;
			/** Every changed path of one repository (deduped across groups). */
			const repoKeysOf = (root, status) => {
				const keys = new Set();
				for (const group of [status.staged, status.unstaged, status.untracked]) for (const file of group) keys.add(fileKey(root, file.path));
				return [...keys];
			};
			/** Select or clear every changed file of one repository. */
			const toggleRepoChosen = (root, status, select) => {
				setSelectionTouched(true);
				const keys = repoKeysOf(root, status);
				setChosen((previous) => {
					const next = {
						...previous
					};
					for (const key of keys) {
						if (select === true) next[key] = true;
						else delete next[key];
					}
					return next;
				});
			};
			const toggleChosen = (root, path) => {
				setSelectionTouched(true);
				setChosen((previous) => {
					const next = {
						...previous
					};
					const key = fileKey(root, path);
					if (next[key] === true) delete next[key];
					else next[key] = true;
					return next;
				});
			};
			const chosenOf = (root, files) => {
				if (!selectionTouched) return files;
				return files.filter((file) => chosen[fileKey(root, file.path)] === true);
			};
			const statusOf = (root) => filesByRepo[root] ?? null;
			const repoChanges = () => repos.map((repo) => ({
				repo,
				status: statusOf(repo.root)
			})).filter((entry) => entry.status !== null && (entry.status.staged.length + entry.status.unstaged.length + entry.status.untracked.length + entry.status.conflicts.length) > 0);
			const applyFileOp = (verb, doneCopy) => {
				const targets = repoChanges();
				if (targets.length === 0) return;
				act(async () => {
					for (const entry of targets) {
						const status = entry.status;
						const pool = verb === "stage" ? [...status.unstaged, ...status.untracked] : verb === "unstage" ? status.staged : [...status.unstaged, ...status.untracked];
						const files = chosenOf(entry.repo.root, pool);
						if (files.length === 0) continue;
						const result = await props.fileOp(entry.repo.root, verb, files.map((file) => file.path));
						if (result.ok !== true) return result;
					}
					return {
						ok: true
					};
				}, doneCopy, () => {
					setChosen({});
					setSelectionTouched(false);
					if (view !== null) loadFiles(view.repos);
				});
			};
			const doCommit = () => {
				const targets = repoChanges();
				if (targets.length === 0) {
					setError(t("panel.commit.noChanges"));
					return;
				}
				if (message.trim() === "") {
					setError(t("panel.commit.noMessage"));
					return;
				}
				act(async () => {
					for (const entry of targets) {
						const status = entry.status;
						const pool = [...status.unstaged, ...status.untracked];
						const files = chosenOf(entry.repo.root, pool);
						if (files.length === 0 && status.staged.length === 0) continue;
						if (files.length > 0) {
							const staged = await props.fileOp(entry.repo.root, "stage", files.map((file) => file.path));
							if (staged.ok !== true) return staged;
						}
						const committed = await props.commit(entry.repo.root, message.trim());
						if (committed.ok !== true) return committed;
					}
					return {
						ok: true
					};
				}, t("panel.done.commit"), () => {
					setMessage("");
					setChosen({});
					setSelectionTouched(false);
					if (view !== null) loadFiles(view.repos);
				});
			};
			const doStash = (repo, verb, ref) => act(() => props.stashOp(repo.root, verb, ref, stashMessage), t(verb === "push" ? "panel.done.stashPush" : verb === "pop" ? "panel.done.stashPop" : verb === "apply" ? "panel.done.stashApply" : "panel.done.stashDrop"), () => {
				if (view !== null) loadStashes(view.repos);
			});
			/* -------- render -------- */
			const branchRow = (repo, branch, remote) => {
				const isRemote = remote !== void 0;
				const active = selected !== null && selected.root === repo.root && selected.name === branch.name;
				const current = !isRemote && branch.current === true;
				return hs("button", {
					type: "button",
					className: cx(C.refRow, active && C.refRowActive, isRemote && C.refRowRemote, current && C.refRowCurrent),
					"data-gitgraph-ref": branch.name,
					"data-gitgraph-remote-ref": remote || void 0,
					"data-gitgraph-current": current || void 0,
					onClick: () => select(repo, branch, remote),
					onContextMenu: (event) => openMenu(event, repo, branch, remote),
					title: current ? `${branch.name} · ${t("panel.current")}` : branch.name,
					children: [
						h("span", {
							className: cx(C.refDot, current && C.refDotCurrent),
							"aria-hidden": "true",
							children: current ? "●" : isRemote ? "◇" : "○"
						}),
						h("span", {
							className: C.refName,
							children: repos.length > 1 ? `${branch.name} (${repo.name})` : branch.name
						}),
						current && h("span", {
							className: C.refBadge,
							children: t("panel.current")
						}),
						!isRemote && branch.ahead > 0 && h("span", {
							className: C.treeAhead,
							title: t("panel.tree.ahead", { count: branch.ahead }),
							children: `↑${branch.ahead}`
						}),
						!isRemote && branch.behind > 0 && h("span", {
							className: C.treeBehind,
							title: t("panel.tree.behind", { count: branch.behind, upstream: branch.upstream }),
							children: `↓${branch.behind}`
						}),
						h("span", {
							className: C.refOid,
							children: branch.head
						})
					]
				}, (isRemote ? "r:" : "l:") + repo.root + ":" + branch.name);
			};
			const matches = (name) => {
				const needle = treeSearch.trim().toLowerCase();
				return needle === "" || name.toLowerCase().includes(needle);
			};
			const renderTree = () => {
				const heads = repos.filter((repo) => repo.branch !== "");
				const locals = repos.map((repo) => ({
					repo,
					branches: repo.locals.filter((branch) => matches(branch.name))
				})).filter((entry) => entry.branches.length > 0);
				const remoteGroups = {};
				for (const repo of repos) for (const branch of repo.remotes) {
					if (!matches(branch.name)) continue;
					if (remoteGroups[branch.remote] === void 0) remoteGroups[branch.remote] = [];
					remoteGroups[branch.remote].push({
						repo,
						branch
					});
				}
				return hs("div", {
					className: C.tree,
					"data-gitgraph-tree": true,
					children: [h("input", {
						className: C.treeSearch,
						value: treeSearch,
						placeholder: t("panel.tree.search"),
						onChange: (event) => setTreeSearch(event.target.value),
						"data-gitgraph-tree-search": true
					}, "tree-search"), heads.length > 0 && hs("div", {
						className: C.refGroup,
						children: [h("div", {
							className: C.refGroupTitle,
							children: t("panel.head")
						}), heads.map((repo) => {
							const local = repo.locals.find((branch) => branch.name === repo.branch);
							return branchRow(repo, {
								name: repo.branch,
								head: repo.head,
								current: true,
								ahead: local === void 0 ? 0 : local.ahead,
								behind: local === void 0 ? 0 : local.behind,
								upstream: local === void 0 ? "" : local.upstream
							}, void 0);
						})]
					}), locals.length > 0 && hs("div", {
						className: C.refGroup,
						children: [h("div", {
							className: C.refGroupTitle,
							children: t("panel.local")
						}), locals.map((entry) => hs(Frag, {
							children: [h("div", {
								className: C.repoHint,
								children: entry.repo.name
							}, "hint"), entry.branches.map((branch) => branchRow(entry.repo, branch, void 0))]
						}, entry.repo.root))]
					}), Object.keys(remoteGroups).length > 0 && hs("div", {
						className: C.refGroup,
						children: [h("div", {
							className: C.refGroupTitle,
							children: t("panel.remote")
						}), Object.keys(remoteGroups).map((remoteName) => hs(Frag, {
							children: [h("div", {
								className: C.repoHint,
								children: remoteName
							}, "hint"), remoteGroups[remoteName].map((entry) => branchRow(entry.repo, entry.branch, remoteName))]
						}, remoteName))]
					})]
				});
			};
			const renderLogPane = () => {
				const commits = logView === null ? [] : logView.commits;
				const needle = logSearch.trim().toLowerCase();
				const shown = needle === "" ? commits : commits.filter((commit) => commit.subject.toLowerCase().includes(needle) || commit.oid.toLowerCase().includes(needle) || commit.author.toLowerCase().includes(needle));
				const lanes = computeLanes(shown);
				return hs("div", {
					className: C.logPane,
					"data-gitgraph-log": true,
					children: [hs("div", {
						className: C.logHead,
						children: [h("span", {
							className: C.logBranch,
							title: selected === null ? "" : selected.root,
							children: selected === null ? t("panel.log.title") : selected.name
						}), syncView !== null && syncView.upstream !== "" && hs("span", {
							className: C.logSync,
							title: t("panel.log.upstream", { upstream: syncView.upstream }),
							children: [hs("span", {
								className: C.logAhead,
								children: ["↑", syncView.ahead]
							}), hs("span", {
								className: C.logBehind,
								children: ["↓", syncView.behind]
							}), h("span", {
								className: C.logUpstream,
								children: syncView.upstream
							})]
						}), h("input", {
							className: C.logSearch,
							value: logSearch,
							placeholder: t("panel.log.filter"),
							onChange: (event) => setLogSearch(event.target.value)
						}, "log-search"), logLoading && h("span", {
							className: C.panelSub,
							children: t("panel.log.loading")
						})]
					}), logView === null ? h("div", {
						className: C.logEmpty,
						children: logLoading ? t("panel.log.loading") : selected === null ? t("panel.log.select") : t("panel.log.empty")
					}) : hs(Frag, {
						children: [h("div", {
							className: C.logList,
							children: shown.map((commit, index) => {
								const row = lanes[index];
								if (row === void 0) return null;
								const active = detail !== null && detail.commit !== void 0 && detail.commit.oid === commit.oid;
								return hs("div", {
									className: cx(C.logRow, active && C.logRowActive, commit.parents.length > 1 && C.logRowMerge),
									"data-gitgraph-commit": commit.oid,
									onClick: () => loadDetail(selected.root, commit.oid),
									children: [h("span", {
										className: C.logLanes,
										"aria-hidden": "true",
										children: row.columns.map((glyph, column) => h("span", {
											className: cx(C.logLaneCell, glyph === "node" && C.logLaneNode, glyph === "merge" && C.logLaneMerge, glyph === "pass" && C.logLanePass, C["laneColor" + column % 6]),
											children: glyphChar(glyph)
										}, column))
									}, "lanes"), hs("span", {
										className: C.logMain,
										children: [h("span", {
											className: C.logSubject,
											title: commit.subject,
											children: commit.subject
										}), hs("span", {
											className: C.logMeta,
											children: [commit.refs.map((ref) => h("span", {
												className: cx(C.logRef, ref.startsWith("HEAD") ? C.logRefCurrent : void 0),
												title: ref,
												children: ref
											}, ref))]
										})]
									}, "main"), h("span", {
										className: C.logAuthor,
										title: `${commit.author} / ${commit.committer}`,
										children: commit.committer !== "" && commit.committer !== commit.author ? `${commit.author} → ${commit.committer}` : commit.author
									}, "author"), h("span", {
										className: C.logDate,
										children: formatCommitDate(commit.authorTime, t)
									}, "date")]
								}, commit.oid);
							})
						}), logView.hasMore && h("button", {
							type: "button",
							className: C.logMore,
							onClick: () => loadLog(selected.root, selected.name, logView.commits.length + LOG_PAGE),
							children: t("panel.log.more")
						})]
					})]
				});
			};
			const renderDetail = () => {
				if (detail === null) return h("div", {
					className: C.detailPane,
					"data-gitgraph-detail": "empty",
					children: h("div", {
						className: C.logEmpty,
						children: t("panel.detail.empty")
					})
				});
				const commit = detail.commit ?? {};
				return hs("div", {
					className: C.detailPane,
					"data-gitgraph-detail": "commit",
					children: [hs("div", {
						className: C.detailHead,
						children: [h("span", {
							className: C.detailHash,
							children: commit.short
						}), h("span", {
							className: C.detailSubject,
							title: commit.subject,
							children: commit.subject
						})]
					}), commit.body !== "" && h("div", {
						className: C.detailBody,
						children: commit.body
					}), hs("div", {
						className: C.detailMeta,
						children: [h("div", { children: `${t("panel.detail.author")}: ${commit.author} <${commit.authorEmail}>` }), h("div", { children: `${t("panel.detail.committer")}: ${commit.committer} <${commit.committerEmail}>` }), h("div", { children: `${t("panel.detail.date")}: ${formatCommitDate(commit.authorTime, t)}` })]
					}), h("div", {
						className: C.detailFiles,
						children: (detail.files ?? []).map((file) => hs("button", {
							type: "button",
							className: C.fileRowBtn,
							"data-gitgraph-diff-file": file.path,
							onClick: () => openDiff(selected === null ? "" : selected.root, file.path, {
								oid: detail.commit === void 0 ? void 0 : detail.commit.oid
							}, baseOf(file.path)),
							children: [h("span", {
								className: cx(C.fileLetter, statusBucket(file.code)),
								children: statusLetter(file.code)
							}), fileKindBadge(file.path), h("span", {
								className: C.filePathText,
								title: file.path,
								children: [h("span", {
									className: C.fileName,
									children: baseOf(file.path)
								}), dirOf(file.path) === "" ? null : h("span", {
									className: C.fileDirFull,
									children: dirOf(file.path)
								})]
							})]
						}, file.path))
					})]
				});
			};
			/** One file row of the changes tree (checkbox selects, the name opens the diff). */
			const changeRowView = (repo, file, stage) => hs("div", {
				className: C.changeRow,
				children: [h("input", {
					type: "checkbox",
					checked: chosen[fileKey(repo.root, file.path)] === true,
					onChange: () => toggleChosen(repo.root, file.path)
				}), h("span", {
					className: cx(C.fileLetter, statusBucket(file.code)),
					children: statusLetter(file.code)
				}), fileKindBadge(file.path), h("button", {
					type: "button",
					className: C.filePathBtn,
					title: t("panel.diff.open", { path: file.path }),
					"data-gitgraph-diff-file": file.path,
					onClick: () => openDiff(repo.root, file.path, {
						stage
					}, baseOf(file.path)),
					children: [h("span", {
						className: C.fileName,
						children: baseOf(file.path)
					}), dirOf(file.path) === "" ? null : h("span", {
						className: C.fileDirFull,
						children: dirOf(file.path)
					})]
				})]
			}, stage + ":" + repo.root + ":" + file.path);
			const renderCommitTab = () => {
				const entries = repoChanges();
				const total = entries.reduce((sum, entry) => sum + entry.status.staged.length + entry.status.unstaged.length + entry.status.untracked.length, 0);
				return hs("div", {
					className: C.commitTab,
					"data-gitgraph-commit-tab": true,
					children: [hs("div", {
						className: C.commitToolbar,
						children: [(() => {
							const keys = new Set();
							for (const entry of entries) for (const group of [entry.status.staged, entry.status.unstaged, entry.status.untracked]) for (const file of group) keys.add(fileKey(entry.repo.root, file.path));
							const selected = [...keys].filter((key) => chosen[key] === true).length;
							const all = keys.size > 0 && selected === keys.size;
							const some = selected > 0 && !all;
							return h("label", {
								className: C.selectAll,
								key: "select-all",
								title: t("panel.selectAllHint"),
								children: [h("input", {
									type: "checkbox",
									"data-gitgraph-select-all": true,
									checked: all,
									disabled: keys.size === 0 || busy !== null,
									ref: (node) => {
										if (node !== null) node.indeterminate = some;
									},
									onChange: (event) => {
										setSelectionTouched(true);
										if (event.target.checked === true) {
											const next = {};
											for (const key of keys) next[key] = true;
											setChosen(next);
										} else setChosen({});
									}
								}), h("span", {
									children: t("panel.selectAll")
								}), h("span", {
									className: C.selectAllCount,
									children: `${selected}/${keys.size}`
								})]
							});
						})(), h("button", {
							type: "button",
							className: C.promptButton,
							disabled: busy !== null,
							onClick: () => applyFileOp("stage", t("panel.done.stage")),
							children: t("panel.action.stage")
						}), h("button", {
							type: "button",
							className: C.promptButton,
							disabled: busy !== null,
							onClick: () => applyFileOp("unstage", t("panel.done.unstage")),
							children: t("panel.action.unstage")
						}), h("button", {
							type: "button",
							className: cx(C.promptButton, C.promptButtonDanger),
							disabled: busy !== null,
							onClick: () => setPending({ kind: "discard" }),
							children: t("panel.action.discard")
						}), h("span", {
							className: C.commitCount,
							children: t("panel.commit.count", { count: total })
						}, "count")]
					}), entries.length === 0 ? h("div", {
						className: C.panelEmpty,
						children: loading ? t("panel.loading") : t("panel.commit.clean")
					}) : entries.map((entry) => hs("section", {
						className: C.repoBlock,
						"data-gitgraph-changes": entry.repo.root,
						children: [hs("div", {
							className: C.repoHead,
							children: [(() => {
								const keys = repoKeysOf(entry.repo.root, entry.status);
								const selected = keys.filter((key) => chosen[key] === true).length;
								const all = keys.length > 0 && selected === keys.length;
								return h("label", {
									className: C.selectAll,
									title: t("panel.selectAllRepo", { repo: entry.repo.name }),
									children: [h("input", {
										type: "checkbox",
										"data-gitgraph-select-repo": entry.repo.root,
										checked: all,
										disabled: busy !== null,
										ref: (node) => {
											if (node !== null) node.indeterminate = selected > 0 && !all;
										},
										onChange: (event) => toggleRepoChosen(entry.repo.root, entry.status, event.target.checked)
									}), h("span", {
										className: C.selectAllCount,
										children: `${selected}/${keys.length}`
									})]
								});
							})(), h(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 14 }), h("span", {
								className: C.repoName,
								title: entry.repo.root,
								children: entry.repo.name
							}), h("span", {
								className: C.repoPath,
								children: entry.repo.relative === "" ? t("repo.root") : entry.repo.relative
							}), h("span", {
								className: C.repoStats,
								children: entry.status.branch
							})]
						}), entry.status.staged.length > 0 && hs("div", {
							className: C.refGroup,
							children: [hs("div", {
								className: C.refGroupTitle,
								children: [t("panel.staged"), " · ", entry.status.staged.length]
							}), entry.status.staged.map((file) => changeRowView(entry.repo, file, "staged"))]
						}), entry.status.unstaged.length > 0 && hs("div", {
							className: C.refGroup,
							children: [hs("div", {
								className: C.refGroupTitle,
								children: [t("panel.changes"), " · ", entry.status.unstaged.length]
							}), entry.status.unstaged.map((file) => changeRowView(entry.repo, file, "unstaged"))]
						}), entry.status.untracked.length > 0 && hs("div", {
							className: C.refGroup,
							children: [hs("div", {
								className: C.refGroupTitle,
								children: [t("panel.untracked"), " · ", entry.status.untracked.length]
							}), entry.status.untracked.map((file) => changeRowView(entry.repo, file, "untracked"))]
						})]
					}, entry.repo.root)), hs("div", {
						className: C.commitBox,
						children: [h("textarea", {
							className: C.commitMessage,
							value: message,
							placeholder: t("panel.commit.placeholder"),
							onChange: (event) => setMessage(event.target.value)
						}), h("button", {
							type: "button",
							className: cx(C.promptButton, C.promptButtonPrimary),
							disabled: busy !== null,
							onClick: doCommit,
							children: t("panel.commit.button")
						})]
					})]
				});
			};
			const renderStashTab = () => {
				const all = [];
				for (const repo of repos) for (const stash of stashesByRepo[repo.root] ?? []) all.push({
					repo,
					stash
				});
				return hs("div", {
					className: C.commitTab,
					"data-gitgraph-stash-tab": true,
					children: [hs("div", {
						className: C.commitToolbar,
						children: [h("input", {
							className: C.promptInput,
							value: stashMessage,
							placeholder: t("panel.stash.placeholder"),
							onChange: (event) => setStashMessage(event.target.value)
						}), h("button", {
							type: "button",
							className: C.promptButton,
							disabled: busy !== null || repos.length === 0,
							onClick: () => {
								for (const repo of repos) doStash(repo, "push");
							},
							children: t("panel.stash.push")
						})]
					}), all.length === 0 ? h("div", {
						className: C.panelEmpty,
						children: t("panel.stash.empty")
					}) : all.map((entry) => hs("div", {
						className: C.stashRow,
						"data-gitgraph-stash": entry.stash.ref,
						children: [hs("span", {
							className: C.stashInfo,
							children: [h("span", {
								className: C.stashSubject,
								children: entry.stash.subject
							}), h("span", {
								className: C.stashMeta,
								children: `${repos.length > 1 ? `${entry.repo.name} · ` : ""}${entry.stash.ref} · ${entry.stash.date}`
							})]
						}), hs("span", {
							className: C.stashActions,
							children: [h("button", {
								type: "button",
								className: C.promptButton,
								disabled: busy !== null,
								onClick: () => doStash(entry.repo, "apply", entry.stash.ref),
								children: t("panel.stash.apply")
							}), h("button", {
								type: "button",
								className: C.promptButton,
								disabled: busy !== null,
								onClick: () => doStash(entry.repo, "pop", entry.stash.ref),
								children: t("panel.stash.pop")
							}), h("button", {
								type: "button",
								className: cx(C.promptButton, C.promptButtonDanger),
								disabled: busy !== null,
								onClick: () => doStash(entry.repo, "drop", entry.stash.ref),
								children: t("panel.stash.drop")
							})]
						})]
					}, entry.repo.root + ":" + entry.stash.ref))]
				});
			};
			const renderBody = () => {
				if (tab === "commit") return renderCommitTab();
				if (tab === "stash") return renderStashTab();
				return hs("div", {
					className: C.panelBody,
					children: [renderTree(), renderLogPane()]
				});
			};
			/* -------- diff data: whole file as git gave it (unified=1e6 context) -------- */
			const diffText = diffView === null ? "" : diffView.text;
			const diffSplitRows = diffView === null || diffView.loading || diffView.error !== null ? [] : splitDiffRows(diffText);
			const diffUnifiedLines = diffView === null ? [] : diffText.split("\n");
			const isDiffChangeLine = (line) => line.startsWith("+") && !line.startsWith("+++") || line.startsWith("-") && !line.startsWith("---");
			const diffChangeStarts = (() => {
				const out = [];
				if (diffMode === "split") {
					for (let index = 0; index < diffSplitRows.length; index += 1) {
						const kind = diffSplitRows[index].kind;
						if (kind === "ctx" || kind === "hunk") continue;
						const previous = index > 0 ? diffSplitRows[index - 1].kind : "ctx";
						if (previous === "ctx" || previous === "hunk") out.push(index);
					}
				} else {
					for (let index = 0; index < diffUnifiedLines.length; index += 1) {
						if (!isDiffChangeLine(diffUnifiedLines[index])) continue;
						const previous = index > 0 ? diffUnifiedLines[index - 1] : "";
						if (!isDiffChangeLine(previous)) out.push(index);
					}
				}
				return out;
			})();
			const diffStartMap = new Map(diffChangeStarts.map((rowIndex, cursor) => [rowIndex, cursor]));
			const diffChangeCount = diffChangeStarts.length;
			return hs("div", {
				className: C.panel,
				"data-gitgraph-panel": true,
				"data-dsh-plugin": "git-graph",
				children: [hs("div", {
					className: C.panelHeader,
					children: [hs("div", {
						className: C.panelHeading,
						children: [hs("div", {
							className: C.panelTitleRow,
							children: [h("div", {
								className: C.panelTitle,
								children: t("nav.title")
							}), hs("div", {
								className: C.tabs,
								children: [h("button", {
									type: "button",
									className: cx(C.tab, tab === "log" && C.tabActive),
									"data-gitgraph-tab": "log",
									onClick: () => setTab("log"),
									children: behindList.length > 0 ? hs(Frag, {
										children: [t("panel.tab.log"), h("span", {
											className: C.tabBadge,
											children: behindList.length
										})]
									}) : t("panel.tab.log")
								}), h("button", {
									type: "button",
									className: cx(C.tab, tab === "commit" && C.tabActive),
									"data-gitgraph-tab": "commit",
									onClick: () => setTab("commit"),
									children: t("panel.tab.commit")
								}), h("button", {
									type: "button",
									className: cx(C.tab, tab === "stash" && C.tabActive),
									"data-gitgraph-tab": "stash",
									onClick: () => setTab("stash"),
									children: t("panel.tab.stash")
								})]
							})]
						}), h("div", {
							className: C.panelSub,
							title: workspace,
							children: workspace === void 0 || workspace === "" ? t("panel.noWorkspace") : `${workspaceLabel(workspace)} · ${t("panel.repoCount", { count: repos.length })}`
						})]
					}), hs("div", {
						className: C.panelToolbar,
						children: [workspaces.length > 1 && h("select", {
							className: C.panelSelect,
							value: workspace ?? "",
							onChange: (event) => setWorkspace(event.target.value),
							children: workspaces.map((entry) => h("option", {
								value: entry.path,
								children: entry.name
							}, entry.path))
						}), busy !== null && h("span", {
							className: C.panelSub,
							children: t("panel.working")
						}), h("button", {
							type: "button",
							className: C.panelRefresh,
							disabled: loading || workspace === void 0 || workspace === "",
							onClick: () => {
								if (workspace !== void 0 && workspace !== "") loadOverview(workspace);
								refresh(selected === null ? void 0 : selected.root, selected === null ? void 0 : selected.name);
							},
							children: t("panel.refresh")
						})]
					})]
				}), error !== null && h("div", {
					className: C.panelNotice,
					children: error
				}), notice !== null && h("div", {
					className: cx(C.panelNotice, C.panelNoticeOk),
					children: notice
				}), behindList.length > 0 && hs("div", {
					className: C.remoteBanner,
					"data-gitgraph-remote-banner": true,
					children: [h("span", {
						className: C.remoteBannerTitle,
						children: t("panel.remoteNew", { count: behindList.length })
					}), behindList.slice(0, 4).map((entry) => h("button", {
						type: "button",
						className: C.remoteBannerItem,
						title: `${entry.branch.upstream} → ${entry.branch.name}`,
						onClick: () => select(entry.repo, entry.branch, void 0),
						children: `${entry.repo.name}/${entry.branch.name} ↓${entry.branch.behind}`
					}, entry.repo.root + ":" + entry.branch.name)), h("button", {
						type: "button",
						className: C.promptButton,
						onClick: () => {
							lastFetch.current = 0;
							if (workspace !== void 0 && workspace !== "") loadOverview(workspace);
						},
						children: t("panel.remoteCheck")
					})]
				}), pending !== null && hs("div", {
					className: C.promptBar,
					"data-gitgraph-prompt": pending.kind,
					children: [h("span", {
						className: C.promptLabel,
						children: pending.kind === "create" ? t("panel.prompt.create", { ref: pending.ref }) : pending.kind === "delete" ? t("panel.prompt.delete", { branchName: pending.name }) : t("panel.prompt.discard")
					}), pending.kind === "create" && h("input", {
						className: C.promptInput,
						value: draft,
						placeholder: t("panel.prompt.namePlaceholder"),
						onChange: (event) => setDraft(event.target.value),
						onKeyDown: (event) => {
							if (event.key !== "Enter" || draft.trim() === "") return;
							act(() => props.createBranchFrom(pending.root, draft.trim(), pending.ref), t("panel.done.create", { branchName: draft.trim() }), closePending);
						}
					}), pending.kind === "create" && h("button", {
						type: "button",
						className: cx(C.promptButton, C.promptButtonPrimary),
						disabled: busy !== null || draft.trim() === "",
						onClick: () => act(() => props.createBranchFrom(pending.root, draft.trim(), pending.ref), t("panel.done.create", { branchName: draft.trim() }), closePending),
						children: t("panel.prompt.create2")
					}), pending.kind === "delete" && hs(Frag, {
						children: [h("button", {
							type: "button",
							className: cx(C.promptButton, C.promptButtonDanger),
							disabled: busy !== null,
							onClick: () => act(() => props.deleteBranch(pending.root, pending.name, false), t("panel.done.delete", { branchName: pending.name }), () => {
								if (selected !== null && selected.name === pending.name) setSelected(null);
								closePending();
							}),
							children: t("panel.prompt.delete2")
						}), h("button", {
							type: "button",
							className: C.promptButton,
							disabled: busy !== null,
							onClick: () => act(() => props.deleteBranch(pending.root, pending.name, true), t("panel.done.delete", { branchName: pending.name }), () => {
								if (selected !== null && selected.name === pending.name) setSelected(null);
								closePending();
							}),
							children: t("panel.prompt.force")
						})]
					}), pending.kind === "discard" && h("button", {
						type: "button",
						className: cx(C.promptButton, C.promptButtonDanger),
						disabled: busy !== null,
						onClick: () => applyFileOp("discard", t("panel.done.discard")),
						children: t("panel.prompt.discard2")
					}), h("button", {
						type: "button",
						className: C.promptButton,
						disabled: busy !== null,
						onClick: closePending,
						children: t("panel.prompt.cancel")
					})]
				}), renderBody(), detail !== null && hs(Frag, {
					children: [h("div", {
						className: C.detailBackdrop,
						"data-gitgraph-detail-backdrop": true,
						onClick: () => setDetail(null)
					}), hs("div", {
						className: C.detailDialog,
						role: "dialog",
						"aria-label": t("panel.detail.title"),
						"data-gitgraph-detail-dialog": true,
						children: [hs("div", {
							className: C.detailDialogHead,
							children: [h("span", {
								className: C.detailDialogTitle,
								children: t("panel.detail.title")
							}), h("button", {
								type: "button",
								className: C.detailClose,
								"aria-label": t("graph.close"),
								onClick: () => setDetail(null),
								children: "×"
							})]
						}), renderDetail()]
					})]
				}), diffView !== null && hs(Frag, {
					children: [h("div", {
						className: C.detailBackdrop,
						style: {
							zIndex: 950
						},
						"data-gitgraph-diff-backdrop": true,
						onClick: closeDiff
					}), hs("div", {
						className: C.detailDialog,
						style: {
							zIndex: 951,
							width: "min(1100px,94vw)",
							overflow: "hidden"
						},
						role: "dialog",
						"aria-label": t("panel.diff.title"),
						"data-gitgraph-diff-dialog": true,
						children: [hs("div", {
							className: C.detailDialogHead,
							children: [hs("div", {
								className: C.diffHeadInfo,
								children: [h("span", {
									className: C.detailDialogTitle,
									children: diffView.title
								}), h("span", {
									className: C.diffPath,
									title: diffView.path,
									children: diffView.path
								})]
							}), hs("div", {
								className: C.diffTools,
								children: [h("button", {
									type: "button",
									className: cx(C.diffModeBtn, !diffView.editable && C.menuItemDisabled),
									"data-gitgraph-diff-edit": true,
									disabled: diffView.editable !== true || editing,
									title: diffView.editable === true ? t("panel.diff.editHint") : t("panel.diff.readonly"),
									onClick: startEdit,
									children: t("panel.diff.edit")
								}), editing && hs(Frag, {
									children: [h("button", {
										type: "button",
										className: cx(C.promptButton, C.promptButtonPrimary),
										"data-gitgraph-diff-save": true,
										disabled: editLoading,
										onClick: saveEdit,
										children: t("panel.diff.save")
									}), h("button", {
										type: "button",
										className: C.promptButton,
										"data-gitgraph-diff-cancel": true,
										onClick: () => {
											setEditing(false);
											setEditError(null);
										},
										children: t("panel.diff.cancel")
									})]
								}), hs("div", {
									className: C.diffNav,
									children: [h("button", {
										type: "button",
										className: C.diffNavBtn,
										"data-gitgraph-diff-prev": true,
										disabled: diffChangeCount === 0 || diffCursor <= 0,
										title: t("panel.diff.prev"),
										onClick: () => setDiffCursor((cursor) => Math.max(0, cursor - 1)),
										children: "‹"
									}), h("span", {
										className: C.diffCount,
										"data-gitgraph-diff-counter": true,
										children: diffChangeCount === 0 ? t("panel.diff.noChanges") : `${Math.min(diffCursor + 1, diffChangeCount)} / ${diffChangeCount}`
									}), h("button", {
										type: "button",
										className: C.diffNavBtn,
										"data-gitgraph-diff-next": true,
										disabled: diffChangeCount === 0 || diffCursor >= diffChangeCount - 1,
										title: t("panel.diff.next"),
										onClick: () => setDiffCursor((cursor) => Math.min(diffChangeCount - 1, cursor + 1)),
										children: "›"
									})]
								}), h("button", {
									type: "button",
									className: cx(C.diffModeBtn, diffMode === "split" && C.diffModeActive),
									"data-gitgraph-diff-mode": "split",
									onClick: () => {
										setDiffMode("split");
										setDiffCursor(0);
									},
									children: t("panel.diff.split")
								}), h("button", {
									type: "button",
									className: cx(C.diffModeBtn, diffMode === "unified" && C.diffModeActive),
									"data-gitgraph-diff-mode": "unified",
									onClick: () => {
										setDiffMode("unified");
										setDiffCursor(0);
									},
									children: t("panel.diff.unified")
								}), h("button", {
									type: "button",
									className: C.detailClose,
									onClick: closeDiff,
									children: "×"
								})]
							})]
						}), editing ? hs(Frag, {
							children: [editError !== null && h("div", {
								className: C.panelNotice,
								children: editError
							}), h("textarea", {
								className: C.diffEditor,
								"data-gitgraph-diff-editor": true,
								value: editLoading ? t("panel.log.loading") : editText,
								disabled: editLoading,
								spellCheck: false,
								onChange: (event) => setEditText(event.target.value)
							})]
						}) : diffView.loading ? h("div", {
							className: C.logEmpty,
							children: t("panel.log.loading")
						}) : diffView.error !== null ? h("div", {
							className: C.panelNotice,
							children: diffView.error
						}) : diffView.binary === true ? h("div", {
							className: C.logEmpty,
							children: t("panel.diff.binary")
						}) : diffText === "" ? h("div", {
							className: C.logEmpty,
							children: t("panel.diff.empty")
						}) : hs(Frag, {
							children: [diffView.truncated === true && h("div", {
								className: C.panelNotice,
								children: t("panel.diff.truncated")
							}), diffMode === "split" ? h("div", {
								ref: diffBodyRef,
								className: C.splitScroll,
								"data-gitgraph-diff": true,
								"data-gitgraph-diff-mode": "split",
								children: h("table", {
									className: C.splitTable,
									children: h("tbody", {
										children: diffSplitRows.map((row, index) => row.kind === "hunk" ? h("tr", {
										className: C.splitHunkRow,
										children: h("td", {
											className: C.splitHunk,
											colSpan: 4,
											children: row.text
										})
									}, index) : h("tr", {
										className: cx(C.splitRow, row.kind !== "ctx" && C.splitRowChange),
										"data-diff-change-start": diffStartMap.get(index) ?? void 0,
										children: [h("td", {
											className: C.splitNo,
											children: row.leftNo
										}), h("td", {
											className: cx(C.splitCell, row.kind === "del" && C.splitDel, row.kind === "mod" && C.splitDel),
											children: row.leftText === "" ? " " : row.leftText
										}), h("td", {
											className: cx(C.splitNo, C.splitNoRight),
											children: row.rightNo
										}), h("td", {
											className: cx(C.splitCell, row.kind === "add" && C.splitAdd, row.kind === "mod" && C.splitAdd),
											children: row.rightText === "" ? " " : row.rightText
										})]
									}, index))
									})
								})
							}) : h("div", {
								ref: diffBodyRef,
								className: C.diffBody,
								"data-gitgraph-diff": true,
								"data-gitgraph-diff-mode": "unified",
								children: diffUnifiedLines.map((line, index) => h("div", {
									className: cx(C.diffLine, diffLineClass(line)),
									"data-diff-change-start": diffStartMap.get(index) ?? void 0,
									children: line === "" ? " " : line
								}, index))
							})]
						})]
					})]
				}), menu !== null && hs(Frag, {
					children: [h("div", {
						className: C.menuBackdrop,
						onClick: () => setMenu(null),
						onContextMenu: (event) => {
							event.preventDefault();
							setMenu(null);
						}
					}), h("div", {
						className: C.menu,
						role: "menu",
						style: {
							left: menu.x,
							top: menu.y,
							width: MENU_WIDTH
						},
						"data-gitgraph-menu": true,
						children: menuItems().map((item) => h("button", {
							type: "button",
							role: "menuitem",
							className: cx(C.menuItem, item.danger && C.menuItemDanger, item.disabled && C.menuItemDisabled),
							"data-gitgraph-action": item.id,
							disabled: item.disabled,
							onClick: () => {
								setMenu(null);
								item.run();
							},
							children: item.label
						}, item.id))
					})]
				})]
			});
		}
		//#endregion

		//#region src/client/main-session.ts
		/**
		* Resolve the Session the main view currently shows.
		*
		* Reads the catalog's rows rather than a per-id retain-info source: ownership
		* counts ride the list snapshot, so this neither allocates observers nor opens
		* history, and a subscription to the list still fires when the selection moves.
		* @param byId - the session catalog's rows (`SessionListState.byId`), when available.
		* @returns the main-view session id, or undefined when the main view shows none.
		*/
		function mainViewSessionId(byId) {
			if (byId === void 0 || byId === null) return void 0;
			for (const row of Object.values(byId)) if (row !== void 0 && (row.retainedBy?.mainView ?? 0) > 0) return row.id;
		}
		//#endregion
		//#region src/client/auto-isolation.ts
		/** Log line prefix for every auto-isolation diagnostic. */
		const TAG = "[git-graph] auto-isolation";
		/**
		* Probe the two service shapes the wrapper needs: the navigation face that
		* owns `startSession` and the registry face that owns the workspace rows.
		* The wrapper only installs when every member it shadows or calls is a
		* function of the expected kind; a changed client-runtime surface leaves the
		* official behavior untouched.
		*
		* Both faces have been read from the live context rather than assumed:
		* 0.1.7's `workspaces` service is the registry (no `startSession`), and the
		* navigation service supplies `startSession` — reading only `workspaces`, as
		* this probe did before the split, disabled the feature on every 0.1.7 boot
		* and printed the shape warning on each page load (#1690).
		* @param navigation - the navigation service (`uiWorkspace`), or undefined.
		* @param registry - the registry service (`workspaces`), or undefined.
		* @returns the probed pair, or null when either face is unusable.
		*/
		function probeWorkspaces(navigation, registry) {
			if (typeof navigation !== "object" || navigation === null) return null;
			if (typeof registry !== "object" || registry === null) return null;
			const nav = navigation;
			const reg = registry;
			if (typeof nav.startSession !== "function") return null;
			if (typeof reg.create !== "function" || typeof reg.list?.getSnapshot !== "function") return null;
			return {
				navigation: nav,
				registry: reg
			};
		}
		/**
		* Install the startSession wrapper on the shared navigation service.
		* @param scope - client context carrying the navigation (`uiWorkspace`) and
		* registry (`workspaces`) faces plus the sessions list.
		* @param git - the /git/* client (config + worktree verbs).
		* @returns the disposer restoring the official method.
		*/
		function installAutoIsolation(scope, git) {
			const probe = probeWorkspaces(scope.uiWorkspace, scope.workspaces);
			if (probe === null) {
				console.warn(`${TAG} disabled: the uiWorkspace/workspaces service shape changed; using the official new-session behavior`);
				return () => {};
			}
			const { navigation, registry } = probe;
			let original;
			try {
				original = navigation.startSession;
			} catch {
				console.warn(`${TAG} disabled: startSession is not readable`);
				return () => {};
			}
			/**
			* The target resolution the official New Session uses (explicit > the
			* current session's workspace > the first registered workspace). The 0.1.7
			* `workspaces` snapshot carries no `recentWorkspaceId`; the first row is the
			* registry's own ordering, which the New Session default follows.
			*/
			const resolveTarget = (workspaceId) => {
				const snapshot = registry.list.getSnapshot();
				const current = mainViewSessionId(scope.sessions.list.getSnapshot().byId);
				const currentWorkspaceId = current === void 0 ? void 0 : snapshot.items.find((item) => item.sessionIds.includes(current))?.workspaceId;
				return workspaceId ?? currentWorkspaceId ?? snapshot.items[0]?.workspaceId;
			};
			/**
			* Targets with a routing flow already in flight. The new-session button
			* fires `startSession` on every click and nothing upstream debounces it, so
			* a fast double click would otherwise run two isolation flows and create two
			* worktrees; the second click is absorbed while the first is routing.
			*/
			const routing = /* @__PURE__ */ new Set();
			const routed = (workspaceId) => {
				const target = resolveTarget(workspaceId);
				if (target === void 0) {
					original.call(navigation);
					return;
				}
				if (routing.has(target)) return;
				routing.add(target);
				(async () => {
					const configResult = await git.config();
					if (!configResult.ok || !configResult.value.autoIsolate) {
						original.call(navigation, target);
						return;
					}
					const config = configResult.value;
					const item = registry.list.getSnapshot().items.find((entry) => entry.workspaceId === target);
					if (item === void 0) {
						original.call(navigation, target);
						return;
					}
					const home = config.worktreesHome;
					if (item.path.startsWith(home + "/") || item.path.startsWith(home + "\\")) {
						original.call(navigation, target);
						return;
					}
					const status = await git.status(item.path);
					if (!status.ok || status.value === null) {
						original.call(navigation, target);
						return;
					}
					const name = `s-${Date.now().toString(36)}`;
					const baseRef = config.autoBaseline === "default" ? "origin/HEAD" : void 0;
					const created = await git.addWorktree(item.path, name, baseRef);
					if (!created.ok) {
						console.warn(`${TAG} worktree creation failed; starting the session in the main checkout instead`, created.error);
						original.call(navigation, target);
						return;
					}
					let registeredId;
					try {
						const workspace = await registry.create({ path: created.value.path });
						registeredId = workspace.workspaceId;
						original.call(navigation, workspace.workspaceId);
					} catch (error) {
						if (registeredId !== void 0 && typeof registry.delete === "function") try {
							await registry.delete(registeredId);
						} catch (cleanupError) {
							console.warn(`${TAG} could not drop the failed workspace registration`, cleanupError);
						}
						await git.removeWorktree(item.path, created.value.path, { force: true });
						console.warn(`${TAG} workspace registration failed; rolled back the worktree`, error);
						original.call(navigation, target);
					}
				})().catch((error) => {
					console.warn(`${TAG} routing failed; using the official behavior`, error);
					original.call(navigation, target);
				}).finally(() => {
					routing.delete(target);
				});
			};
			try {
				navigation.startSession = routed;
			} catch {
				console.warn(`${TAG} disabled: startSession is not writable`);
				return () => {};
			}
			return () => {
				try {
					navigation.startSession = original;
				} catch {}
			};
		}
		//#endregion
		//#region src/client/locales.ts
		/** `git-graph` namespace dictionaries (branch selector + Git graph copy). */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"branch.search": "搜索分支",
			"branch.empty": "未找到匹配分支",
			"branch.detached": "分离 HEAD",
			"branch.dirty": "未提交的更改：{count} 个文件",
			"branch.create": "创建并检出新分支…",
			"branch.graph": "Git 图谱",
			"branch.createDialog.title": "创建并检出新分支",
			"branch.createDialog.description": "基于当前 HEAD 创建一个新的本地分支，并在创建成功后立即切换过去。",
			"branch.createDialog.nameLabel": "分支名",
			"branch.createDialog.placeholder": "例如 feature/git-branch-switcher",
			"branch.createDialog.confirm": "创建并切换",
			"branch.createDialog.cancel": "取消",
			"graph.title": "Git 图谱",
			"graph.subtitle": "{count} 个提交，{lanes} 条泳道",
			"graph.loading": "加载中…",
			"graph.loadMore": "加载更多",
			"graph.close": "关闭",
			"graph.empty": "没有提交记录",
			"graph.time.justNow": "刚刚",
			"graph.time.minutesAgo": "{count} 分钟前",
			"graph.time.hoursAgo": "{count} 小时前",
			"graph.time.daysAgo": "{count} 天前",
			"error.conflictsPresent": "当前仓库还有未解决的冲突，先处理完再切换分支。",
			"error.operationInProgress": "当前仓库还有进行中的 Git 操作，完成后再切换分支。",
			"error.branchInOtherWorktree": "目标分支已在其他 worktree 中被检出，当前工作区无法直接切换。",
			"error.trackedOverwrite": "切换失败，以下已跟踪文件的修改会被目标分支覆盖：{paths}。",
			"error.untrackedOverwrite": "切换失败，以下未跟踪文件会被目标分支覆盖：{paths}。",
			"error.moreFiles": "等另外 {count} 个文件",
			"error.pathsSeparator": "、",
			"error.targetBranchNotFound": "目标分支不存在于本地仓库。",
			"error.invalidBranchName": "分支名无效，请重新输入。",
			"error.branchAlreadyExists": "分支已存在，请换一个名称。",
			"error.workspaceUnknown": "当前目录不是已注册的工作区。",
			"error.internal": "操作失败，请稍后重试。",
			"error.requestFailed": "分支操作失败：{error}",
			"toast.switchSuccess": "已切换到分支 {branchName}",
			"chip.aria.branch": "分支",
			"repo.heading": "仓库",
			"nav.title": "Git 分支",
			"panel.local": "本地分支",
			"panel.remote": "远程分支",
			"panel.loading": "加载中…",
			"panel.empty": "这个工作区里没有找到 Git 仓库",
			"panel.noWorkspace": "没有可用工作区",
			"panel.repoCount": "{count} 个仓库",
			"panel.branchCount": "{local} 本地 / {remote} 远程",
			"panel.refresh": "刷新",
			"panel.noBranches": "没有本地分支（空仓库）",
			"panel.current": "当前",
			"panel.switchTo": "切换到 {branchName}",
			"panel.switching": "切换中…",
			"repo.root": "仓库根目录",
			"panel.checkout": "签出",
			"panel.newFrom": "从“{branchName}”新建分支…",
			"panel.update": "更新",
			"panel.fetch": "抓取 {remote}",
			"panel.push": "推送",
			"panel.merge": "合并“{branchName}”到当前分支",
			"panel.delete": "删除",
			"panel.copy": "复制分支名",
			"panel.working": "处理中…",
			"panel.done.checkout": "已签出 {branchName}",
			"panel.done.pull": "已更新 {branchName}",
			"panel.done.fetch": "已抓取 {remote}",
			"panel.done.push": "已推送",
			"panel.done.merge": "已合并 {branchName}",
			"panel.done.delete": "已删除分支 {branchName}",
			"panel.done.create": "已创建并签出 {branchName}",
			"panel.done.copy": "已复制 {branchName}",
			"panel.prompt.create": "从 {ref} 新建分支：",
			"panel.prompt.delete": "删除分支 {branchName}？",
			"panel.prompt.delete2": "删除",
			"panel.prompt.namePlaceholder": "新分支名",
			"panel.prompt.create2": "创建",
			"panel.prompt.force": "强制删除",
			"panel.prompt.cancel": "取消",
			"panel.log.title": "提交记录",
			"panel.log.select": "在左侧选择一个分支，查看提交与推送记录",
			"panel.log.empty": "没有提交记录",
			"panel.log.loading": "加载中…",
			"panel.log.more": "加载更多",
			"panel.log.upstream": "上游分支 {upstream}",
			"panel.today": "今天",
			"panel.head": "HEAD（当前分支）",
			"panel.tree.ahead": "{count} 个本地提交待推送",
			"panel.tree.behind": "远程有 {count} 个新提交（{upstream}）",
			"panel.remoteNew": "远程有新提交：{count} 个分支待更新",
			"panel.remoteCheck": "检查更新",
			"panel.tree.search": "分支或标签",
			"panel.tab.log": "日志",
			"panel.tab.commit": "提交",
			"panel.selectAll": "全选",
			"panel.selectAllRepo": "全选 {repo} 的更改",
			"panel.selectAllHint": "全选 / 取消全选所有更改文件",
			"panel.tab.stash": "储藏",
			"panel.log.filter": "文本或哈希",
			"panel.detail.empty": "选择要查看更改的提交",
			"panel.diff.title": "文件差异",
			"panel.diff.split": "并排",
			"panel.diff.prev": "上一个差异",
			"panel.diff.next": "下一个差异",
			"panel.diff.noChanges": "无差异",
			"panel.diff.edit": "编辑",
			"panel.diff.editHint": "编辑这个工作区文件",
			"panel.diff.readonly": "只有未提交的工作区文件可以编辑",
			"panel.diff.save": "保存",
			"panel.diff.cancel": "取消",
			"panel.done.saved": "已保存 {path}",
			"panel.diff.binary": "二进制文件，不显示差异内容",
			"panel.diff.truncated": "文件过大，差异内容已截断",
			"panel.diff.unified": "统一",
			"panel.diff.empty": "没有差异内容",
			"panel.diff.open": "查看差异：{path}",
			"panel.detail.title": "提交详情",
			"panel.detail.author": "作者",
			"panel.detail.committer": "提交者",
			"panel.detail.date": "日期",
			"panel.action.stage": "全部暂存",
			"panel.action.unstage": "取消暂存",
			"panel.action.discard": "丢弃更改",
			"panel.commit.count": "{count} 个文件",
			"panel.commit.placeholder": "提交信息",
			"panel.commit.button": "提交",
			"panel.commit.clean": "工作区干净，没有待提交的更改",
			"panel.commit.noChanges": "没有可提交的更改",
			"panel.commit.noMessage": "请填写提交信息",
			"panel.staged": "已暂存",
			"panel.changes": "更改",
			"panel.untracked": "未进行版本管理的文件",
			"panel.done.stage": "已暂存所选文件",
			"panel.done.unstage": "已取消暂存",
			"panel.done.discard": "已丢弃更改",
			"panel.done.commit": "已提交",
			"panel.prompt.discard": "丢弃这些文件的工作区更改（不可撤销）？",
			"panel.prompt.discard2": "丢弃",
			"panel.stash.placeholder": "搁置说明（可选）",
			"panel.stash.push": "搁置当前更改",
			"panel.stash.empty": "没有储藏记录",
			"panel.stash.apply": "应用",
			"panel.stash.pop": "弹出",
			"panel.stash.drop": "删除",
			"panel.done.stashPush": "已搁置当前更改",
			"panel.done.stashApply": "已应用储藏",
			"panel.done.stashPop": "已弹出储藏",
			"panel.done.stashDrop": "已删除储藏",
			"error.branchNotMerged": "该分支尚未完全合并，可以强制删除。",
			"error.branchCheckedOut": "该分支正在被检出，不能删除。",
			"error.mergeConflicts": "合并产生冲突，请先解决冲突再继续。",
			"error.noUpstream": "当前分支没有上游分支，请先推送并设置上游。",
			"error.pushRejected": "推送被拒绝（远端有新的提交），请先拉取再推送。",
			"error.notCurrentBranch": "只有当前检出的分支可以更新。",
			"worktree.create": "在 worktree 中开始新会话…",
			"worktree.manage": "管理 worktree…",
			"worktree.dialog.title": "在 worktree 中开始新会话",
			"worktree.dialog.description": "在 DSH 托管目录（$DSH_HOME/worktrees/）创建隔离 worktree，携带新分支 wt/<名称>，并在其中打开新会话。当前检出不受影响。",
			"worktree.dialog.nameLabel": "worktree 名称",
			"worktree.dialog.namePlaceholder": "例如 fix-login-race",
			"worktree.dialog.baseLabel": "基线分支",
			"worktree.dialog.confirm": "创建并开始会话",
			"worktree.dialog.cancel": "取消",
			"worktree.manager.title": "Worktree 管理",
			"worktree.manager.loading": "加载中…",
			"worktree.manager.empty": "没有托管的 worktree",
			"worktree.manager.main": "主检出",
			"worktree.manager.detached": "分离 HEAD",
			"worktree.manager.remove": "删除",
			"worktree.manager.forceConfirm": "该 worktree 有未提交更改，确认强制删除？",
			"worktree.manager.forceYes": "强制删除",
			"worktree.manager.deleteBranch": "同时删除分支",
			"worktree.manager.close": "关闭",
			"toast.worktreeCreated": "已创建 worktree {name}",
			"error.invalidWorktreeName": "worktree 名称无效，请重新输入。",
			"error.worktreeAlreadyExists": "同名 worktree 或分支已存在，请换一个名称。",
			"error.worktreeDirty": "该 worktree 有未提交的更改。",
			"error.worktreeNotFound": "找不到该 worktree（可能已被删除）。",
			"error.worktreeIsMain": "主检出不能删除。",
			"error.baseRefNotFound": "基线分支或修订不存在。"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"branch.search": "Search branches",
			"branch.empty": "No matching branches",
			"branch.detached": "Detached HEAD",
			"branch.dirty": "Uncommitted changes: {count} files",
			"branch.create": "Create and switch to new branch…",
			"branch.graph": "Git Graph",
			"branch.createDialog.title": "Create and switch to new branch",
			"branch.createDialog.description": "Create a new local branch from the current HEAD and switch to it immediately.",
			"branch.createDialog.nameLabel": "Branch name",
			"branch.createDialog.placeholder": "For example, feature/git-branch-switcher",
			"branch.createDialog.confirm": "Create and switch",
			"branch.createDialog.cancel": "Cancel",
			"graph.title": "Git Graph",
			"graph.subtitle": "{count} commits across {lanes} lanes",
			"graph.loading": "Loading…",
			"graph.loadMore": "Load more",
			"graph.close": "Close",
			"graph.empty": "No commits",
			"graph.time.justNow": "just now",
			"graph.time.minutesAgo": "{count} minutes ago",
			"graph.time.hoursAgo": "{count} hours ago",
			"graph.time.daysAgo": "{count} days ago",
			"error.conflictsPresent": "The repository still has unresolved conflicts. Resolve them before switching branches.",
			"error.operationInProgress": "Another Git operation is still in progress. Finish it before switching branches.",
			"error.branchInOtherWorktree": "That branch is already checked out in another worktree.",
			"error.trackedOverwrite": "Switch failed because tracked files would be overwritten: {paths}.",
			"error.untrackedOverwrite": "Switch failed because untracked files would be overwritten: {paths}.",
			"error.moreFiles": "{count} more files",
			"error.pathsSeparator": ", ",
			"error.targetBranchNotFound": "The target branch does not exist locally.",
			"error.invalidBranchName": "The branch name is invalid. Enter a different name.",
			"error.branchAlreadyExists": "That branch already exists. Choose another name.",
			"error.workspaceUnknown": "This directory is not a registered workspace.",
			"error.internal": "The operation failed. Please try again.",
			"error.requestFailed": "Branch operation failed: {error}",
			"toast.switchSuccess": "Switched to branch {branchName}",
			"chip.aria.branch": "Branch",
			"repo.heading": "Repositories",
			"nav.title": "Git branches",
			"panel.local": "Local branches",
			"panel.remote": "Remote branches",
			"panel.loading": "Loading…",
			"panel.empty": "No git repository found in this workspace",
			"panel.noWorkspace": "No workspace available",
			"panel.repoCount": "{count} repos",
			"panel.branchCount": "{local} local / {remote} remote",
			"panel.refresh": "Refresh",
			"panel.noBranches": "No local branches (empty repository)",
			"panel.current": "current",
			"panel.switchTo": "Switch to {branchName}",
			"panel.switching": "Switching…",
			"repo.root": "repo root",
			"panel.checkout": "Checkout",
			"panel.newFrom": "New branch from '{branchName}'…",
			"panel.update": "Update",
			"panel.fetch": "Fetch {remote}",
			"panel.push": "Push",
			"panel.merge": "Merge '{branchName}' into current",
			"panel.delete": "Delete",
			"panel.copy": "Copy branch name",
			"panel.working": "Working…",
			"panel.done.checkout": "Checked out {branchName}",
			"panel.done.pull": "Updated {branchName}",
			"panel.done.fetch": "Fetched {remote}",
			"panel.done.push": "Pushed",
			"panel.done.merge": "Merged {branchName}",
			"panel.done.delete": "Deleted branch {branchName}",
			"panel.done.create": "Created and checked out {branchName}",
			"panel.done.copy": "Copied {branchName}",
			"panel.prompt.create": "New branch from {ref}:",
			"panel.prompt.delete": "Delete branch {branchName}?",
			"panel.prompt.delete2": "Delete",
			"panel.prompt.namePlaceholder": "New branch name",
			"panel.prompt.create2": "Create",
			"panel.prompt.force": "Force delete",
			"panel.prompt.cancel": "Cancel",
			"panel.log.title": "Commits",
			"panel.log.select": "Select a branch on the left to see its commits and push state",
			"panel.log.empty": "No commits",
			"panel.log.loading": "Loading…",
			"panel.log.more": "Load more",
			"panel.log.upstream": "Upstream {upstream}",
			"panel.today": "Today",
			"panel.head": "HEAD (current branch)",
			"panel.tree.ahead": "{count} local commits to push",
			"panel.tree.behind": "{count} new remote commits ({upstream})",
			"panel.remoteNew": "New commits on the remote: {count} branch(es) behind",
			"panel.remoteCheck": "Check for updates",
			"panel.tree.search": "Branches or tags",
			"panel.tab.log": "Log",
			"panel.tab.commit": "Commit",
			"panel.selectAll": "Select all",
			"panel.selectAllRepo": "Select all changes in {repo}",
			"panel.selectAllHint": "Select or clear every changed file",
			"panel.tab.stash": "Stash",
			"panel.log.filter": "Text or hash",
			"panel.detail.empty": "Select a commit to see its changes",
			"panel.diff.title": "File diff",
			"panel.diff.split": "Side by side",
			"panel.diff.prev": "Previous change",
			"panel.diff.next": "Next change",
			"panel.diff.noChanges": "no changes",
			"panel.diff.edit": "Edit",
			"panel.diff.editHint": "Edit this working-tree file",
			"panel.diff.readonly": "Only uncommitted working-tree files can be edited",
			"panel.diff.save": "Save",
			"panel.diff.cancel": "Cancel",
			"panel.done.saved": "Saved {path}",
			"panel.diff.binary": "Binary file — no text diff",
			"panel.diff.truncated": "File is too large; the diff was truncated",
			"panel.diff.unified": "Unified",
			"panel.diff.empty": "No differences",
			"panel.diff.open": "Show diff: {path}",
			"panel.detail.title": "Commit details",
			"panel.detail.author": "Author",
			"panel.detail.committer": "Committer",
			"panel.detail.date": "Date",
			"panel.action.stage": "Stage all",
			"panel.action.unstage": "Unstage",
			"panel.action.discard": "Discard changes",
			"panel.commit.count": "{count} files",
			"panel.commit.placeholder": "Commit message",
			"panel.commit.button": "Commit",
			"panel.commit.clean": "Nothing to commit, working tree clean",
			"panel.commit.noChanges": "No changes to commit",
			"panel.commit.noMessage": "Enter a commit message",
			"panel.staged": "Staged",
			"panel.changes": "Changes",
			"panel.untracked": "Unversioned files",
			"panel.done.stage": "Staged the selected files",
			"panel.done.unstage": "Unstaged",
			"panel.done.discard": "Discarded changes",
			"panel.done.commit": "Committed",
			"panel.prompt.discard": "Discard working-tree changes for these files (cannot be undone)?",
			"panel.prompt.discard2": "Discard",
			"panel.stash.placeholder": "Shelve message (optional)",
			"panel.stash.push": "Shelve changes",
			"panel.stash.empty": "No stash entries",
			"panel.stash.apply": "Apply",
			"panel.stash.pop": "Pop",
			"panel.stash.drop": "Drop",
			"panel.done.stashPush": "Changes shelved",
			"panel.done.stashApply": "Stash applied",
			"panel.done.stashPop": "Stash popped",
			"panel.done.stashDrop": "Stash dropped",
			"error.branchNotMerged": "The branch is not fully merged yet; force delete is available.",
			"error.branchCheckedOut": "That branch is checked out and cannot be deleted.",
			"error.mergeConflicts": "The merge has conflicts; resolve them before continuing.",
			"error.noUpstream": "The current branch has no upstream; push it with an upstream first.",
			"error.pushRejected": "The push was rejected (the remote has new commits); pull first.",
			"error.notCurrentBranch": "Only the checked-out branch can be updated.",
			"worktree.create": "Start a new session in a worktree…",
			"worktree.manage": "Manage worktrees…",
			"worktree.dialog.title": "Start a new session in a worktree",
			"worktree.dialog.description": "Create an isolated worktree in the DSH-managed home ($DSH_HOME/worktrees/) on a new wt/<name> branch, and open a new session in it. The current checkout is untouched.",
			"worktree.dialog.nameLabel": "Worktree name",
			"worktree.dialog.namePlaceholder": "For example, fix-login-race",
			"worktree.dialog.baseLabel": "Base branch",
			"worktree.dialog.confirm": "Create and start session",
			"worktree.dialog.cancel": "Cancel",
			"worktree.manager.title": "Worktree Manager",
			"worktree.manager.loading": "Loading…",
			"worktree.manager.empty": "No managed worktrees",
			"worktree.manager.main": "main checkout",
			"worktree.manager.detached": "detached HEAD",
			"worktree.manager.remove": "Remove",
			"worktree.manager.forceConfirm": "This worktree has uncommitted changes. Force-remove it?",
			"worktree.manager.forceYes": "Force remove",
			"worktree.manager.deleteBranch": "Also delete the branch",
			"worktree.manager.close": "Close",
			"toast.worktreeCreated": "Created worktree {name}",
			"error.invalidWorktreeName": "The worktree name is invalid. Enter a different name.",
			"error.worktreeAlreadyExists": "A worktree or branch with that name already exists. Choose another name.",
			"error.worktreeDirty": "The worktree has uncommitted changes.",
			"error.worktreeNotFound": "That worktree was not found (it may already be gone).",
			"error.worktreeIsMain": "The primary checkout cannot be removed.",
			"error.baseRefNotFound": "The base branch or revision does not exist."
		};
		//#endregion
		//#region src/client/telemetry.ts
		/** localStorage key carrying the family-wide telemetry opt-out ('1' = off). */
		const TELEMETRY_OPT_OUT_KEY = "dsh-web-ui-telemetry-opt-out";
		const VISITOR_KEY = "dsh-web-ui-telemetry-visitor";
		const DAY_KEY_PREFIX = "dsh-web-ui-telemetry-day:";
		const ENDPOINT = "https://dsh-market.com/api/telemetry/event";
		/** The building package's version, when the bundle carries it. */
		function bakedVersion() {
			try {
				return "0.4.14";
			} catch {
				return;
			}
		}
		/** Whether the user switched the family-wide opt-out on (reads storage only). */
		function isTelemetryOptedOut() {
			try {
				return localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === "1";
			} catch {
				return false;
			}
		}
		/** Whether the browser itself asks not to be tracked; a failed read means no signal. */
		function doNotTrackRequested() {
			try {
				return navigator.doNotTrack === "1" || navigator.doNotTrack === "yes";
			} catch {
				return false;
			}
		}
		/** Whether a heartbeat must be suppressed right now: opt-out stored, or the browser asks not to be tracked. */
		function isTelemetrySuppressed() {
			return isTelemetryOptedOut() || doNotTrackRequested();
		}
		/** Read or lazily create the anonymous visitor id; null when storage is unavailable. */
		function visitorId() {
			try {
				const existing = localStorage.getItem(VISITOR_KEY);
				if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
				const fresh = crypto.randomUUID().replaceAll("-", "");
				localStorage.setItem(VISITOR_KEY, fresh);
				return fresh;
			} catch {
				return null;
			}
		}
		/** Drop stale per-day dedup keys so localStorage does not grow forever. */
		function pruneDayKeys(today) {
			try {
				for (let index = localStorage.length - 1; index >= 0; index -= 1) {
					const key = localStorage.key(index);
					if (key !== null && key.startsWith(DAY_KEY_PREFIX) && key !== DAY_KEY_PREFIX + today) localStorage.removeItem(key);
				}
			} catch {}
		}
		/**
		* Fire the daily heartbeat for the given items at most once per UTC day per
		* browser. Never throws and never blocks the caller. Items without an explicit
		* version inherit the bundle's baked build version.
		*/
		function reportDailyHeartbeat(items) {
			try {
				if (isTelemetrySuppressed()) return;
				if (items.length === 0) return;
				const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
				if (navigator.webdriver) return;
				if (localStorage.getItem(DAY_KEY_PREFIX + today) !== null) return;
				const visitor = visitorId();
				if (visitor === null) return;
				pruneDayKeys(today);
				const payloadItems = items.map((item) => {
					const out = { name: item.name };
					const version = item.version ?? bakedVersion();
					if (version !== void 0) out.version = version;
					if (item.channel !== void 0) out.channel = item.channel;
					return out;
				});
				const body = JSON.stringify({
					kind: "heartbeat",
					visitor,
					items: payloadItems
				});
				fetch(ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
					keepalive: true
				}).then((response) => {
					if (response.ok) localStorage.setItem(DAY_KEY_PREFIX + today, "1");
				}).catch(() => {});
			} catch {}
		}
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "git-graph";
		/** Required services: slots for the dock entry, sessions for the cwd lookup, workspaces for worktree sessions, locale for the copy. */
		const inject = [
			"slots",
			"sessions",
			"workspaces",
			"connection",
			"locale"
		];
		/** The session-cwd lookup failure shared by the injected verbs. */
		const NO_WORKSPACE = {
			code: "workspace-unknown",
			message: "session has no workspace"
		};
		/** localStorage key carrying the repository explicitly selected per workspace (local patch: sub-repository discovery). */
		const REPO_KEY_PREFIX = "dsh-git-graph:repo:";
		/** Read the selected repository root for one workspace, if any. */
		function readSelectedRepo(workspace) {
			try {
				const value = localStorage.getItem(REPO_KEY_PREFIX + workspace);
				return value === null || value === "" ? void 0 : value;
			} catch {
				return void 0;
			}
		}
		/** Persist (or clear) the selected repository root for one workspace. */
		function writeSelectedRepo(workspace, root) {
			try {
				if (root === void 0 || root === "" || root === workspace) localStorage.removeItem(REPO_KEY_PREFIX + workspace);
				else localStorage.setItem(REPO_KEY_PREFIX + workspace, root);
			} catch {}
		}
		/** Whether a path is the workspace itself or lives below it. */
		function isInsideWorkspace(workspace, path) {
			if (path === workspace) return true;
			const base = workspace.replace(/[\\/]+$/, "");
			return path.startsWith(base + "/") || path.startsWith(base + "\\");
		}
		/**
		* Client plugin body: the branch chip entry with its git verbs, on the
		* composer's input dock.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			reportDailyHeartbeat([{ name: "@linxin666/dsh-client-ui-git-graph" }]);
			ctx.effect(() => {
				try {
					return ctx.locale.register(NS, {
						zh,
						en
					});
				} catch {
					return () => {};
				}
			}, "dsh-git-graph: dictionaries");
			const git = new GitApi();
			ctx.inject([
				"workspaces",
				"sessions",
				"uiWorkspace"
			], (worktreeScope) => {
				worktreeScope.effect(() => installAutoIsolation(worktreeScope, git), "dsh-git-graph: auto-isolation");
			});
			ctx.inject([
				"slots",
				"conversation",
				"sessions",
				"uiWorkspace"
			], (scope) => {
				const sessions = scope.sessions;
				/** The session's workspace root, resolved at call time from the sessions baseline. */
				const cwdOf = (sessionId) => sessionId === void 0 ? void 0 : sessions.list.getSnapshot().byId[sessionId]?.cwd;
				/** The injected face shared by every seat this chip registers into. */
				const injected = () => {
					/** Resolve the workspace root for one git call. */
					const pathOf = (sessionId) => {
						const cwd = cwdOf(sessionId);
						if (cwd === void 0 || cwd === "") return {
							ok: false,
							error: NO_WORKSPACE
						};
						// Local patch: a workspace that is not itself a repository
						// addresses the sub-repository the user selected.
						const selected = readSelectedRepo(cwd);
						const path = selected !== void 0 && isInsideWorkspace(cwd, selected) ? selected : cwd;
						return {
							ok: true,
							path
						};
					};
					return {
						repoStatus: async (sessionId) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return null;
							const result = await git.status(resolved.path);
							return result.ok ? result.value : null;
						},
						branches: async (sessionId) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return null;
							const result = await git.branches(resolved.path);
							return result.ok ? result.value : null;
						},
						switchBranch: async (sessionId, branch) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return {
								ok: false,
								error: resolved.error
							};
							const result = await git.switchBranch(resolved.path, branch);
							return result.ok ? {
								ok: true,
								branch: result.value.branch
							} : result;
						},
						createBranch: async (sessionId, name) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return {
								ok: false,
								error: resolved.error
							};
							const result = await git.createBranch(resolved.path, name);
							return result.ok ? {
								ok: true,
								branch: result.value.branch
							} : result;
						},
						graph: async (sessionId, limit) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return null;
							const result = await git.graph(resolved.path, limit);
							return result.ok ? result.value : null;
						},
						worktrees: async (sessionId) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return null;
							const result = await git.worktrees(resolved.path);
							return result.ok ? result.value : null;
						},
						createWorktreeSession: async (sessionId, name, baseRef) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return {
								ok: false,
								error: resolved.error
							};
							const created = await git.addWorktree(resolved.path, name, baseRef);
							if (!created.ok) return {
								ok: false,
								error: created.error
							};
							try {
								const workspace = await scope.workspaces.create({ path: created.value.path });
								const createdSessionId = await scope.sessions.create({ workspaceId: workspace.workspaceId });
								scope.uiWorkspace.openSession(createdSessionId);
							} catch (error) {
								await git.removeWorktree(resolved.path, created.value.path, { force: true });
								return {
									ok: false,
									error: {
										code: "internal",
										message: `workspace registration failed: ${String(error)}`
									}
								};
							}
							return {
								ok: true,
								path: created.value.path,
								branch: created.value.branch,
								name: created.value.name
							};
						},
						removeWorktree: async (sessionId, worktreePath, opts) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return {
								ok: false,
								error: resolved.error
							};
							const removed = await git.removeWorktree(resolved.path, worktreePath, opts);
							if (!removed.ok) return {
								ok: false,
								error: removed.error
							};
							const linked = scope.workspaces.list.getSnapshot().items.find((item) => item.path === worktreePath);
							if (linked !== void 0) await scope.workspaces.delete(linked.workspaceId);
							return { ok: true };
						},
						gitConfig: async () => {
							const result = await git.config();
							return result.ok ? result.value : null;
						},
						/**
						* Local patch: the repositories found at or below the session's
						* workspace, with the effective selection. A workspace that is itself
						* a repository yields exactly that one entry (upstream behavior).
						*/
						repos: async (sessionId) => {
							const cwd = cwdOf(sessionId);
							if (cwd === void 0 || cwd === "") return null;
							const result = await git.discover(cwd);
							if (!result.ok || result.value === null) return null;
							const view = result.value;
							const entries = Array.isArray(view.repos) ? view.repos : [];
							const stored = readSelectedRepo(cwd);
							let selected;
							if (stored !== void 0 && entries.some((entry) => entry.root === stored)) selected = stored;
							else {
								const preferred = entries.find((entry) => entry.main === true) ?? entries[0];
								selected = preferred === void 0 ? void 0 : preferred.root;
							}
							// Commit the resolved default so the very next verb targets it.
							writeSelectedRepo(cwd, selected);
							return {
								workspace: cwd,
								repos: entries,
								selected,
								truncated: view.truncated === true
							};
						},
						/** Local patch: pin one repository of the workspace for the following verbs. */
						selectRepo: (sessionId, root) => {
							const cwd = cwdOf(sessionId);
							if (cwd === void 0 || cwd === "") return;
							writeSelectedRepo(cwd, root);
						},
						subscribeChanges: (sessionId, onChange) => {
							const resolved = pathOf(sessionId);
							if (!resolved.ok) return () => {};
							return subscribeChanges(resolved.path, onChange);
						}
					};
				};
				scope.slots.inject("conversation.input.dock", () => {
					try {
						return scope.slots.register({
							name: "conversation.input.dock",
							id: "git-graph",
							order: 100,
							locale: NS,
							inject: injected
						}, BranchChip);
					} catch {
						return () => {};
					}
				});
			});
			// Local patch: the sidebar panel (repository + branch tree) and its row.
			ctx.inject([
				"slots",
				"sessions",
				"workspaces"
			], (sidebarScope) => {
				/** Registered workspaces as { path, name } rows for the panel header. */
				const workspaceRows = () => {
					const items = sidebarScope.workspaces.list.getSnapshot().items ?? [];
					return items.filter((item) => typeof item.path === "string" && item.path !== "").map((item) => ({
						path: item.path,
						name: workspaceLabel(item.path)
					}));
				};
				/** The workspace the main view is showing, else the first registered one. */
				const currentWorkspace = () => {
					const items = sidebarScope.workspaces.list.getSnapshot().items ?? [];
					const current = mainViewSessionId(sidebarScope.sessions.list.getSnapshot().byId);
					const active = current === void 0 ? void 0 : items.find((item) => Array.isArray(item.sessionIds) ? item.sessionIds.includes(current) : false);
					return (active ?? items[0])?.path ?? "";
				};
				let translateBound;
				/** Last-resort translator over this module's own dictionaries. */
				const fallbackTranslate = (key, vars) => {
					const template = zh[key] ?? en[key] ?? key;
					if (vars === void 0) return template;
					return template.replace(/\{(\w+)\}/g, (match, name) => vars[name] === void 0 ? match : String(vars[name]));
				};
				/** Namespace translator, bound lazily (the locale service may arrive late). */
				const translate = (key, vars) => {
					if (translateBound === void 0) {
						try {
							translateBound = ctx.locale.bind(NS);
						} catch {
							translateBound = fallbackTranslate;
						}
					}
					return translateBound(key, vars);
				};
				const face = () => ({
					listWorkspaces: workspaceRows,
					initialWorkspace: currentWorkspace,
					overview: (path) => git.overview(path),
					switchBranch: (root, branch) => git.switchBranch(root, branch),
					branchLog: (root, ref, limit) => git.branchLog(root, ref, limit),
					branchSync: (root, ref) => git.branchSync(root, ref),
					createBranchFrom: (root, name, ref) => git.createBranchFrom(root, name, ref),
					deleteBranch: (root, name, force) => git.deleteBranch(root, name, force),
					pullBranch: (root, ref) => git.pullBranch(root, ref),
					fetchRemote: (root, remote) => git.fetchRemote(root, remote),
					pushBranch: (root) => git.pushBranch(root),
					mergeBranch: (root, ref) => git.mergeBranch(root, ref),
					files: (root) => git.files(root),
					fileOp: (root, verb, files) => git.fileOp(root, verb, files),
					commit: (root, message) => git.commit(root, message),
					stashList: (root) => git.stashList(root),
					stashOp: (root, verb, ref, message) => git.stashOp(root, verb, ref, message),
					commitDetail: (root, oid) => git.commitDetail(root, oid),
					fileDiff: (root, file, opts) => git.fileDiff(root, file, opts),
					fileContent: (root, file) => git.fileContent(root, file),
					writeFile: (root, file, content) => git.writeFile(root, file, content),
					translate
				});
				sidebarScope.slots.inject("sidebar.panellist", () => {
					try {
						const offRow = sidebarScope.slots.register({
							name: "sidebar.panellist",
							id: SIDEBAR_PANEL_ID,
							order: 30,
							label: () => "Git 分支",
							locale: NS,
							inject: face
						}, GitGraphSidebarRow);
						const offPanel = sidebarScope.slots.register({
							name: "main",
							key: SIDEBAR_PANEL_ID,
							locale: NS,
							inject: face
						}, BranchSidebarPanel);
						return () => {
							if (typeof offRow === "function") offRow();
							if (typeof offPanel === "function") offPanel();
						};
					} catch {
						return () => {};
					}
				});
			});
		}
		//#endregion
		exports.BranchChip = BranchChip;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map