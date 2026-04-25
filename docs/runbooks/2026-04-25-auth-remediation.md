# Cotiza Studio — Auth + Currency Remediation (2026-04-25)

## Symptoms (browser audit)

Loading https://cotiza.studio/ produces the following console errors:

| Endpoint | Status | Source of failure |
|----------|--------|-------------------|
| `/api/auth/session` | 500 | next-auth `CLIENT_FETCH_ERROR` ("There is a problem with the server configuration") |
| `/api/auth/_log` | 500 | Same root cause as above |
| `/api/v1/geo/detect` | 500 | api-pod side issue (under investigation; see "API pod CrashLoop" below) |
| `/api/v1/currency/rates?base=MXN` | 500 | Same as above |
| `/auth/error?error=Configuration` | 404 | No `/auth/error` page exists; next-auth's default redirect target is undefined |
| `/pricing?_rsc=…` | 404 | Pages don't exist yet (low priority) |
| `/features?_rsc=…` | 404 | Pages don't exist yet (low priority) |

User flow: landing page → "Sign In" → "Sign in with Janua" → redirected to `/auth/error?error=Configuration` → 404. **Login is impossible.**

## Root cause

The `digifab-quoting-secrets` Kubernetes Secret is missing 3 required keys:

```
$ kubectl describe secret -n digifab-quoting digifab-quoting-secrets
# (current keys)
STRIPE_SECRET_KEY:      42 bytes
STRIPE_WEBHOOK_SECRET:  40 bytes
DATABASE_URL:           107 bytes
JWT_SECRET:             65 bytes
LOG_TO_FILE:            5 bytes
NODE_ENV:               10 bytes
REDIS_URL:              72 bytes
```

Missing:
- `NEXTAUTH_SECRET` — without this, every next-auth API call returns 500 + `CLIENT_FETCH_ERROR`.
- `JANUA_CLIENT_ID` — the OIDC client ID for cotiza's Janua registration. Without this, the OAuth handshake fails before redirecting to Janua.
- `JANUA_CLIENT_SECRET` — pairs with `JANUA_CLIENT_ID`.
- (Optional) `OPENEXCHANGERATES_APP_ID` — would unblock `/api/v1/currency/rates` legacy path; better to wire dhanam funnel instead (see "Currency funnel" below).

## Remediation — operator steps

### 1. Generate `NEXTAUTH_SECRET`

```bash
NEXTAUTH_SECRET=$(openssl rand -base64 32)
```

### 2. Register Janua OAuth client

Cotiza needs an OAuth client registered with Janua. Use the Janua admin
API or operator UI to create one with:

- **Redirect URI**: `https://cotiza.studio/api/auth/callback/janua`
- **Grant types**: `authorization_code`, `refresh_token`
- **Scopes**: `openid`, `profile`, `email`

Janua issues a `client_id` + `client_secret` pair. Capture both.

### 3. Patch the Secret in-cluster

The fastest path (no need to recreate the whole Secret):

```bash
kubectl patch secret -n digifab-quoting digifab-quoting-secrets \
  --type='json' \
  -p="[
    {\"op\":\"add\",\"path\":\"/data/NEXTAUTH_SECRET\",\"value\":\"$(printf '%s' "$NEXTAUTH_SECRET" | base64)\"},
    {\"op\":\"add\",\"path\":\"/data/JANUA_CLIENT_ID\",\"value\":\"$(printf '%s' "$JANUA_CLIENT_ID" | base64)\"},
    {\"op\":\"add\",\"path\":\"/data/JANUA_CLIENT_SECRET\",\"value\":\"$(printf '%s' "$JANUA_CLIENT_SECRET" | base64)\"}
  ]"
```

Or rewrite the whole Secret from the template:

```bash
cp infra/k8s/production/secrets-template.yaml infra/k8s/production/secrets.local.yaml
# Fill in values
kubectl apply -f infra/k8s/production/secrets.local.yaml
```

### 4. Roll the deployments

The web pod loads the Secret via `envFrom`, which picks up changes only on
restart:

```bash
kubectl rollout restart deployment -n digifab-quoting digifab-quoting-web
kubectl rollout status deployment -n digifab-quoting digifab-quoting-web
```

### 5. Verify

```bash
# /api/auth/session should now return 200 with the unauthenticated session
curl -sI https://cotiza.studio/api/auth/session

# Browser flow: landing → Sign In → Sign in with Janua → expect redirect
# to https://auth.madfam.io/oauth/authorize?... (Janua login screen)
```

If the redirect to Janua still fails, double-check `JANUA_CLIENT_ID` is
exactly what Janua issued (no trailing whitespace) and that the redirect
URI registered with Janua is `https://cotiza.studio/api/auth/callback/janua`
EXACTLY (next-auth derives this from `NEXTAUTH_URL` + provider id, which
is `janua` per `apps/web/src/lib/auth.ts:23`).

## Already in this PR (code-side fixes)

- `pages.error: '/auth/error'` → `'/auth/login'` (`apps/web/src/lib/auth.ts`).
  Reason: there is no `/auth/error` page, so the default next-auth error
  redirect produces a 404. The login page already reads `?error=<code>`
  from the query string and renders an Alert. Repointing `pages.error`
  to `/auth/login` reuses that UI without creating a new file.
- Expanded `errorMessages` map in `apps/web/src/app/auth/login/page.tsx`
  to cover `Configuration`, `AccessDenied`, `Verification`, etc. — so
  that misconfiguration during the next operator-side rollout still
  surfaces a readable error to the user, not a blank Default fallback.
- Added `infra/k8s/production/secrets-template.yaml` documenting every
  key the deployments expect, with inline notes on which integrations
  use each one.

## Currency funnel (RFC 0011 follow-up)

Per the user's 2026-04-25 directive: **all currency / FX services should
funnel through Dhanam.** Today, cotiza-api's `CurrencyService`
(`apps/api/src/modules/currency/services/currency.service.ts`, if it
exists in this repo — confirm path) hits openexchangerates.org directly
when `OPENEXCHANGERATES_APP_ID` is set.

Migration target (Phase 2 of RFC 0011 consumer migration):
1. Replace direct openexchangerates calls with calls to
   `${DHANAM_API_URL}/v1/fx/spot?base=…&quote=…`.
2. Remove `OPENEXCHANGERATES_APP_ID` from the secrets-template once
   migration is verified.
3. Track in `internal-devops/rfcs/0011-fx-as-platform-service.md` Phase 2.

This is OUT OF SCOPE for the current immediate-unblock fix (which is
just provisioning the missing auth secrets so login works at all). The
currency 500s have a separate cause — the CurrencyController itself
crashes when it can't reach its rate provider — and will be addressed
in the dhanam funnel migration.

## API pod CrashLoop (separate issue)

Pod `digifab-quoting-api-66b759c99d-thvvk` has 1012+ restarts (5d4h
running). Exit code 137 = OOM kill. Probes use `timeout=1s` which is
brutal under cold start. Old ReplicaSet `d5687b56b` (image
`...0372c2fd...`) is healthy and serving traffic, so this is not yet
user-visible — but the new ReplicaSet has been stuck for 5+ days and
should be cleaned up:

```bash
kubectl delete replicaset -n digifab-quoting digifab-quoting-api-66b759c99d
```

The new RS is on a duplicate digest with broken probes; the deployment
spec needs a probe-timeout bump (1s → 5s) before any future image
rollout. Out of scope for this PR; tracked separately.

## Why the user couldn't dashboard-walkthrough

The full chain user → landing → sign-in → Janua → dashboard breaks at
step 3. Until the operator completes the 5 steps above, no user can
authenticate and reach `/dashboard`. The `admin@madfam.io` credentials
are valid (it's the same Janua user used elsewhere), but they're never
reached because cotiza never gets far enough to redirect.

After the operator completes the Janua client registration + Secret
patch + pod restart, the user-facing flow is:

1. https://cotiza.studio → click "Sign In" → /auth/login
2. Click "Sign in with Janua" → 302 to https://auth.madfam.io/oauth/authorize?…
3. Janua login page → enter `admin@madfam.io` + password
4. Janua issues authorization code → 302 to https://cotiza.studio/api/auth/callback/janua?code=…
5. next-auth exchanges code for tokens via `${JANUA_ISSUER}/oauth/token`
6. Sets `__Secure-next-auth.session-token` cookie, redirects to `/dashboard`
