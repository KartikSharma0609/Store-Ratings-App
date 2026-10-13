const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/validators');
const { listClauses } = require('../src/query');

test('name: 20 to 60 characters', () => {
  assert.equal(v.validName('a'.repeat(19)), false);
  assert.equal(v.validName('a'.repeat(20)), true);
  assert.equal(v.validName('a'.repeat(60)), true);
  assert.equal(v.validName('a'.repeat(61)), false);
  assert.equal(v.validName(undefined), false);
});

test('address: required, max 400', () => {
  assert.equal(v.validAddress('x'.repeat(400)), true);
  assert.equal(v.validAddress('x'.repeat(401)), false);
  assert.equal(v.validAddress('   '), false);
});

test('password: 8-16 chars, one uppercase, one special', () => {
  assert.equal(v.validPassword('Abcdef1!'), true);
  assert.equal(v.validPassword('Abcde1!'), false); // 7 chars
  assert.equal(v.validPassword('Abcdefghijklmn1!x'), false); // 17 chars
  assert.equal(v.validPassword('abcdefg1!'), false); // no uppercase
  assert.equal(v.validPassword('Abcdefg12'), false); // no special
  assert.equal(v.validPassword('Abcdefgh1!'.repeat(1)), true);
});

test('email: standard format', () => {
  assert.equal(v.validEmail('a@b.com'), true);
  for (const bad of ['a@b', 'a b@c.com', '@b.com', 'a@.com', 'plain', ''])
    assert.equal(v.validEmail(bad), false, bad);
});

test('rating: integer 1 to 5 only', () => {
  for (const ok of [1, 2, 3, 4, 5]) assert.equal(v.validRating(ok), true);
  for (const bad of [0, 6, 2.5, '3', null, NaN]) assert.equal(v.validRating(bad), false);
});

test('userError reports the first broken rule', () => {
  const good = { name: 'A'.repeat(20), email: 'a@b.com', address: 'Pune', password: 'Abcdef1!' };
  assert.equal(v.userError(good), null);
  assert.match(v.userError({ ...good, name: 'short' }), /Name/);
  assert.match(v.userError({ ...good, email: 'x' }), /email/);
  assert.match(v.userError({ ...good, address: '' }), /Address/);
  assert.match(v.userError({ ...good, password: 'weak' }), /Password/);
});

test('listClauses: filters are parameterised, sort is whitelisted', () => {
  const params = [];
  const sql = listClauses({ name: 'ab', role: 'USER', sort: 'email', order: 'desc' },
    ['name', 'email', 'address', 'role'], ['name', 'email'], params);
  assert.equal(sql, 'WHERE name ILIKE $1 AND role = $2 ORDER BY email DESC, id');
  assert.deepEqual(params, ['%ab%', 'USER']);
  const evil = listClauses({ sort: 'name; DROP TABLE users', order: 'asc' }, [], ['name'], []);
  assert.equal(evil, ' ORDER BY name ASC, id');
});
