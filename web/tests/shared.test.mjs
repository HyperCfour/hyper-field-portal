// node --test. No network. Checks the pure helpers the browser and the server share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTickets, fmtPhone, isWholeSite, nzMobile, shortName } from '../lib/shared.mjs';

const site = { id: 's1', name: 'Mobil Bealey Ave' };
const screens = [
  { id: '1', code: 'MM009', device: 'Mobil Bealey -Menu Board 1', lifecycle: 'Live', site: 's1' },
  { id: '2', code: 'ME009', device: 'Mobil Bealey Ave - Entrance Screen', lifecycle: 'Live', site: 's1' },
  { id: '3', code: 'PT122', device: 'Mobil Bealey Ave - Pump Top 1/2', lifecycle: 'Out of rotation', site: 's1' },
  { id: '9', code: 'MM001', device: 'Mobil 10th Ave - Menu Board 1', lifecycle: 'Live', site: 's2' },
];
const live = screens.filter(s => s.site === 's1' && s.lifecycle === 'Live');
const tech = { name: 'Sam Tech', phone: '+64211234567' };
const form = { symptoms: ['1', '3'], checks: ['2', '3', '4', '5'], notes: 'No network light.', job: 'CJ-1001', photos: ['data:x'] };

test('nzMobile accepts NZ mobiles in common forms and rejects the rest', () => {
  for (const [i, o] of [
    ['021 123 4567', '+64211234567'], ['0211234567', '+64211234567'], ['+64 21 123 4567', '+64211234567'],
    ['64211234567', '+64211234567'], ['(027) 555-1234', '+64275551234'],
    ['+64 (0)21 123 4567', '+64211234567'], ['+64 021 123 4567', '+64211234567'], ['0064 21 123 4567', '+64211234567'],
    ['09 123 4567', null], ['0211', null], ['', null], ['+61 412 345 678', null],
  ]) assert.equal(nzMobile(i), o, i);
  assert.equal(fmtPhone('+64211234567'), '+64 21 123 4567');
});

test('shortName strips the site prefix, including abbreviated and unspaced forms', () => {
  assert.deepEqual(screens.map(shortName), ['Menu Board 1', 'Entrance Screen', 'Pump Top 1/2', 'Menu Board 1']);
  assert.equal(shortName({ device: '', code: 'X1' }), 'X1');
});

test('whole site needs every live screen and at least two of them', () => {
  assert.equal(isWholeSite(site, live, screens), true);
  assert.equal(isWholeSite(site, live.slice(0, 1), screens), false);
  assert.equal(isWholeSite(site, [...live, screens[2]], screens), true, 'adding a switched-off screen does not break it');
  assert.equal(isWholeSite({ id: 's2' }, [screens[3]], screens), false, 'single-screen site is never whole-site');
});

test('buildTickets: one P1 ticket per screen for a whole site, photos on the first', () => {
  const t = buildTickets({ site, picked: live, form, tech, screens });
  assert.equal(t.length, 2);
  assert.ok(t.every(k => k.cols.priority.label === 'P1 Critical'));
  assert.equal(t[0].cols.description.text, 'Whole site affected: all 2 screens reported in one submission.\nNo network light.');
  assert.equal(t[1].cols.description.text, 'Whole site affected: all 2 screens reported in one submission.\nPhotos attached to Mobil Bealey -Menu Board 1.\nNo network light.');
  assert.deepEqual(t[0].cols.prechecks.ids, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(t[0].cols.t_screen.item_ids, [1]);
  assert.equal(t[0].cols.screen_ref, 'MM009');
  assert.equal(t[0].name, 'Mobil Bealey -Menu Board 1');
  assert.equal(t[0].cols.partner_ref, 'CJ-1001');
  assert.equal(t[0].cols.net_ref.label, 'Mobil');
  assert.deepEqual(t[0].cols.symptom.ids, [1, 3]);
  assert.equal('parent_tkt' in t[0].cols, false);
});

test('buildTickets: single P2 ticket, no job, no photos, duplicate link set', () => {
  const related = { '1': { id: '555', name: 'Mobil Bealey -Menu Board 1' } };
  const t = buildTickets({ site, picked: live.slice(0, 1), form: { ...form, job: '', photos: [] }, tech, screens, related });
  assert.equal(t.length, 1);
  assert.equal(t[0].cols.priority.label, 'P2 High');
  assert.deepEqual(t[0].cols.prechecks.ids, [1, 2, 3, 4, 5]);
  assert.equal('partner_ref' in t[0].cols, false);
  assert.deepEqual(t[0].cols.parent_tkt, { item_ids: [555] });
  assert.equal(t[0].cols.description.text, 'Possible duplicate of Mobil Bealey -Menu Board 1.\nNo network light.');
});

test('buildTickets: two of three screens is P2 and names the other screen', () => {
  const t = buildTickets({ site, picked: [live[0], screens[2]], form: { ...form, photos: [] }, tech, screens });
  assert.equal(t[0].cols.priority.label, 'P2 High');
  assert.equal(t[0].cols.description.text, 'Reported with PT122 in the same submission.\nNo network light.');
  assert.equal(t[1].cols.description.text, 'Reported with MM009 in the same submission.\nNo network light.');
});
