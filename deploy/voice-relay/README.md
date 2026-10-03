# Voice relay: configuration and deployment notes

**Deployed after explicit approval on 2026-10-03:** [DEPLOYMENT-20261003.md](DEPLOYMENT-20261003.md) and [operational evidence](operational-evidence-20261003.json) record the pinned Linux service, full 960-allocation budget and fresh protocol checks. The historical preflight/proposal below is retained for its rationale; game activation and public browser acceptance belong to the lead release record.

**Current operator plan:** [PREFLIGHT.md](PREFLIGHT.md) records read-only production checks, the package-version blocker and the explicit single-room versus whole-game capacity decision. It supersedes the earlier generic distribution-install assumption below: do not install the observed old apt candidate blindly.

STUN-only configuration cannot guarantee voice between remote networks. TURN supplies a relay when a direct path is unavailable. A working synthetic local connection does not establish remote reachability. [WebRTC TURN guide](https://webrtc.org/getting-started/turn-server).

Initial inspection on 2026-10-03 found no `turnserver` binary or installed Homebrew coturn formula; Docker CLI existed but its daemon socket was absent. Subsequently authorized **local-only** installation added Homebrew coturn 4.18.0 and hiredis 1.4.1 and upgraded libevent to 2.1.13, with auto-update/cleanup disabled. No login service, Docker, public port, DNS, SSH or production change was made.

A temporary coturn process was started with fresh private 0600 config/environment files in a 0700 OS temporary directory. `lsof` verified only 127.0.0.1 TCP/UDP 5347 listeners, with 55000–55127 reserved as the test relay range. The test explicitly allows loopback peers; that exception must never enter the production configuration. Startup on 4.18.0 reports `no-cli` as deprecated; the running process exposes no CLI listener. The local next-start config uses `cli=0`; verify the distribution-version equivalent before installing the production candidate. Real browser relay acceptance is tracked separately by the lead; successful startup alone is not a media result.

## Proposed boundary

Use a dedicated coturn service on the existing VPS, **if** a read-only preflight confirms Debian/Ubuntu, an available supported coturn package and directly assigned public IPv4. Reuse the existing public game's DNS name only if its A record points directly to that VPS (not an HTTP-only proxy). This baseline needs no Nginx change and does not use a TLS private key.

| Traffic | Proposed inbound ports | Purpose |
|---|---|---|
| TURN client | UDP and TCP 3478 | Allocation and media transport to relay |
| TURN relay | UDP 49160–49287 | Bounded media allocation range |
| Optional TURN TLS | TCP 5349 | Requires separately reviewed certificate setup |

Confirm cloud and host firewalls, upstream NAT, outbound policy and billing limits before approving these ports. Under NAT, direct one-to-one relay-port mapping and the correct `external-ip=PUBLIC/LOCAL` mapping are required; the current template assumes **no NAT**. Do not use it unchanged under NAT. `no-tcp-relay` disables TCP peer allocations; the client TCP listener remains enabled. [coturn manual](https://github.com/coturn/coturn/wiki/turnserver).

## Resource and security choices

The approved template reserves 1024 UDP ports and limits allocations to 960 for up to eight rooms. Planning estimate per full room: 6 × 5 = 30 endpoint peer connections; gathering UDP/TCP candidates can double this, and a replacement generation can briefly double it again. Browser behavior and allocation reuse vary; this is reserved headroom, not measured six-client/eight-room capacity.

`max-bps=16000` is 16 KB/s per allocation direction, compared with this game's 32 kbit/s Opus target (4 KB/s before protocol overhead); `bps-capacity=15360000` caps aggregate allocation bandwidth. These are initial engineering budgets, not performance evidence. A six-person stress test must check packet loss, CPU, memory and reconnect behavior. Resource saturation must produce a visible voice failure, not an endless connecting state.

The configuration uses REST HMAC authentication, allocation quotas, private/loopback/link-local/multicast peer denials and a dedicated unprivileged service. No unauthenticated relay, static browser credential, CLI or broad permission exception is intended. The current template targets [coturn 4.18.0](https://github.com/coturn/coturn/releases/tag/4.18.0), using `cli=0` and leaving DTLS disabled by default, because that release removed the older negative flags. Linux build and service validation remain required.

Game `server/voice-config.ts` currently issues 12-hour credentials with random opaque usernames. A leaked temporary credential is usable until expiry; `user-quota` limits that username, not a game account, and a new join/refresh can issue another username. The global allocation/bandwidth caps remain important. TURN authenticates relay access, not game-room membership; malicious credential holders can relay to other permitted public peers. Keep application admission/rate limits and do not claim quotas prevent all abuse.

## Operator sequence after explicit infrastructure approval

1. Recheck the facts in PREFLIGHT.md and service-account availability immediately before deployment. Do not copy existing secret values into a transcript.
2. Prepare a pinned 4.18.0 Linux build and verify its security fixes, runtime libraries, startup and tests as described in PREFLIGHT.md. Install only the reviewed artifact under `/opt/game-opus-turn/4.18.0`; create `game-opus-turn` as a non-login system account. No distribution default coturn service should be installed or left listening.
3. Fill a private copy of `turnserver.conf.example`. Generate a new 32-byte random hex secret directly into root-owned files with restrictive modes, without terminal output, shell history interpolation or command-line arguments. A provisioning program can use `randomBytes(32).toString('hex')` in memory, write the same value as `static-auth-secret` in the relay config and `VOICE_TURN_SECRET` in a separate game environment file, and print only completion status. Do not reuse any unrelated key.
4. Relay config: `/etc/game-opus-turn/turnserver.conf`, root owner, `game-opus-turn` group, mode 0640, parent 0750. Game environment: `/etc/game-opus/voice.env`, root:root 0600. The system systemd manager can load that file for the game with an `EnvironmentFile=` drop-in; the game account need not read the relay config. Never run commands that print merged service environment.
5. Add `VOICE=1`, `VOICE_TURN_URLS=turn:HOST:3478?transport=udp,turn:HOST:3478?transport=tcp`, the generated `VOICE_TURN_SECRET`, and `VOICE_RELAY_ONLY=0` to the private game environment. Replace HOST locally with the verified FQDN. Preserve all existing flags and data paths. For acceptance, use relay-only on a separate test instance first.
6. Review the filled config without exposing values, validate the unit with `systemd-analyze verify`, start the relay under restrictive firewall scope where possible, and inspect startup errors/listeners privately. coturn parsing/startup has not been verified here. Do not assume a nonexistent config-test flag provides validation. Ensure no unexpected admin, alternative or wildcard listeners appeared.
7. Approve/apply the exact host and provider firewall rules, then perform the acceptance matrix below. Integrate the game environment only in the normal backed-up, authorized game release process; the relay does not require a profile/schema migration.

Rollback preparation: retain prior game unit/environment privately and keep port rules individually identifiable. Restore the previous voice configuration in an authorized restart and stop the relay if acceptance fails. This loses relay-backed voice; it does not require reverting profile data or unrelated game changes. Close only newly introduced rules after confirming their ownership.

## TLS and restrictive networks

UDP/TCP 3478 is a baseline, not universal reachability. For TLS, obtain a separate certificate/key for the already verified existing FQDN through its established ACME process, with a separate key readable only by the relay service; review renewal and safe reload/restart. Do not grant coturn access to an existing Nginx private key or widen ACME directory permissions blindly.

Remove `no-tls`, add `tls-listening-port=5349`, `cert=...` and `pkey=...`, keep DTLS disabled, and add `turns:HOST:5349?transport=tcp` only after TLS validation. Adding this third transport also changes allocation-headroom assumptions; remeasure and increase the quota/range only with an explicit budget. Some networks permit only TLS on TCP 443. Serving TURN there alongside existing HTTPS needs a separate public IP or a reviewed layer-4 multiplexing design; an HTTP Nginx location is insufficient. No such change is included here.

## Acceptance: no physical microphone required for automated transport proof

Use the actual game signaling/client path with a temporary test-only `getUserMedia` substitute supplying an `AudioContext` oscillator through `createMediaStreamDestination()`. Never ship that substitute. Keep oscillator monitoring disconnected from speakers. A synthetic tone proves transport/decoding, not microphone permission or human audibility.

For each browser connection, force `iceTransportPolicy: 'relay'` through the game's relay-only configuration and use a **fresh** credential issued by the test server. Do not rewrite SDP, substitute loopback ICE candidates or print credentials, SDP, addresses or candidate strings. Read `getStats()` privately and export only aggregate fields: connection state, selected local/remote candidate **type**, candidate protocol, relay protocol where supported, sent/received RTP packet deltas, codec MIME type, decoded sample delta and received audio-energy delta. A selected relay pair plus sustained bidirectional RTP/sample growth establishes real media relay; `connected` alone does not. The test may retain transient values in browser memory only.

| Case | Required evidence |
|---|---|
| UDP URL only, relay-only | Both peers select relay candidates; bidirectional Opus packet and decoded-sample growth |
| TCP URL only, relay-only | Same result with TURN client TCP; UDP peer relay remains necessary |
| TLS URL only, if configured | Certificate/name validation and same sustained bidirectional result |
| Bad/expired credential | No relay allocation; visible bounded failure and working retry with fresh credential |
| Private/loopback/multicast peer | Permission denied using controlled local test; no packets reach protected test listener |
| Six clients; ICE restart/rejoin | Every required pair connects, headroom holds, old allocations release, no stuck spinner |
| Remote networks | Desktop browsers on two distinct networks pass forced relay and ordinary ICE selection |
| User controls | PTT sends only while held, release silences, remote mute/volume work, mute does not alter game sound |

Stats semantics: [W3C WebRTC stats](https://www.w3.org/TR/webrtc-stats/). An actual private-address denial test needs controlled infrastructure; do not probe private services or cloud metadata endpoints. Local loopback relay tests require deliberately weakened test-only peer rules and **cannot validate the production policy**. The lead's local two-browser UDP/Opus evidence is linked in [PREFLIGHT.md](PREFLIGHT.md); the remaining matrix is an acceptance requirement, not a blanket PASS. Final human acceptance still needs two players hearing each other with real microphones/headphones and normal browser permissions.
