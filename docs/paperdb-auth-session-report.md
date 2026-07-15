# PaperDB Auth Session 401 Report

**Date:** 2026-07-15  
**SDK:** `paperdb-js` **v1.1.0** (from `node_modules`)  
**API host:** `https://api.paperdb.app`  
**Client app:** Shop Daddy (Vite + TanStack Start, browser-side auth)  
**Endpoints involved:** `GET /auth/me`, `POST /auth/refresh`  
**Symptom:** Both return **401 Unauthorized** on session restore after page load.

---

## 1. Executive summary

Yes — this **can and often does** originate in PaperDB’s **session model + JS SDK**, not only in the application.

Observed sequence on every cold load with a stored token:

```text
GET  https://api.paperdb.app/auth/me      → 401
POST https://api.paperdb.app/auth/refresh → 401
```

That pattern means: the client still has a **string it believes is a session token**, but the API **rejects it for both identity and refresh**. A healthy auth stack should either:

1. Accept `/me` with a valid access token, **or**
2. Accept `/refresh` with a **refresh** credential and issue a new access token,

not fail both with the same bearer.

Several SDK design choices make this failure mode common and hard for integrators to fix correctly. This document lists root causes, evidence from `paperdb-js`, and a **general platform fix** for PaperDB (API + SDK + docs).

---

## 2. Observed client flow (Shop Daddy)

### 2.1 App restore (simplified)

```ts
// 1. Read token from localStorage (app key and/or paperdb_session_token)
auth.setSessionToken(token);

// 2. Validate
const user = await auth.getUser(); // GET /auth/me  → 401

// 3. Retry via refresh
auth.setSessionToken(token); // re-seed (getUser cleared storage)
await auth.refreshSession(); // POST /auth/refresh → 401

// 4. Treat as logged out
```

### 2.2 Browser DevTools

```text
auth.tsx:106  GET  …/auth/me      401 (Unauthorized)
auth.tsx:113  POST …/auth/refresh 401 (Unauthorized)
```

The red stacks under React are **not** React bugs. The browser logs failed `fetch` even when the SDK catches the error and returns `null`.

### 2.3 SDK behavior that matches the network

From `paperdb-js` `AuthClient` (v1.1.0 dist):

| Method             | On HTTP error                                          |
| ------------------ | ------------------------------------------------------ |
| `getUser()`        | `clearSession()` → return `null` (no throw, no status) |
| `refreshSession()` | `clearSession()` → return `null` (no throw, no status) |
| `request()`        | Throws `Error` with message body only                  |

So the app only learns “no user,” not **why** (expired vs revoked vs wrong project vs malformed token).

---

## 3. Is this a PaperDB problem?

### 3.1 Cases that are **application / ops** (not PaperDB bugs)

| Situation                                                     | How to tell                                                   | Fix                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| User never signed in successfully                             | No `session.token` in sign-in response                        | Fix sign-in / credentials |
| Token deleted from server (sign-out everywhere, admin revoke) | Fresh sign-in works; old token always 401                     | Expected                  |
| Wrong API key / wrong project                                 | All auth calls fail or user not in project                    | Align keys                |
| Intentionally short TTL + no refresh token                    | `/me` 401 after TTL; `/refresh` also 401 if no refresh secret | Product decision          |

### 3.2 Cases that **are** PaperDB platform/SDK issues

| Situation                                              | Why it’s on PaperDB                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Same token used for `/me` and `/refresh`, both 401** | Refresh cannot work if the only credential is already rejected as access           |
| **No separate refresh token / rotation**               | Industry-standard OAuth-like sessions use access + refresh                         |
| **`initializeSession()` race**                         | Constructor fires async refresh with no `ready` promise; apps race it              |
| **Silent failures**                                    | Integrators cannot branch on 401 vs 5xx vs network                                 |
| **Bearer fallback to API key**                         | `Authorization: Bearer <apiKey>` when session missing confuses debugging and authn |
| **Token storage is opaque**                            | Only `paperdb_session_token` string; no `expiresAt` → no proactive refresh         |
| **Docs imply Clerk-like restore**                      | Integrators assume `getUser()` after reload “just works”                           |

**Conclusion:** A single 401 on `/me` after long idle can be normal expiry. **Back-to-back 401 on `/me` then `/refresh` with the same bearer is a session-design smell** and should be treated as a platform gap until PaperDB documents and implements a real refresh protocol.

---

## 4. Deep dive: `paperdb-js` AuthClient

### 4.1 Token storage

```js
// Only the access/session string is persisted
localStorage.setItem("paperdb_session_token", session.token);
```

Missing from storage:

- `session.id`
- `session.expiresAt`
- refresh token (if any)
- project / API key binding fingerprint

Without `expiresAt`, the SDK cannot refresh **before** `/me` fails.

### 4.2 Request headers

```js
headers["X-API-Key"] = this.apiKey;
if (this.sessionToken) {
  headers["Authorization"] = `Bearer ${this.sessionToken}`;
}
if (!headers["Authorization"] && this.apiKey) {
  headers["Authorization"] = `Bearer ${this.apiKey}`; // ← dual meaning of Bearer
}
```

Problems:

1. **User session and project key share the same header scheme** (`Authorization: Bearer …`). APIs must disambiguate carefully; many stacks use `Authorization` only for users and `X-API-Key` only for projects.
2. If `sessionToken` is empty, requests still send API key as Bearer — a failed `/me` might look like “session 401” when the real issue is “no session attached.”
3. `credentials: "omit"` (by design for CORS) means **cookies cannot carry sessions**. Everything depends on the bearer string. That is fine only if the token lifecycle is solid.

### 4.3 Constructor race (`initializeSession`)

```js
constructor(baseUrl, apiKey) {
  ...
  this.initializeSession(); // async, not awaited, no public ready promise
}

async initializeSession() {
  const storedToken = localStorage.getItem("paperdb_session_token");
  if (storedToken) {
    this.sessionToken = storedToken;
    try {
      await this.refreshSession(); // POST /auth/refresh
    } catch {
      this.clearSession();
    }
  }
  this.updateState({ isLoading: false });
}
```

Effects:

1. **Double refresh/me traffic** — SDK auto-refreshes while the app also calls `getUser` / `refreshSession`.
2. **Race on `clearSession`** — SDK clears token after failed refresh; app re-seeds from its own storage (`shop.session`) and retries with the same dead token → second 401 pair.
3. **No `await auth.ready()`** — apps cannot wait for bootstrap safely.

### 4.4 Same credential for `/me` and `/refresh`

```js
async refreshSession() {
  if (!this.sessionToken) return null;
  const { user, session } = await this.request("/refresh", { method: "POST" });
  // uses Authorization: Bearer <sessionToken> — same as /me
}
```

If the API treats the session token as a short-lived **access** JWT:

- Expired access → `/me` 401 (correct)
- `/refresh` with expired access → **also 401** (unless API accepts expired access for refresh, which is unusual and risky)

A general fix requires either:

- **A)** Long-lived session tokens that `/me` accepts until explicit logout (then refresh is optional), or
- **B)** Access + refresh pair (refresh endpoint requires refresh token / separate cookie).

Today the SDK API surface implies **B** (`refreshSession`) but implements **A’s storage model** (single string). That inconsistency is the core product bug.

### 4.5 Error swallowing

```js
async getUser() {
  try {
    const { user } = await this.request("/me");
    return user;
  } catch {
    this.clearSession();
    return null; // loses status, body, correlation id
  }
}
```

Integrators cannot:

- Show “session expired, please sign in again” vs “PaperDB down”
- Avoid clearing local UX state on transient 503
- Report accurate telemetry

---

## 5. Likely API-side causes of dual 401

PaperDB API maintainers should verify each of the following against production logs for the failing tokens.

### 5.1 Session lookup

| Check         | Question                                                                       |
| ------------- | ------------------------------------------------------------------------------ |
| Token format  | Opaque ID vs JWT? Is the client storing the full value returned by `/sign-in`? |
| Hashing       | Is the DB storing a hash and comparing correctly?                              |
| Project scope | Is the session bound to `X-API-Key` / project? Mismatch → 401                  |
| User deleted  | Session row exists but user missing → should be 401 with clear code            |
| Expiry        | Is `expiresAt` enforced on `/me`?                                              |

### 5.2 Refresh semantics

| Check                              | Question                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------- |
| What does `/auth/refresh` require? | Same session token? Separate refresh token? Body field?                    |
| Does it allow expired sessions?    | If not, document that clients must re-login after TTL                      |
| Does it rotate tokens?             | Old token invalidated without client updating storage → immediate next 401 |
| Response shape                     | Does it return `{ user, session: { token, expiresAt } }` matching SDK?     |

### 5.3 Header authentication order

Recommended server logic:

```text
1. If Authorization Bearer looks like a user session → authenticate as user
2. Else if X-API-Key valid → authenticate as project (no user)
3. Never treat project API key as a user session for /auth/me
4. Return distinct error codes: SESSION_EXPIRED | SESSION_INVALID | MISSING_SESSION | INVALID_API_KEY
```

If `/me` only checks Bearer and the key accidentally collides in format with sessions, edge bugs appear.

### 5.4 Cross-origin + CORS

SDK uses `credentials: "omit"`. Confirm:

- CORS allows `Authorization` and `X-API-Key` from browser origins
- Preflight succeeds for GET `/auth/me` and POST `/auth/refresh`
- 401 is from auth middleware, not a CORS misreport (DevTools would show CORS errors separately; still worth confirming)

---

## 6. Reproduction matrix (for PaperDB QA)

| #   | Steps                                 | Expected (healthy)     | Broken today       |
| --- | ------------------------------------- | ---------------------- | ------------------ |
| 1   | Sign in → immediately `getUser()`     | 200 + user             | —                  |
| 2   | Sign in → reload page → `getUser()`   | 200 + user             | **401** (reported) |
| 3   | Sign in → wait past TTL → `getUser()` | 401                    | 401                |
| 4   | After TTL → `refreshSession()`        | 200 + new session      | **401** (reported) |
| 5   | Sign out → `getUser()`                | null / 401             | —                  |
| 6   | Valid session + wrong `X-API-Key`     | 401 with project error | ?                  |
| 7   | Two tabs: sign out in A, action in B  | clear / re-login       | ?                  |

**Critical test:** After a successful `/sign-in`, copy `session.token` and call:

```bash
# Replace TOKEN and API_KEY
curl -sS -D- "https://api.paperdb.app/auth/me" \
  -H "X-API-Key: $API_KEY" \
  -H "Authorization: Bearer $TOKEN"

curl -sS -D- -X POST "https://api.paperdb.app/auth/refresh" \
  -H "X-API-Key: $API_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

- If **both 401 immediately after sign-in**, the API is not accepting the token it just issued (high-severity PaperDB bug).
- If **200 right after sign-in** but **401 after reload**, inspect what the client re-sends (truncated token, wrong storage key, race clearing token).
- If **`/me` 401 after TTL** but **`/refresh` 200**, client must call refresh first; SDK should do that automatically when `expiresAt` is near.
- If **both 401 after TTL**, refresh is not implemented as a recovery path — document “re-login required” or implement refresh tokens.

---

## 7. General fix plan for PaperDB

### Phase 1 — API contract (source of truth)

#### 7.1 Define session types explicitly

```ts
// Proposed response for sign-in / sign-up / refresh
{
  user: User;
  session: {
    id: string;
    userId: string;
    token: string;           // access token (short-lived)
    expiresAt: string;       // ISO
    refreshToken?: string;   // long-lived, only if using refresh model
    refreshExpiresAt?: string;
  }
}
```

**Pick one model and document it:**

| Model                                 | `/auth/me`                                | `/auth/refresh`                                                                | Client storage              |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| **A. Opaque long session**            | Accepts session token until expiry/logout | Optional; can extend `expiresAt`                                               | Single token + `expiresAt`  |
| **B. Access + refresh (recommended)** | Accepts access only                       | Requires refresh token (header or body); returns new access (+ rotate refresh) | Access + refresh + expiries |

Do **not** expose a `refreshSession()` SDK method that simply replays a dead access token unless Model A allows extending via that same token **before** hard expiry.

#### 7.2 Stable error envelope

```json
{
  "code": "SESSION_EXPIRED",
  "message": "Access token expired",
  "status": 401
}
```

Suggested codes:

- `MISSING_SESSION`
- `SESSION_EXPIRED`
- `SESSION_INVALID`
- `SESSION_REVOKED`
- `REFRESH_EXPIRED`
- `INVALID_API_KEY`
- `PROJECT_MISMATCH`

#### 7.3 Auth header policy

```text
X-API-Key: <project key>          // always required for multi-tenant routing
Authorization: Bearer <user access token>  // only user sessions
```

Stop putting the project API key in `Authorization` when no user session exists (or gate that behind a separate server-to-server mode).

---

### Phase 2 — SDK changes (`paperdb-js`)

#### 7.4 Persist full session, not only token

```ts
// localStorage key e.g. paperdb_session_v2
{
  token: string;
  refreshToken?: string;
  expiresAt?: string;
  sessionId?: string;
  userId?: string;
}
```

#### 7.5 Public readiness + single bootstrap

```ts
class AuthClient {
  readonly ready: Promise<void>; // resolves after initializeSession

  private async initializeSession() {
    const stored = this.loadSession();
    if (!stored) {
      this.updateState({ isLoading: false });
      return;
    }
    this.sessionToken = stored.token;
    // Proactive refresh if expires within skew (e.g. 60s)
    if (this.isExpiringSoon(stored.expiresAt) && stored.refreshToken) {
      await this.refreshSession();
    } else {
      // Optional: lightweight validate, or lazy-validate on first getUser
    }
    this.updateState({ isLoading: false });
  }
}
```

Apps:

```ts
await db.auth.ready;
const user = await db.auth.getUser();
```

#### 7.6 Typed failures (don’t swallow)

```ts
class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) { super(message); }
}

async getUser(): Promise<User | null> {
  if (!this.sessionToken) return null;
  try {
    const { user } = await this.request("/me");
    ...
    return user;
  } catch (e) {
    if (e instanceof AuthError && e.code === "SESSION_EXPIRED") {
      const session = await this.refreshSession();
      if (session) return this.getUser();
    }
    if (e instanceof AuthError && e.status === 401) {
      this.clearSession();
      return null;
    }
    throw e; // network / 5xx — do not clear session
  }
}
```

**Important:** Do **not** `clearSession()` on 5xx or network errors.

#### 7.7 Fix refresh implementation

```ts
async refreshSession() {
  const stored = this.loadSession();
  const refreshToken = stored?.refreshToken ?? this.sessionToken; // only if Model A
  if (!refreshToken) return null;

  const res = await paperFetch(`${this.baseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
      // Prefer dedicated header or body for refresh token:
      Authorization: `Bearer ${refreshToken}`,
      // or body: { refreshToken }
    },
  });
  ...
  this.saveSession(result.session); // must persist new access (+ rotated refresh)
  return result.session;
}
```

#### 7.8 Deduplicate concurrent restore

```ts
private bootstrapPromise: Promise<void> | null = null;

ensureSession() {
  if (!this.bootstrapPromise) {
    this.bootstrapPromise = this.initializeSession().finally(() => {
      this.bootstrapPromise = null;
    });
  }
  return this.bootstrapPromise;
}
```

Prevent parallel `/refresh` + `/me` storms from React Strict Mode double-mount + constructor init.

#### 7.9 Optional React helper

```ts
// @paperdb-js/react
function usePaperDBUser() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | authenticated | anonymous | error
  useEffect(() => {
    let alive = true;
    (async () => {
      await client.auth.ready;
      try {
        const u = await client.auth.getUser();
        if (!alive) return;
        setUser(u);
        setStatus(u ? "authenticated" : "anonymous");
      } catch {
        if (!alive) return;
        setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { user, status };
}
```

---

### Phase 3 — Documentation

Add a page: **“Auth sessions & restore”** covering:

1. Token model (A or B) and TTLs
2. Exactly which headers `/sign-in`, `/me`, `/refresh`, `/sign-out` require
3. `localStorage` keys the SDK owns (`paperdb_session_token` / v2)
4. “Do not reimplement session storage unless necessary”
5. How to debug 401 (table from §6 curl tests)
6. CORS + `credentials: "omit"` implications
7. React Strict Mode double-invoke note

---

## 8. Recommended short-term SDK patch (minimal)

Even before full access/refresh split, ship this in a patch release:

1. **`auth.ready` Promise** after `initializeSession`.
2. **Stop clearing session on non-401 errors**.
3. **Propagate `code` + `status` on auth errors** (parse JSON body).
4. **Persist `expiresAt`** next to token when API returns it.
5. **If `/me` returns `SESSION_EXPIRED`, call `/refresh` once automatically** before giving up (only if API supports refresh with current token).
6. **Remove `Authorization: Bearer <apiKey>` fallback** for `/auth/*` user routes (keep `X-API-Key` only).
7. **Docs:** dual 401 means “session dead; re-login” until refresh works.

---

## 9. What integrators should do until PaperDB ships fixes

1. **Treat dual 401 as logged out** — clear app state; do not trust cached user profiles.
2. **Prefer SDK storage** (`paperdb_session_token` / future v2) as source of truth; avoid a second parallel session blob unless synced.
3. **`await` a readiness gate** if you polyfill one (wrap first `getUser` after client create).
4. **After sign-in**, verify Network tab:
   - Response includes `session.token`
   - Next `/me` uses that exact token
5. **Manual curl** of token immediately after sign-in (matrix §6).
6. **Log auth error bodies** (temporarily patch or wrap `fetch`) to capture PaperDB `code`/`message`.

Shop Daddy currently follows (1)–(2) after the app-side restore fix; remaining dual 401s with a **fresh** token indicate API/session issuance bugs.

---

## 10. Ask for PaperDB maintainers

Please confirm and track:

| ID  | Question                                                                                     | Owner      |
| --- | -------------------------------------------------------------------------------------------- | ---------- |
| Q1  | Immediately after `/auth/sign-in`, does the returned `session.token` succeed on `/auth/me`?  | API        |
| Q2  | What credential is `/auth/refresh` supposed to accept? Same token or separate refresh token? | API + Docs |
| Q3  | What is default session TTL? Is it enforced?                                                 | API        |
| Q4  | Are sessions scoped to project (`X-API-Key`)?                                                | API        |
| Q5  | Will SDK persist `expiresAt` + expose `auth.ready`?                                          | SDK        |
| Q6  | Will 401 responses include stable machine-readable `code`?                                   | API        |
| Q7  | Can constructor auto-refresh be deferred until `getUser` / `ready` to avoid races?           | SDK        |

---

## 11. Appendix — relevant SDK excerpts (v1.1.0)

**Bootstrap + refresh:**

```js
async initializeSession() {
  const storedToken = localStorage.getItem("paperdb_session_token");
  if (storedToken) {
    this.sessionToken = storedToken;
    try {
      await this.refreshSession();
    } catch {
      this.clearSession();
    }
  }
  this.updateState({ isLoading: false });
}
```

**getUser clears on any error:**

```js
async getUser() {
  if (!this.sessionToken) return null;
  try {
    const { user } = await this.request("/me");
    this.updateState({ user, isAuthenticated: true });
    return user;
  } catch {
    this.clearSession();
    return null;
  }
}
```

**Headers (session vs API key as Bearer):**

```js
if (this.sessionToken) {
  headers["Authorization"] = `Bearer ${this.sessionToken}`;
}
if (!headers["Authorization"] && this.apiKey) {
  headers["Authorization"] = `Bearer ${this.apiKey}`;
}
```

---

## 12. Bottom line

| Layer                                        | Verdict                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Browser red stack                            | Cosmetic; failed `fetch` logging                                                                                        |
| App restore using cached user after 401      | App bug (fixed in Shop Daddy)                                                                                           |
| `GET /auth/me` 401 with stored token         | Session invalid/expired **or** token not accepted by API                                                                |
| `POST /auth/refresh` 401 with **same** token | **PaperDB session/refresh design gap** unless TTL policy is “re-login only” and refresh is documented as non-recovering |
| General fix                                  | Explicit access/refresh (or long session) contract + SDK ready/persist/errors + docs                                    |

**If a brand-new sign-in token fails `/me` without waiting for TTL, treat it as a Sev-1 PaperDB API bug.**  
**If only old tokens fail both `/me` and `/refresh`, treat refresh as unimplemented/broken and ship Phase 1–2 above.**

---

**End of report. and shared**
