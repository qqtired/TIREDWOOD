// Controlled TURN allocation/permission checks; no microphone, peer probes or SDP.
// Run with Node --env-file=/private/voice.env check-relay.mjs.
// Secrets and addresses stay in process memory; output is aggregate pass/fail only.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import dgram from 'node:dgram';
import net from 'node:net';

const cookie = 0x2112a442;
let stage = 'configuration';
const assert = (ok, label) => { if (!ok) throw new Error(label); };
const attribute = (type, value) => {
  const b = Buffer.alloc(4 + Math.ceil(value.length / 4) * 4);
  b.writeUInt16BE(type); b.writeUInt16BE(value.length, 2); value.copy(b, 4); return b;
};
const integer = value => { const b = Buffer.alloc(4); b.writeUInt32BE(value); return b; };
function message(type, attributes, auth) {
  const id = randomBytes(12), body = Buffer.concat(attributes.map(a => typeof a === 'function' ? a(id) : a)), head = Buffer.alloc(20);
  head.writeUInt16BE(type); head.writeUInt16BE(body.length + (auth ? 24 : 0), 2);
  head.writeUInt32BE(cookie, 4); id.copy(head, 8);
  const unsigned = Buffer.concat([head, body]);
  const bytes = auth ? Buffer.concat([unsigned, attribute(8, createHmac('sha1', auth).update(unsigned).digest())]) : unsigned;
  return { bytes, id: id.toString('hex') };
}
function decode(bytes) {
  assert(bytes.length >= 20 && bytes.readUInt32BE(4) === cookie, 'invalid-response');
  const attrs = new Map();
  for (let p = 20; p + 4 <= bytes.length;) {
    const type = bytes.readUInt16BE(p), len = bytes.readUInt16BE(p + 2);
    assert(p + 4 + len <= bytes.length, 'truncated-response');
    attrs.set(type, bytes.subarray(p + 4, p + 4 + len)); p += 4 + Math.ceil(len / 4) * 4;
  }
  const error = attrs.get(9);
  return { type: bytes.readUInt16BE(0), attrs, code: error ? error[2] * 100 + error[3] : 0 };
}
async function channel(host, port, transport) {
  const pending = new Map(); let dataWaiter;
  const accept = bytes => {
    if (bytes.length < 20) return;
    if (bytes.readUInt16BE(0) === 0x17 && dataWaiter) {
      const payload = decode(bytes).attrs.get(0x13);
      if (payload?.equals(dataWaiter.expected)) { clearTimeout(dataWaiter.timer); dataWaiter.resolve(); dataWaiter = undefined; }
      return;
    }
    const p = pending.get(bytes.subarray(8, 20).toString('hex'));
    if (p) { clearTimeout(p.timer); clearInterval(p.retry); pending.delete(p.id); p.resolve(decode(bytes)); }
  };
  const fail = () => { for (const p of pending.values()) { clearTimeout(p.timer); clearInterval(p.retry); p.reject(new Error('socket-error')); } pending.clear(); };
  let socket;
  if (transport === 'udp') {
    socket = dgram.createSocket('udp4'); socket.on('message', accept); socket.on('error', fail);
    await new Promise(resolve => socket.bind(0, '0.0.0.0', resolve));
  } else {
    socket = net.createConnection({ host, port }); let buffered = Buffer.alloc(0);
    socket.on('data', data => {
      buffered = Buffer.concat([buffered, data]);
      while (buffered.length >= 20 && buffered.length >= 20 + buffered.readUInt16BE(2)) {
        const length = 20 + buffered.readUInt16BE(2); accept(buffered.subarray(0, length)); buffered = buffered.subarray(length);
      }
    });
    socket.on('error', fail);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', () => reject(new Error('connect-error'))); });
  }
  return {
    expectData(expected) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { dataWaiter = undefined; reject(new Error('relay-data-timeout')); }, 5000);
        dataWaiter = { expected, timer, resolve, reject };
      });
    },
    indicate(peer, payload) {
      const m = message(0x16, [peer, attribute(0x13, payload)]);
      if (transport === 'udp') socket.send(m.bytes, port, host); else socket.write(m.bytes);
    },
    request(type, attrs, auth) {
      const m = message(type, attrs, auth);
      return new Promise((resolve, reject) => {
        const send = () => { if (transport === 'udp') socket.send(m.bytes, port, host); else socket.write(m.bytes); };
        const retry = transport === 'udp' ? setInterval(send, 500) : undefined;
        const timer = setTimeout(() => { clearInterval(retry); pending.delete(m.id); reject(new Error('timeout')); }, 5000);
        pending.set(m.id, { id: m.id, timer, retry, resolve, reject }); send();
      });
    },
    close() { fail(); if (dataWaiter) { clearTimeout(dataWaiter.timer); dataWaiter.reject(new Error('socket-error')); dataWaiter = undefined; } if (transport === 'udp') socket.close(); else socket.destroy(); },
  };
}
function xorPeer(ip, port = 9) {
  const b = Buffer.alloc(8); b[1] = 1; b.writeUInt16BE(port ^ (cookie >>> 16), 2);
  const octets = ip.split('.').map(Number); const mask = integer(cookie);
  for (let i = 0; i < 4; i++) b[4 + i] = octets[i] ^ mask[i];
  return attribute(0x12, b);
}
function xorMappedPeer(ip, port = 9) {
  return transaction => {
    const b = Buffer.alloc(20), address = Buffer.alloc(16), mask = Buffer.concat([integer(cookie), transaction]);
    b[1] = 2; b.writeUInt16BE(port ^ (cookie >>> 16), 2); address[10] = 255; address[11] = 255;
    ip.split('.').map(Number).forEach((octet, i) => { address[12 + i] = octet; });
    for (let i = 0; i < 16; i++) b[4 + i] = address[i] ^ mask[i];
    return attribute(0x12, b);
  };
}
const requiredTransport = attribute(0x19, Buffer.from([17, 0, 0, 0]));
async function check(host, port, transport, secret) {
  const io = await channel(host, port, transport), result = { transport };
  try {
    stage = `${transport}:challenge`;
    const challenge = await io.request(3, [requiredTransport]);
    assert(challenge.code === 401, 'unauthenticated-allocation-not-denied'); result.unauthenticatedDenied = true;
    const realm = challenge.attrs.get(0x14), nonce = challenge.attrs.get(0x15);
    assert(realm && nonce, 'missing-challenge');
    function authFor(expiry, wrong = false, authChallenge = challenge) {
      const realm = authChallenge.attrs.get(0x14), nonce = authChallenge.attrs.get(0x15);
      assert(realm && nonce, 'missing-challenge');
      const username = `${expiry}:${randomBytes(12).toString('hex')}`;
      const password = createHmac('sha1', wrong ? randomBytes(32) : secret).update(username).digest('base64');
      const key = createHash('md5').update(`${username}:${realm.toString()}:${password}`).digest();
      return { attrs: [attribute(6, Buffer.from(username)), attribute(0x14, realm), attribute(0x15, nonce)], key };
    }
    const future = Math.floor(Date.now() / 1000) + 120;
    stage = `${transport}:allocate`; const valid = authFor(future);
    const allocation = await io.request(3, [requiredTransport, ...valid.attrs], valid.key);
    assert(allocation.type === 0x103 && allocation.code === 0, 'authenticated-allocation-failed');
    const relay = allocation.attrs.get(0x16); assert(relay && relay[1] === 1, 'missing-ipv4-relay');
    const relayPort = relay.readUInt16BE(2) ^ (cookie >>> 16);
    assert(relayPort >= 49160 && relayPort <= 50183, 'relay-outside-approved-range'); result.authenticatedAllocation = true; result.relayPortInApprovedRange = true;
    const mask = integer(cookie), relayIP = [...relay.subarray(4, 8)].map((b, i) => b ^ mask[i]).join('.');
    stage = `${transport}:permission-public`;
    assert((await io.request(8, [xorPeer(relayIP, relayPort), ...valid.attrs], valid.key)).type === 0x108, 'public-peer-permission-denied');
    result.publicPeerPermissionAllowed = true;
    const second = await channel(host, port, transport);
    try {
      stage = `${transport}:second-allocation`;
      const challengeB = await second.request(3, [requiredTransport]);
      const authB = authFor(future, false, challengeB);
      const allocationB = await second.request(3, [requiredTransport, ...authB.attrs], authB.key);
      assert(allocationB.type === 0x103, 'second-allocation-failed');
      const relayB = allocationB.attrs.get(0x16); assert(relayB?.[1] === 1, 'second-ipv4-relay-missing');
      const peerB = xorPeer([...relayB.subarray(4, 8)].map((b, i) => b ^ mask[i]).join('.'), relayB.readUInt16BE(2) ^ (cookie >>> 16));
      const peerA = xorPeer(relayIP, relayPort);
      stage = `${transport}:pair-permissions`;
      assert((await io.request(8, [peerB, ...valid.attrs], valid.key)).type === 0x108, 'first-peer-permission-failed');
      assert((await second.request(8, [peerA, ...authB.attrs], authB.key)).type === 0x108, 'second-peer-permission-failed');
      stage = `${transport}:data-a-to-b`; const payloadA = randomBytes(32), receivedB = second.expectData(payloadA); io.indicate(peerB, payloadA); await receivedB;
      stage = `${transport}:data-b-to-a`; const payloadB = randomBytes(32), receivedA = io.expectData(payloadB); second.indicate(peerA, payloadB); await receivedA;
      result.bidirectionalPairData = true;
      assert((await second.request(4, [attribute(0x0d, integer(0)), ...authB.attrs], authB.key)).type === 0x104, 'second-deallocation-failed');
    } finally { second.close(); }
    let denied = 0;
    for (const [name, ip] of [['loopback', '127.0.0.1'], ['private', '10.0.0.1'], ['link-local', '169.254.0.1'], ['multicast', '224.0.0.1']]) {
      stage = `${transport}:permission-${name}`;
      assert((await io.request(8, [xorPeer(ip), ...valid.attrs], valid.key)).code === 403, `permission-${name}-not-denied`); denied++;
    }
    result.protectedPermissionDenials = denied;
    result.mappedPrivatePermissionCodes = [];
    for (const [name, ip] of [['loopback', '127.0.0.1'], ['private', '10.0.0.1']]) {
      stage = `${transport}:permission-mapped-${name}`;
      const r = await io.request(8, [xorMappedPeer(ip), ...valid.attrs], valid.key);
      assert(r.code === 403 || r.code === 443, 'mapped-private-peer-not-denied');
      result.mappedPrivatePermissionCodes.push(r.code);
    }
    stage = `${transport}:deallocate`;
    assert((await io.request(4, [attribute(0x0d, integer(0)), ...valid.attrs], valid.key)).type === 0x104, 'deallocation-failed');
    result.deallocated = true;
    // Negative credentials use independent sockets/nonces; rejection may close
    // or silently discard an invalid session instead of returning an error.
    for (const invalid of ['bad', 'expired']) {
      stage = `${transport}:${invalid}-auth`;
      const negative = await channel(host, port, transport);
      try {
        const c = await negative.request(3, [requiredTransport]);
        assert(c.code === 401, 'negative-challenge-failed');
        const auth = authFor(invalid === 'expired' ? Math.floor(Date.now() / 1000) - 120 : future, invalid === 'bad', c);
        let rejected = false;
        try { rejected = (await negative.request(3, [requiredTransport, ...auth.attrs], auth.key)).code === 401; }
        catch (error) { rejected = error.message === 'timeout' || error.message === 'socket-error'; }
        assert(rejected, 'invalid-credential-not-denied');
        result[invalid === 'bad' ? 'badCredentialDenied' : 'expiredCredentialDenied'] = true;
      } finally { negative.close(); }
    }
    return result;
  } finally { io.close(); }
}
try {
  const secret = process.env.VOICE_TURN_SECRET;
  assert(secret && secret.length >= 16, 'missing-secret');
  const urls = (process.env.VOICE_TURN_URLS ?? '').split(/[\s,]+/).filter(Boolean);
  const results = [];
  for (const uri of urls) {
    const match = /^turn:([A-Za-z0-9.-]+):(\d+)\?transport=(udp|tcp)$/.exec(uri);
    assert(match, 'unsupported-test-url');
    results.push(await check(match[1], Number(match[2]), match[3], secret));
  }
  assert(results.length === 2 && results.some(r => r.transport === 'udp') && results.some(r => r.transport === 'tcp'), 'both-transports-required');
  console.log(JSON.stringify({ ok: true, results }));
} catch (error) {
  const reason = /^[a-z-]+$/.test(error?.message ?? '') ? error.message : 'unexpected-error';
  console.log(JSON.stringify({ ok: false, failedStage: stage, reason })); process.exitCode = 1;
}
