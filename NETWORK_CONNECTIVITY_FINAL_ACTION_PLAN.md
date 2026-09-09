# Network Connectivity Final Action Plan

**Date:** 2026-09-07  
**Mode:** Read-only investigation and action planning  
**Scope:** Expo → Replit API → `ajyalalmaerifa.com`/Supabase authentication path  
**Restrictions honored:** No code, Secrets, Environment Variables, database, RLS, Supabase Auth, RPC, DNS, Firewall, Nginx, or production configuration was changed.

## A. Root Cause

The Replit API is healthy locally, but the target VPS/Supabase IPv4 endpoint is not reachable from the current Replit runtime at the TCP layer:

```text
Replit API → TCP 72.61.23.237:443 → TIMEOUT
```

The newer control tests show that this is **not a global HTTPS outage inside Replit**:

- Direct HTTPS to `example.com` succeeds without a proxy.
- Direct TCP to `1.1.1.1:443` succeeds.
- No HTTP/HTTPS/ALL proxy variables are set in the runtime.
- The target domain has an IPv4 record only.
- The target VPS ports `22`, `80`, `443`, and `8000` all time out.

The precise drop point cannot be proven from Replit alone. The remaining candidate layers are:

1. Hostinger/provider edge filtering or routing for the VPS.
2. VPS public-interface/firewall/listener state.
3. A destination-specific network policy or route issue between Replit egress and this VPS.
4. A public IP/NAT mismatch, where `72.61.23.237` is no longer the active public listener.

The current failure is not proven to be caused by Expo, Supabase Bearer handling, SecureStore, RLS, the publishable key, or the local `heliumdb` database.

## B. Actual Evidence

### DNS

```text
ajyalalmaerifa.com → 72.61.23.237
```

- IPv4 resolution: PASS
- IPv6 resolution: no AAAA result observed
- IPv6 is not carrying this request

### TCP from the API/Replit runtime

```text
72.61.23.237:22    TIMEOUT
72.61.23.237:80    TIMEOUT
72.61.23.237:443   TIMEOUT
72.61.23.237:8000  TIMEOUT
ajyalalmaerifa.com:443 TIMEOUT
```

The requested direct test was reproduced with an 8-second timeout:

```text
TARGET=72.61.23.237:443
TCP=TIMEOUT
ELAPSED_SECONDS=8
```

### General outbound controls

```text
Direct TCP 1.1.1.1:443: SUCCESS
Direct HTTPS example.com: HTTP 200
HTTP_PROXY: UNSET
HTTPS_PROXY: UNSET
ALL_PROXY: UNSET
NO_PROXY: UNSET
```

This proves that ordinary outbound HTTPS/TCP from the runtime is functioning.

### Route/path observation

`tracepath` reached upstream network hops but did not reach the VPS within the eight-hop limit. This is evidence that a route exists beyond the local container, but it does not identify the exact packet-drop device because intermediate devices may suppress ICMP replies.

The `ip` command is not installed in this runtime. Kernel route files were readable, but a full `ip route`/`ip -6 route` report cannot be generated without installing a package, which is outside this read-only task.

### Local API

```text
GET http://127.0.0.1:8080/api/healthz
HTTP 200
{"status":"ok"}
```

### API request behavior

The API receives mobile requests:

```text
GET /api/me
GET /api/student/dashboard
GET /api/assignments
```

Preflight requests complete with `204`, but authenticated GET requests are aborted after approximately 15 seconds while upstream Supabase work is pending. This is consistent with the target TCP timeout.

## C. What Has Been Ruled Out

The following are not the current proven failure layer:

- DNS resolution for the domain.
- General Replit outbound HTTPS.
- General Replit outbound TCP on port 443.
- An HTTP proxy requirement inside the current runtime.
- The local API listener.
- CORS preflight handling.
- The mobile app reaching the Replit API.
- A missing publishable-key Secret, based on existence-only inspection.
- A local API port failure after the workflow restart.
- IPv6 routing as the cause; no IPv6 address was returned for the domain.

The following are not yet ruled out:

- Hostinger provider firewall or edge ACL.
- VPS guest firewall despite the displayed rule.
- Listener bound to the wrong interface or wrong public address.
- Public IP/NAT mismatch.
- Provider routing or destination-specific filtering.
- A service-specific failure after TCP is repaired.

## D. Classification of the Possible Failure Layer

| Layer | Current assessment | Why |
|---|---|---|
| General Replit egress | Unlikely as a global outage | Public TCP/HTTPS succeed directly |
| Destination-specific Replit policy | Possible, not proven | Only this VPS destination fails |
| Internet routing | Possible | `tracepath` does not reach destination |
| Hostinger firewall/cloud firewall | Plausible | All VPS ports fail from Replit |
| VPS UFW/iptables/nftables | Plausible | Guest rules may differ from the screenshot or drop traffic earlier |
| Nginx/Kong listener | Plausible but not proven | A firewall allow rule does not prove a public listener |
| Public IP/NAT mismatch | Plausible | DNS may point to an address that is not the active service edge |
| IPv4/IPv6 mismatch | IPv6 is not the cause observed | Only IPv4 DNS result exists and IPv4 TCP itself times out |
| Supabase Auth/application | Downstream, not current layer | TCP never reaches TLS or HTTP |

Current classification:

```text
DESTINATION-SPECIFIC NETWORK PATH BLOCKED OR VPS-SIDE UNREACHABLE
```

It is not justified to claim that Replit globally blocks outbound HTTPS.

## E. Read-Only Tests Required Inside the VPS

Run these commands on the VPS without changing rules or services:

### Confirm public addresses and interfaces

```bash
ip -4 addr show
ip -4 route
ip -6 addr show
ip -6 route
hostname -I
```

Confirm that `72.61.23.237` is actually assigned or routed to the active VPS, not only present in DNS.

### Confirm listeners and bind addresses

```bash
sudo ss -lntp | grep -E ':(22|80|443|8000)\b'
```

The expected public listener should be bound to `0.0.0.0:443` or the actual public interface, not only `127.0.0.1:443`.

### Confirm local HTTPS and service routing

```bash
curl -vk --connect-timeout 5 --max-time 8 https://127.0.0.1/auth/v1/health
curl -vk --connect-timeout 5 --max-time 8 \
  --resolve ajyalalmaerifa.com:443:127.0.0.1 \
  https://ajyalalmaerifa.com/auth/v1/health
```

These tests verify local Nginx/Kong routing without exposing any key.

### Inspect, do not change, guest firewall rules

```bash
sudo ufw status verbose
sudo nft list ruleset
sudo iptables -S
sudo iptables -L -n -v
```

### Validate Nginx and inspect recent logs

```bash
sudo nginx -t
sudo journalctl -u nginx --since "30 minutes ago" --no-pager
sudo tail -n 200 /var/log/nginx/error.log
sudo tail -n 200 /var/log/nginx/access.log
```

### If Supabase is containerized, inspect containers read-only

```bash
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
sudo docker compose ps
```

Do not restart containers or edit configuration during this phase.

## F. Read-Only Tests Required in Hostinger

From the Hostinger control panel, inspect without changing rules:

1. Confirm the VPS public IPv4 is still `72.61.23.237`.
2. Confirm the VPS is not behind a changed NAT or replacement public IP.
3. Review Cloud Firewall/security-group rules separately from the guest UFW rule.
4. Review provider network, DDoS, abuse, or temporary-block events.
5. Review inbound-drop logs for the observed Replit source address:

   ```text
   34.180.8.129
   ```

   This address is evidence from one runtime observation only; verify whether it is static before using it for an allowlist.
6. Use any Hostinger port-check or monitoring tool to test TCP 443 from an external network.
7. Confirm that the rule shown in the screenshot is active in the correct firewall profile and attached to this VPS.

The existing `TCP 443 / Any / Accept` row is useful evidence, but it does not prove provider-edge routing or that a listener is bound publicly.

## G. Read-Only Tests Required in Replit

After the VPS-side checks, repeat from the API runtime:

```bash
timeout 8 bash -c 'exec 3<>/dev/tcp/72.61.23.237/443'
```

Then:

```bash
curl --noproxy '*' -4 -sv --connect-timeout 8 --max-time 12 \
  https://ajyalalmaerifa.com/auth/v1/health
```

Interpretation:

1. TCP timeout: remain in network investigation; do not modify JavaScript.
2. TCP connected but TLS failure: inspect certificate, SNI, and Nginx TLS binding.
3. TLS succeeds but HTTP fails: inspect Nginx/Kong/Supabase routing.
4. Auth health responds: proceed to the authenticated `/auth/v1/user` check using the existing runtime token without printing it.

The current Replit control results are:

```text
Public HTTPS: PASS
Public TCP 443: PASS
VPS TCP 443: TIMEOUT
```

## H. Safe Temporary Solution

There is no safe code-only workaround for a closed TCP path.

Safe temporary choices are limited to:

1. Restore the existing public HTTPS path after the VPS/Hostinger read-only checks identify the block.
2. Run the API in an environment that is already on the same private network as Supabase, without changing data or authentication.
3. Use the Replit Supabase Connector only if a read-only test proves it supports both:

   ```text
   /auth/v1/user
   /rest/v1/profiles
   ```

The current connector evidence does not prove that capability, so it must not be treated as a workaround yet.

Do not use:

- Plain HTTP in production.
- A service-role key in the mobile app.
- Mock users or mock profile data.
- Authentication bypasses.
- A fallback that accepts only decoded JWT claims without profile/RLS verification.

## I. Permanent Production Solution

### Recommended architecture

```text
Expo
  ↓ HTTPS
API hosted beside the Supabase/VPS services
  ↓ private/local network
Supabase Auth/PostgREST
```

This removes the Replit-to-VPS public egress dependency from the production request path.

### Alternative

Keep the API on Replit only if a verified static egress/NAT gateway exists and the Hostinger/VPS/provider firewall can safely allow that fixed source. The observed `34.180.8.129` must not be assumed static.

Do not migrate databases or alter production schema as part of this network repair.

## J. What Must Be Changed Exactly

No change is justified inside the app yet.

The external action must be one of the following, after read-only proof:

1. Correct the Hostinger/VPS public routing so `72.61.23.237:443` accepts external TCP.
2. Correct the listener bind/address if `ss` shows only localhost or the wrong interface.
3. Correct the provider firewall/security-group attachment if the displayed rule is not active at the edge.
4. Correct DNS only if `72.61.23.237` is not the actual public service IP.
5. Provide a verified fixed-egress/private route and allow that route.
6. Move the production API next to Supabase if public Replit egress cannot be made reliable.

Do not change mobile URLs, Supabase Auth, RLS, or application login logic before TCP 443 is proven connected.

## K. What Must Not Be Changed

- Expo login/session logic.
- Supabase Bearer token handling.
- SecureStore/AsyncStorage session persistence.
- Supabase schema.
- RLS policies.
- RPC functions.
- `DATABASE_URL`.
- Production database or migrations.
- Service-role credentials.
- Secrets values.
- TLS verification.
- Mock/fallback authentication.
- Booking, availability, session, or unrelated business flows.
- Firewall rules at random without listener/provider evidence.

## L. Steps That Prove Success

Do not announce success until all steps pass in order:

### Step 1 — Network

```text
Replit → 72.61.23.237:443 = TCP CONNECTED
```

### Step 2 — TLS/HTTP

```text
Replit → https://ajyalalmaerifa.com/auth/v1/health = HTTP response
```

TLS must validate normally; do not bypass certificate verification.

### Step 3 — Supabase Auth

Using the existing authenticated runtime request, without printing the token:

```text
/auth/v1/user = successful authenticated response
```

### Step 4 — API authentication

```text
Expo Bearer → Replit API /api/me = HTTP 200
```

### Step 5 — Profile and role

The `200` response must contain the real Supabase profile and a resolved role. No decoded-claims-only or mock response qualifies.

### Step 6 — Mobile bootstrap

The app must leave the “تعذر التحقق من الحساب” state and load the real student/teacher dashboard.

## Current Status

```text
NETWORK:     PARTIAL — public egress works, VPS destination blocked
DNS:         PASS
IPv4:        PASS for resolution, TCP destination blocked
IPv6:        NOT USED / no AAAA observed
PROXY:       NOT CONFIGURED
VPS ACCESS:  BLOCKED from Replit
API:         PARTIAL — local health passes
SUPABASE:    BLOCKED from API
AUTH:        BLOCKED downstream of TCP
MOBILE:      BLOCKED during profile bootstrap
PRODUCTION:  BLOCKED
```

## Final Required Action

The next decision must be made from VPS/Hostinger evidence:

```text
Is 72.61.23.237:443 publicly listening and reachable from an independent external network?
```

- If **no**, fix the VPS/provider listener or routing.
- If **yes**, inspect destination-specific filtering or use a verified fixed-egress/private route.
- Only after TCP becomes connected should the API/Supabase/Auth stages be tested.

No project-side code change is warranted before that proof.
