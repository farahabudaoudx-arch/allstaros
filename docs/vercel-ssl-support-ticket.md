# Vercel Support Ticket — Intermittent ERR_SSL_PROTOCOL_ERROR on app.allstarlifegroup.com

**Subject:** Intermittent TLS handshake failures (ERR_SSL_PROTOCOL_ERROR) for residential users on new 216.150.x edge network — matches community threads 41919 / 41776 / 46399

**Project:** all-star-agency (team: nicholasverges-projects)
**Domain:** app.allstarlifegroup.com
**Severity:** Production-impacting. Live app, ~100+ active users, multiple users unable to log in.

---

## Summary

A meaningful fraction of our end users intermittently receive Chrome's
"This site can't provide a secure connection / app.allstarlifegroup.com sent an invalid response / **ERR_SSL_PROTOCOL_ERROR**"
on our production domain. Affected users are on Windows and Mac desktops across many different cities, ISPs, and networks. We (the owners) cannot reproduce it from our own vantage point.

**Key isolation result:** on an affected user's machine, the site **fails on their home Wi-Fi and works immediately over a phone hotspot, same computer, same browser**. This rules out the device, browser, OS, and certificate trust store, and isolates the failure to the network path between certain residential ISPs and your edge.

## Evidence that our configuration is correct

- Domain is attached to the project; DNS is a single clean CNAME:
  `app.allstarlifegroup.com → 49f0bd673ff6a879.vercel-dns-017.com`
- Certificate: Let's Encrypt, CN=app.allstarlifegroup.com, valid Jun 6 2026 → Sep 4 2026, served identically from every edge IP we can reach.
- We hand-tested TLS handshakes (openssl s_client, SNI set) repeatedly against **all four** edge IPs your DNS steers to from different resolvers: `216.150.1.1`, `216.150.16.1`, `216.150.1.193`, `216.150.16.193`. 12/12 handshakes clean: TLSv1.3, TLS_AES_128_GCM_SHA256, correct cert chain.
- TLS 1.2 and 1.3 both negotiate; HTTP/1.1 and HTTP/2 both return 200.
- No AAAA records, no DNS HTTPS/SVCB record, no alt-svc header → QUIC/HTTP3 and ECH are not in play.
- Noted: your authoritative DNS returns **different edge IPs to different resolvers** (8.8.8.8 → .1/.16.1; 1.1.1.1 → .1.193/.16.193), so different users land on different edge infrastructure. Failures are consistent with a POP/path-dependent fault we cannot observe from our own (iad1-routed) vantage.

## This matches an existing pattern on the new edge network

The fingerprint (scattered residential desktop users, ~5–10%, valid certs, owner cannot repro, cellular/hotspot works while home Wi-Fi fails) is identical to these open community reports from May–July 2026:

- https://community.vercel.com/t/vercel-support-is-not-responding-urgent-intermittent-tls-handshake-failures-on-pro-account/41919
- https://community.vercel.com/t/tls-handshake-aborts-at-5-bytes-from-residential-isps-but-works-from-datacenters/41776
- https://community.vercel.com/t/intermittent-tls-handshake-failure-tlsv1-alert-protocol-version-on-anycast-ip-216-198-79-x/46399

## What we're asking for

1. Audit certificate/TLS-config propagation for `app.allstarlifegroup.com` across **all POPs** on the 216.150.x anycast range, not just a spot check.
2. If a POP-level inconsistency is found, fix or drain the affected POPs.
3. As an immediate mitigation, move our domain to a different edge IP set if possible.
4. If you need a client-side capture, tell us exactly what to collect and we will get it from an affected user (we can provide `nslookup` + `curl -v` output or a `chrome://net-export` log from a failing machine on the failing network).

## Attachments

- End-user screenshot of the error page (ERR_SSL_PROTOCOL_ERROR).
- (Optional, on request) openssl s_client transcripts against all four edge IPs.
