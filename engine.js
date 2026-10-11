// Fictional fixtures only. This engine has no network, booking or payment capability.
const ROUTES = Object.freeze([
  Object.freeze({ id: 'bus', label: 'Express bus', mode: 'bus', durationMinutes: 35, costCents: 1400 }),
  Object.freeze({ id: 'train', label: 'Replacement train', mode: 'train', durationMinutes: 45, costCents: 900 }),
  Object.freeze({ id: 'taxi', label: 'Taxi', mode: 'taxi', durationMinutes: 25, costCents: 6400 }),
]);
const MAX_BUDGET_CENTS = 10_000_000;
const copyRoute = (route) => ({ ...route });
const validBudget = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_BUDGET_CENTS;
const validDeadline = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 1440;
const trace = (tool, input, output) => ({ tool, input, output, simulated: true });
const appendTrace = (previous, next) => [...previous, ...next].slice(-30);

export function createInitialState() {
  return {
    phase: 'idle',
    constraints: { budgetCents: 2000, deadlineMinutes: 50 },
    blockedRouteIds: [],
    selectedRoute: null,
    feasibleAlternatives: [],
    infeasibleReasons: [],
    warnings: [],
    toolTrace: [],
    confirmed: false,
    confirmation: null,
    fixtureSource: 'fictional',
    externalActionsPerformed: false,
  };
}

export function buildPlan(state) {
  const { budgetCents, deadlineMinutes } = state.constraints;
  if (!validBudget(budgetCents) || !validDeadline(deadlineMinutes)) {
    throw new TypeError('Invalid planning constraints.');
  }
  const blocked = new Set(state.blockedRouteIds);
  const infeasibleReasons = [];
  const feasible = ROUTES.filter((route) => {
    const reasons = [];
    if (blocked.has(route.id)) reasons.push({ code: 'blocked', message: 'Route is unavailable in this simulation.' });
    if (route.costCents > budgetCents) reasons.push({ code: 'budget', message: `Costs €${(route.costCents / 100).toFixed(2)}, above the budget.` });
    if (route.durationMinutes > deadlineMinutes) reasons.push({ code: 'deadline', message: `Needs ${route.durationMinutes} minutes, past the deadline.` });
    infeasibleReasons.push(...reasons.map((reason) => ({ routeId: route.id, ...reason })));
    return reasons.length === 0;
  }).sort((a, b) => a.durationMinutes - b.durationMinutes || a.costCents - b.costCents);
  return {
    selectedRoute: feasible.length ? copyRoute(feasible[0]) : null,
    feasibleAlternatives: feasible.slice(1).map(copyRoute),
    infeasibleReasons,
    warnings: feasible.length ? [] : ['No route meets both constraints. Adjust the budget or deadline.'],
  };
}

function replan(state, changes = {}) {
  const next = { ...state, ...changes, confirmed: false, confirmation: null };
  const plan = buildPlan(next);
  const route = plan.selectedRoute;
  const planningTrace = [
    trace('calendar.read', { deadlineMinutes: next.constraints.deadlineMinutes }, { meeting: 'Fictional Utrecht appointment', minutesAvailable: next.constraints.deadlineMinutes }),
    trace('transit.lookup', { from: 'Amsterdam', to: 'Utrecht', budgetCents: next.constraints.budgetCents, blockedRouteIds: [...next.blockedRouteIds] }, { routes: ROUTES.map(copyRoute), selectedRouteId: route?.id ?? null }),
    trace('household.prepare', { routeId: route?.id ?? null }, { draft: route ? `Proposed ${route.label.toLowerCase()}, arriving in ${route.durationMinutes} minutes. Awaiting your confirmation.` : 'No feasible route; nothing scheduled or sent.' }),
  ];
  return {
    ...next,
    ...plan,
    phase: route ? 'proposed' : 'infeasible',
    toolTrace: appendTrace(state.toolTrace, planningTrace),
    fixtureSource: 'fictional',
    externalActionsPerformed: false,
  };
}

const invalid = (state, message) => ({ ...state, warnings: [message] });

export function reduce(state, action) {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
    return invalid(state, 'Invalid action.');
  }
  switch (action.type) {
    case 'RESET':
      return createInitialState();
    case 'START':
      return replan(state);
    case 'SET_BUDGET': {
      const amount = action.amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > MAX_BUDGET_CENTS / 100) {
        return invalid(state, 'Enter a finite euro amount.');
      }
      const cents = Math.round(amount * 100);
      if (!validBudget(cents) || Math.abs(amount * 100 - cents) > 1e-7) {
        return invalid(state, 'Budget must be €0–€100,000 with at most two decimal places.');
      }
      return replan(state, { constraints: { ...state.constraints, budgetCents: cents } });
    }
    case 'SET_DEADLINE':
      if (!validDeadline(action.minutes)) return invalid(state, 'Deadline must be 1–1440 whole minutes.');
      return replan(state, { constraints: { ...state.constraints, deadlineMinutes: action.minutes } });
    case 'BLOCK_ROUTE':
      if (!ROUTES.some((route) => route.id === action.id)) return invalid(state, 'Unknown route.');
      return replan(state, { blockedRouteIds: [...new Set([...state.blockedRouteIds, action.id])] });
    case 'CONFIRM': {
      if (state.phase === 'idle') return invalid(state, 'Start the simulation before confirming.');
      const plan = buildPlan(state);
      if (!plan.selectedRoute) return replan(state);
      const route = plan.selectedRoute;
      if (state.confirmed && state.confirmation?.routeId === route.id) return state;
      const summary = `Mock ${route.label.toLowerCase()} reservation, calendar update and household message recorded. No real actions performed.`;
      return {
        ...state,
        ...plan,
        phase: 'confirmed',
        confirmed: true,
        confirmation: { routeId: route.id, summary },
        toolTrace: appendTrace(state.toolTrace, [
          trace('transit.reserve_mock', { routeId: route.id, costCents: route.costCents }, { status: 'recorded_only', bookingCreated: false }),
          trace('calendar.update_mock', { arrivalInMinutes: route.durationMinutes }, { status: 'recorded_only', calendarChanged: false }),
          trace('household.notify_mock', { message: `Simulation: arriving in ${route.durationMinutes} minutes via ${route.label.toLowerCase()}.` }, { status: 'recorded_only', messageSent: false }),
        ]),
        externalActionsPerformed: false,
      };
    }
    default:
      return invalid(state, 'Unknown action.');
  }
}
