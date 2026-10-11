import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, buildPlan } from './engine.js';

const start = () => reduce(createInitialState(), { type: 'START' });
const freezeDeep = (object) => {
  Object.freeze(object);
  for (const value of Object.values(object)) if (value && typeof value === 'object') freezeDeep(value);
  return object;
};

test('default fastest feasible route leaves the cheaper train alternative', () => {
  const state = start();
  assert.equal(state.phase, 'proposed');
  assert.equal(state.selectedRoute.id, 'bus');
  assert.equal(state.selectedRoute.costCents, 1400);
  assert.deepEqual(state.feasibleAlternatives.map((route) => route.id), ['train']);
  assert.equal(state.toolTrace.length, 3);
  assert.equal(state.fixtureSource, 'fictional');
  assert.equal(state.externalActionsPerformed, false);
});

test('lowering the budget replans to the train and preserves exact cents', () => {
  const state = reduce(start(), { type: 'SET_BUDGET', amount: 9.01 });
  assert.equal(state.constraints.budgetCents, 901);
  assert.equal(state.selectedRoute.id, 'train');
  assert.ok(state.infeasibleReasons.some((reason) => reason.routeId === 'bus' && reason.code === 'budget'));
});

test('tight deadline requires both enough time and budget', () => {
  let state = reduce(start(), { type: 'SET_DEADLINE', minutes: 30 });
  assert.equal(state.phase, 'infeasible');
  assert.equal(state.selectedRoute, null);
  state = reduce(state, { type: 'SET_BUDGET', amount: 64 });
  assert.equal(state.selectedRoute.id, 'taxi');
  assert.deepEqual(state.feasibleAlternatives, []);
});

test('boundaries are inclusive', () => {
  let state = reduce(start(), { type: 'SET_BUDGET', amount: 9 });
  state = reduce(state, { type: 'SET_DEADLINE', minutes: 45 });
  assert.equal(state.selectedRoute.id, 'train');
  state = reduce(state, { type: 'SET_DEADLINE', minutes: 44 });
  assert.equal(state.selectedRoute, null);
});

test('unavailable preferred route triggers replacement automatically', () => {
  const state = reduce(start(), { type: 'BLOCK_ROUTE', id: 'bus' });
  assert.equal(state.selectedRoute.id, 'train');
  assert.deepEqual(state.blockedRouteIds, ['bus']);
  assert.ok(state.infeasibleReasons.some((reason) => reason.code === 'blocked' && reason.routeId === 'bus'));
});

test('all blocked routes give reasons and cannot be confirmed', () => {
  const state = ['bus', 'train', 'taxi'].reduce((previous, id) => reduce(previous, { type: 'BLOCK_ROUTE', id }), start());
  const confirmed = reduce(state, { type: 'CONFIRM' });
  assert.equal(confirmed.phase, 'infeasible');
  assert.equal(confirmed.confirmed, false);
  assert.equal(confirmed.confirmation, null);
  assert.equal(confirmed.infeasibleReasons.filter((reason) => reason.code === 'blocked').length, 3);
  assert.ok(confirmed.toolTrace.every((entry) => !entry.tool.endsWith('_mock')));
});

test('confirmation records only mock actions and is idempotent', () => {
  const state = reduce(start(), { type: 'CONFIRM' });
  assert.equal(state.phase, 'confirmed');
  assert.equal(state.confirmation.routeId, 'bus');
  assert.equal(state.toolTrace.length, 6);
  assert.ok(state.toolTrace.every((entry) => entry.simulated === true));
  assert.deepEqual(state.toolTrace.slice(-3).map((entry) => entry.output.status), ['recorded_only', 'recorded_only', 'recorded_only']);
  assert.equal(state.externalActionsPerformed, false);
  assert.equal(reduce(state, { type: 'CONFIRM' }), state);
});

test('every valid constraint change invalidates prior confirmation', () => {
  const original = reduce(start(), { type: 'CONFIRM' });
  for (const action of [{ type: 'SET_BUDGET', amount: 9 }, { type: 'SET_DEADLINE', minutes: 40 }, { type: 'BLOCK_ROUTE', id: 'bus' }]) {
    const state = reduce(original, action);
    assert.equal(state.confirmed, false);
    assert.equal(state.confirmation, null);
    assert.equal(state.phase, 'proposed');
  }
});

test('making a confirmed plan infeasible clears stale confirmation', () => {
  const state = reduce(reduce(start(), { type: 'CONFIRM' }), { type: 'SET_BUDGET', amount: 0 });
  assert.equal(state.phase, 'infeasible');
  assert.equal(state.confirmed, false);
  assert.equal(state.selectedRoute, null);
  assert.equal(reduce(state, { type: 'CONFIRM' }).confirmed, false);
});

test('immutable transitions accept frozen state and never mutate fixture routes', () => {
  const state = freezeDeep(start());
  const snapshot = JSON.stringify(state);
  const next = reduce(state, { type: 'BLOCK_ROUTE', id: 'bus' });
  assert.equal(JSON.stringify(state), snapshot);
  assert.notEqual(next, state);
  next.selectedRoute.costCents = 1;
  assert.equal(buildPlan(state).feasibleAlternatives[0].costCents, 900);
});

test('malicious, coercible or out-of-range budgets cannot alter constraints', () => {
  for (const amount of [NaN, Infinity, -1, -1e-10, 100001, 0.001, '9', '<script>', {}, null]) {
    const state = reduce(start(), { type: 'SET_BUDGET', amount });
    assert.equal(state.constraints.budgetCents, 2000);
    assert.equal(state.selectedRoute.id, 'bus');
    assert.ok(state.warnings.length);
    assert.equal(state.externalActionsPerformed, false);
  }
});

test('malicious route and action inputs cannot inject tools or routes', () => {
  for (const action of [null, [], { type: '__proto__' }, { type: 'BLOCK_ROUTE', id: '__proto__' }, { type: 'BLOCK_ROUTE', id: '<script>alert(1)</script>' }, { type: 'BOOK_REAL', url: 'https://example.com' }]) {
    const state = reduce(start(), action);
    assert.deepEqual(state.blockedRouteIds, []);
    assert.equal(state.toolTrace.length, 3);
    assert.equal(state.externalActionsPerformed, false);
  }
});

test('deadline validation refuses coercion and unrealistic values', () => {
  for (const minutes of [0, -1, 1441, 30.5, '30', NaN, Infinity, null]) {
    const state = reduce(start(), { type: 'SET_DEADLINE', minutes });
    assert.equal(state.constraints.deadlineMinutes, 50);
    assert.ok(state.warnings.length);
  }
});

test('trace remains bounded and state survives JSON round trip', () => {
  let state = start();
  for (let i = 0; i < 20; i++) state = reduce(state, { type: 'SET_BUDGET', amount: i });
  assert.equal(state.toolTrace.length, 30);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('reset clears traces, constraints, blocks and confirmations', () => {
  const state = reduce(reduce(start(), { type: 'CONFIRM' }), { type: 'RESET' });
  assert.deepEqual(state, createInitialState());
  const idle = reduce(state, { type: 'CONFIRM' });
  assert.equal(idle.confirmed, false);
  assert.deepEqual(idle.toolTrace, []);
});
