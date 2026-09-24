# Latch for Raycast

Private macOS extension. Commands: **Search Vault** and **Lock Vault**.

Install the latest Latch app in `/Applications/Latch.app`, then run:

```sh
pnpm install --frozen-lockfile
cd raycast
pnpm install --frozen-lockfile
pnpm run dev
```

Raycast imports the development extension. No Store publication or second Bitwarden login is needed. Unlock in Latch, then search in Raycast. Enter copies the password; Command-U copies the username; Command-Shift-L locks the vault. Latch clears copied values after 30 seconds, or when locked, provided the clipboard still contains that value.

Search runs against Latch's in-memory personal login index. Queries debounce for 100 ms, return at most 80 matches, and refresh every two seconds while open. Requests time out after five seconds. Superseded requests are cancelled. No CLI process is started per search; no result cache or password is stored by the extension. Locked/disconnected states clear displayed results on the next refresh; every copy is checked immediately by Latch.

The separate Raycast socket and rotating token are readable only by the current macOS user. This is a local-user trust boundary, not cryptographic verification of Raycast's process identity. The browser socket retains its own token and request schema. Raycast cannot unlock, export, edit, or receive passwords through this protocol. It asks Latch to copy the chosen field using the desktop app's existing clipboard lifecycle.

Validation uses the root Vite+ installation: `pnpm run typecheck` and `pnpm run build`. No automated test suite. To manually check: locked search, unlocked search, copy, lock while results are visible, then attempt another copy; restart Latch and check reconnection.
