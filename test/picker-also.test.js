import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, ROLE_GROUPS, ROLE_BY_ID, pickerEntries, groupAlsoText } from '../public/js/roles.js';

const nm = (id) => ROLE_BY_ID[id].name;

test('Drunk entry names its other roles, no variant count', () => {
  const e = pickerEntries(ROLES).find((x) => x.group?.id === 'drunk');
  assert.equal(groupAlsoText(e), 'Also: Hooker, Collaborator');
});

test('every group, every team filter: the line lists exactly the other roles the entry opens to', () => {
  for (const team of ['all', 'town', 'mafia', 'third']) {
    const list = team === 'all' ? ROLES : ROLES.filter((r) => r.alignment === team);
    for (const e of pickerEntries(list).filter((x) => x.group && x.variants.length > 1)) {
      const txt = groupAlsoText(e);
      assert.doesNotMatch(txt, /variant/i);
      const names = e.variants.map((v) => nm(v.id)).filter((n) => n !== e.group.name);
      assert.equal(txt.replace(/^Also: /, ''), names.join(', '), `${team}/${e.group.id}`);
      assert.equal(names.length, e.variants.length - (e.variants.some((v) => nm(v.id) === e.group.name) ? 1 : 0));
    }
  }
  // Under All, each group opens to every role it lists.
  for (const g of ROLE_GROUPS) assert.equal(pickerEntries(ROLES).find((x) => x.group?.id === g.id).variants.length, g.ids.length, g.id);
});
