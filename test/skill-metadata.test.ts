import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Client } from '../server/hub.ts';
import { SkillRoom } from '../server/skilltest/room.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import type { SkillServerMsg } from '../shared/skilltest.ts';

test('skill room keeps rename and current profile level in authoritative peer metadata', () => {
  const messages: Extract<SkillServerMsg, { t: 'skill_state' }>[] = [];
  const profile = { id: 7, nick: 'First', level: 5 };
  const client = { profile, pid: 7, get nick() { return profile.nick; }, sink: { sendJson: (m: SkillServerMsg) => { if (m.t === 'skill_state') messages.push(m); } } } as unknown as Client;
  const room = new SkillRoom({ outfitOf: () => DEFAULT_OUTFIT });
  assert.equal(room.join(client), true); assert.equal(messages[0].peers[0].level, 5);
  profile.nick = 'Renamed'; profile.level = 16; room.onRename(client);
  for (let i = 0; i < 6; i++) room.step();
  assert.equal(messages.at(-1)!.peers[0].nick, 'Renamed'); assert.equal(messages.at(-1)!.peers[0].level, 16);
  assert.equal(room.status().names[0], 'Renamed');
});
