# Network Connectivity Root Cause Report

**Date of investigation:** 2026-09-07  
**Scope:** Read-only diagnosis requested for the Expo → Replit API → Supabase/VPS authentication path.  
**Change policy:** No application code, Secrets, Environment Variables, database, RLS, Supabase production configuration, Firewall, DNS, or RPC was modified during this investigation.

## 1. Current Architecture

The current authentication and profile bootstrap path is:

```text
Expo mobile app
  ├─ Supabase Auth session/token
  └─ relative /api/* requests
       ↓
Replit API Server on local port 8080
       ↓
https://ajyalalmaerifa.com
  ├─ /auth/v1/user
  └─ /rest/v1/* (profiles, roles, teacher approval, bans, etc.)
       ↓
Supabase/VPS endpoint at 72.61.23.237
```

Evidence in the code:

- `artifacts/ajyal-mobile/app/_layout.tsx` configures the API client base URL from `EXPO_PUBLIC_DOMAIN` and attaches the Supabase Bearer token.
- `artifacts/api-server/src/lib/supabaseAuth.ts` uses `EXPO_PUBLIC_SUPABASE_URL` and the publishable key, then calls `/auth/v1/user` and PostgREST.
- `artifacts/api-server/src/routes/profile.ts` requires a verified Supabase user and then reads the profile, roles, teacher approval, and ban state.
- `artifacts/api-server/.replit-artifact/artifact.toml` runs the API on local port `8080`.
- The current API artifact is configured as a Replit development/production artifact, not as a VPS-local API.

## 2. DNS Results

| Target | Result | Meaning |
|---|---|---|
| `72.61.23.237` | Literal IPv4 address | No DNS dependency for the direct-IP test |
| `ajyalalmaerifa.com` | Resolves to `72.61.23.237` | DNS resolution succeeds |

**DNS status: PASS**

DNS is not the current failure layer.

## 3. TCP Results

The tests were executed from the current API/Replit environment without an API key or Bearer token.

Observed egress address:

```text
34.180.8.129
```

This address was observed for the test only. It has not been proven to be static, dedicated, or safe to use as a permanent production allowlist entry.

| Destination | Result |
|---|---|
| `72.61.23.237:22` | TIMEOUT |
| `72.61.23.237:80` | TIMEOUT |
| `72.61.23.237:443` | TIMEOUT |
| `72.61.23.237:8000` | TIMEOUT |
| `ajyalalmaerifa.com:443` | TIMEOUT |

The direct requested test was repeated separately:

```text
TARGET=72.61.23.237:443
TCP=TIMEOUT
ELAPSED_SECONDS=8
```

**TCP status: BLOCKED**

The failure occurs before TLS negotiation and before any HTTP request can be processed.

## 4. TLS Results

HTTPS probes to:

```text
https://ajyalalmaerifa.com/auth/v1/health
```

and the same request with SNI forced to `72.61.23.237` both ended with:

```text
curl status=000
Connection timed out
```

No TLS handshake was reached.

**TLS status: NOT REACHED**

This is not a certificate, SNI, Bearer token, or Supabase Auth error. TCP must succeed before those layers can be evaluated.

## 5. HTTP Results

HTTP and HTTPS health probes did not receive a response:

```text
HTTP status: 000
Connection timed out
```

There is no HTTP status code to classify as `401`, `403`, `404`, or `5xx`.

**HTTP status: NOT REACHED**

The request is not failing at authentication or application routing in this environment; it is failing before HTTP.

## 6. API Health and Request Behavior

The local API process is healthy:

```text
GET http://127.0.0.1:8080/api/healthz
HTTP 200
Body: {"status":"ok"}
```

The workflow also reported that the API was listening on port `8080`.

When the mobile app retries, the API receives requests such as:

```text
GET /api/me
GET /api/student/dashboard
GET /api/assignments
```

The preflight requests return `204`, but the authenticated GET requests are aborted after waiting for the upstream Supabase operation. This matches the TCP failure to the Supabase/VPS endpoint.

**API status: PARTIAL**

- Local listener and health route: PASS
- Mobile-to-API request arrival: PASS
- API-to-Supabase/VPS dependency: BLOCKED

## 7. VPS Listener and Firewall Results

The workspace cannot independently run `ss`, Nginx, UFW, iptables, or Docker checks inside the VPS because SSH itself is currently unreachable from Replit on port `22`.

The attached investigation notes report the following VPS-side observations:

- Nginx is running.
- Ports `80` and `443` have listeners.
- HTTPS and `/api/healthz` work when tested from inside the VPS.
- UFW/Firewall contains an allow rule for `443`.

The attached Hostinger screenshot also shows an `Accept / TCP / 443 / Any source` rule.

Those VPS-side claims are recorded as **user-provided or previously observed evidence**, not as independently reproduced checks in this session. An allow rule alone does not prove that:

- the service is listening on the public IPv4 interface;
- a Hostinger/cloud firewall is forwarding the traffic;
- the provider edge is allowing the traffic;
- the route from Replit is permitted;
- the listener is the service that serves Supabase/Kong.

**VPS listener/firewall status: INCONCLUSIVE FROM REPLIT**

## 8. Supabase Location and Database Relationship

The application’s Supabase HTTP endpoint is configured as:

```text
https://ajyalalmaerifa.com
```

The endpoint resolves to:

```text
72.61.23.237
```

The project’s Drizzle database code uses `DATABASE_URL` through `pg.Pool`. Previous read-only inspection identified that runtime connection as PostgreSQL host `helium` with database `heliumdb`. That is separate from the Supabase HTTP endpoint and must not be treated as a Supabase replacement without explicit proof.

| Component | Host | Port | Protocol | Current access from Replit |
|---|---|---:|---|---|
| Expo API client | Replit API domain | HTTPS | HTTPS | Not independently probed here |
| Replit API | local artifact | 8080 | HTTP | PASS locally |
| Supabase Auth/PostgREST endpoint | `ajyalalmaerifa.com` → `72.61.23.237` | 443 | HTTPS | TCP TIMEOUT |
| Direct VPS HTTP test | `72.61.23.237` | 80 | HTTP | TCP TIMEOUT |
| Direct VPS alternate HTTP test | `72.61.23.237` | 8000 | HTTP | TCP TIMEOUT |
| Drizzle database | `helium` / `heliumdb` | PostgreSQL default | PostgreSQL | Separate local/runtime database path |

The exact internal placement of Supabase behind Nginx/Kong/containers cannot be proven from Replit while all VPS ports are unreachable.

## 9. Replit Supabase Connector Findings

The project has Supabase integration metadata and the API code conditionally creates a Replit connector proxy when `REPLIT_CONNECTORS_HOSTNAME` is available.

Read-only environment inspection showed:

- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` exists as a Secret.
- `EXPO_PUBLIC_SUPABASE_URL` exists as a shared environment variable.
- No Secret values were printed or exposed.
- The Supabase connection metadata exists, but the inspected connection reported no client/health result usable as proof of application-level Auth access.

Previous read-only connector probes reported:

- `/rest/v1/` can redirect through the connector path.
- `/auth/v1/health` returned `403` through the connector path.

Therefore the connector has **not** been proven to support the required authenticated operation:

```text
/auth/v1/user
```

The connector must not be treated as a general TCP proxy or as a proven replacement for direct Supabase access.

**Connector status: PARTIAL / NOT SUFFICIENTLY PROVEN**

## 10. Secrets Check

Only existence was checked. Values were not read or printed.

Relevant entries found:

- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: present
- `EXPO_PUBLIC_SUPABASE_URL`: present
- `SESSION_SECRET`: present
- `REPLIT_EXPO_SESSION_SECRET`: present
- VPS-related credentials: present as managed Secrets

The presence of a key does not prove network reachability or validity of the live custom domain. No service-role key is used or required by the current API path.

**Secrets status: NOT THE ROOT CAUSE**

## 11. Root Cause

The proven root cause is:

```text
BLOCKED BY EXTERNAL NETWORK CONTROL
```

The Replit API cannot establish a TCP connection to the VPS/Supabase public endpoint. Since the failure occurs at TCP:

- DNS succeeds.
- API local health succeeds.
- Mobile requests reach the API.
- TLS is never reached.
- HTTP is never reached.
- Supabase Auth is never reached.
- Bearer token and RLS are not the active failure layer.

The exact packet-drop location cannot be distinguished between Replit egress, internet routing, Hostinger edge firewall, VPS firewall, or the public listener without network-flow logs or a reachable VPS administration channel.

## 12. Evidence

1. `ajyalalmaerifa.com` resolves to `72.61.23.237`.
2. Current Replit egress observed as `34.180.8.129`.
3. TCP timeouts occur on VPS ports `22`, `80`, `443`, and `8000`.
4. TCP timeout occurs on the domain at port `443`.
5. HTTPS health probes return status `000` after connection timeout.
6. Local API `/api/healthz` returns `200`.
7. API logs show mobile GET requests aborting while waiting for upstream work.
8. The mobile app obtains a Supabase session and sends a Bearer-authenticated API request according to the attached diagnosis and current code path.
9. The displayed Firewall rule for `443` does not change the observed external TCP result.
10. Historical workflow files do not contain a preserved network probe at the reported `12:52` time, so the previous working state cannot be reconstructed from Replit logs alone.

## 13. Fix Applied

No production or application fix was applied.

The only runtime action previously performed was restarting the Replit API workflow after a local `EADDRINUSE` process conflict. That restored the local API listener but did not restore the external VPS TCP path.

No code, Secret, Environment Variable, database, RLS policy, Supabase schema, RPC, DNS, or Firewall rule was changed.

## 14. Fix Not Possible From Replit

The following cannot be repaired from the current Replit environment while all VPS ports time out:

- VPS Firewall or Hostinger cloud firewall configuration
- Nginx/Kong public listener configuration
- VPS routing or network interface configuration
- Provider-level DDoS/edge filtering
- Static egress/NAT provisioning
- A VPS-side SSH inspection or restart

SSH credentials cannot bypass a network ACL when port `22` itself is unreachable.

## 15. Exact External Action Required

From the Hostinger/VPS side, perform these checks without changing application data:

1. Confirm a listener exists on the public IPv4 interface:

   ```bash
   sudo ss -lntp | grep -E ':(443|80|8000)\b'
   ```

2. Confirm the local service responds:

   ```bash
   curl -vk --max-time 5 https://127.0.0.1/auth/v1/health
   ```

3. Check Hostinger/cloud firewall and provider-level networking, not only the guest UFW rule.

4. Check whether traffic from the observed Replit egress address `34.180.8.129` is being dropped. Do not use this address as a permanent allowlist entry until its static/shared status is verified.

5. If the listener and provider firewall are correct but Replit still times out, use a fixed egress/NAT gateway or move the API next to Supabase on the VPS/private network.

6. After the external network path is repaired, repeat:

   ```text
   Replit API → 72.61.23.237:443 TCP
   Replit API → https://ajyalalmaerifa.com/auth/v1/health
   Expo → /api/me → Supabase profile
   ```

The success criterion is an authenticated `200` profile response, not merely a successful localhost health check.

## 16. Security Considerations

- Do not put a service-role key in the mobile app.
- Do not disable authentication or RLS to mask the network failure.
- Do not bypass TLS or use plain HTTP for production Supabase/Auth traffic.
- Do not permanently trust a single observed Replit egress IP without proving it is static.
- Keep all Supabase and VPS credentials in managed Secrets.
- Prefer a private/internal API-to-Supabase route or a controlled fixed-egress gateway for production.

## 17. Verification Results

| Layer | Status | Result |
|---|---|---|
| DNS | PASS | Domain resolves to VPS IP |
| Replit egress identification | PASS | `34.180.8.129` observed; static status unknown |
| TCP to VPS | BLOCKED | Ports 22/80/443/8000 timeout |
| TCP to domain | BLOCKED | Port 443 timeout |
| TLS | BLOCKED | Handshake not reached |
| HTTP | BLOCKED | No status code returned |
| Local API health | PASS | `127.0.0.1:8080/api/healthz` → `200` |
| API-to-Supabase | BLOCKED | Upstream TCP path unavailable |
| Supabase Auth | BLOCKED | `/auth/v1/user` cannot be reached from API |
| Profile/role resolution | BLOCKED | Depends on Supabase Auth/PostgREST |
| Mobile bootstrap | BLOCKED | `/api/me` cannot complete |

## 18. Final Architecture Recommendation

### Option A — Current

```text
Expo → Replit API → public internet → VPS/Supabase
```

**Result:** Currently blocked by external network control. It is also fragile if the API remains a development workflow.

### Option B — Recommended for this deployment

```text
Expo → HTTPS API on VPS → private/local Supabase network
```

**Result:** Best fit if Supabase is self-hosted or reachable locally on the VPS. It removes the Replit-to-VPS egress dependency from the production request path.

### Option C — Alternative

```text
Expo → Replit API → Supabase Cloud/public endpoint
```

**Result:** Viable only if the Supabase endpoint is genuinely reachable from Replit and the connector or direct route supports both Auth user verification and PostgREST under RLS. Current evidence does not prove that condition.

**Recommendation:** Do not migrate data or change production blindly. First repair or prove the external network path. For a permanent production design, deploy the API beside Supabase or provide a verified fixed-egress/private route.

## Final Status

```text
NETWORK:     BLOCKED
SUPABASE:    BLOCKED
API:         PARTIAL
AUTH:        BLOCKED
MOBILE:      BLOCKED
PRODUCTION:  BLOCKED
```
