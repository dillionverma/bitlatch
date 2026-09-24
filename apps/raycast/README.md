# Latch for Raycast

Private macOS extension. Commands: **Search Vault** and **Lock Vault**.

Install the latest Latch app in `/Applications/Latch.app`, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter latch dev
```

The extension lives in `apps/raycast`; its package name remains `latch` for
Raycast. It uses the root pnpm install and lockfile alongside desktop, browser,
and `packages/shared`; no second install is needed.

Raycast imports the development extension. No Store publication or second Bitwarden login is needed. Unlock directly in Raycast using your master password, or choose Touch ID from the actions when it is available and enabled. First-time sign-in still happens in Latch. Enter opens an item detail page. Logins show compact field rows: Enter copies the selected username/password or opens the website. Nonempty notes open a full-width reading view, and secure notes use that view directly; Command-P copies a password, Command-U a username, Command-N the note, and Command-Shift-C the website. Command-Shift-L locks the vault. Latch clears copied values after 30 seconds, or when locked, provided the clipboard still contains that value.

Search runs against Latch's in-memory personal login and secure-note index. Queries debounce for 100 ms, return at most 80 matches, and refresh every two seconds while open. Search/detail requests time out after five seconds; unlocking allows up to two minutes for the CLI or system authentication. Superseded requests are cancelled. Existing rows stay visible during typing; the loading indicator is only shown for the initial connection. No CLI process is started per search; no persistent vault cache is written by the extension. Unlock passwords stay in the non-draft form until submission succeeds or the form closes. Locked/disconnected states clear displayed results on the next refresh; every copy is checked immediately by Latch.

Website logos use Bitwarden’s icon service and follow Latch’s website-icon setting. Only public website hostnames are sent, never paths, usernames, IP addresses, or local hostnames. Raycast handles image loading/caching with a key icon as fallback; logo requests do not delay search results.

The separate Raycast socket and rotating token are readable only by the current macOS user. This is a local-user trust boundary, not cryptographic verification of Raycast's process identity. The browser socket retains its own token and request schema. Raycast can unlock through the existing Latch authentication path and read selected note content, but cannot export, edit, or receive saved login passwords through this protocol. Detail pages refresh every two seconds and clear on lock/disconnect; note content is rendered literally, without fetching embedded Markdown images. It asks Latch to copy the chosen field using the desktop app's existing clipboard lifecycle.

From the repository root, use `pnpm --filter latch typecheck` and `pnpm --filter latch build` for Raycast alone. Root `pnpm run check` includes Raycast checks and its production build alongside the other apps. No automated test suite. To manually check: inline unlock, incorrect-password retry, login/note search, detail pages, each copy action, lock while details are visible, then attempt another copy; restart Latch and check reconnection.
