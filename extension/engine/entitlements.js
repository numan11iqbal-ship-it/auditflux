/**
 * AuditFlux SEO — entitlements, usage and billing.
 *
 * ============================ SECURITY NOTICE ============================
 * The local providers below are NOT a security boundary. The plan lives in
 * chrome.storage, which the user can edit. That is fine for what this build
 * is — the UI architecture that a real backend will plug into — but it must
 * never be described as production billing.
 *
 * When a backend exists, swap LocalEntitlementProvider for
 * ServerEntitlementProvider and LocalUsageProvider for ServerUsageProvider.
 * No UI code changes: every surface talks to the facade at the bottom of this
 * file, never to a provider directly. The server must then re-check every
 * limit itself, because a client-side check is a convenience, not a control.
 * =========================================================================
 */

/**
 * In the browser, config/plans.js is loaded first and defines these as script
 * globals. Under Node (tests) it is required. Aliased to distinct names so the
 * lexical global from plans.js is never shadowed or redeclared.
 */
const _sccPlansModule = (typeof SCC_PLANS === 'undefined' && typeof require !== 'undefined')
  ? require('../config/plans.js') : null;
const SCC_PLAN_DEFS = _sccPlansModule ? _sccPlansModule.SCC_PLANS : SCC_PLANS;
const SCC_LIMIT_UNLIMITED = _sccPlansModule ? _sccPlansModule.SCC_UNLIMITED : SCC_UNLIMITED;

const SCC_MODE = {
  // Flipped to 'production' when a real entitlement server is configured.
  current: 'development',
  isDevelopment() { return this.current === 'development'; },
  label: 'Development mode — plan selection is local and not secure'
};

/* ------------------------------- providers ------------------------------- */

/** Reads the plan. The local implementation trusts chrome.storage; a server one would not. */
class LocalEntitlementProvider {
  constructor(storage) { this.storage = storage; this.key = 'sccPlan'; }

  async getPlanId() {
    try {
      const r = await this.storage.get(this.key);
      const id = r?.[this.key];
      return SCC_PLAN_DEFS[id] ? id : 'free';
    } catch { return 'free'; }
  }

  /** Preview only. A server provider would have no equivalent — the server decides. */
  async setPlanId(planId) {
    if (!SCC_PLAN_DEFS[planId]) throw new Error('Unknown plan: ' + planId);
    await this.storage.set({ [this.key]: planId });
    return planId;
  }

  get isAuthoritative() { return false; }
}

/**
 * Placeholder for the real implementation. Deliberately throws rather than
 * silently falling back, so a half-configured build fails loudly instead of
 * quietly granting Pro to everyone.
 */
class ServerEntitlementProvider {
  constructor(apiBase) { this.apiBase = apiBase; }
  async getPlanId() {
    throw new Error('ServerEntitlementProvider is not implemented. Connect GET ' +
      this.apiBase + '/api/me/entitlements and return the plan from the verified subscription.');
  }
  get isAuthoritative() { return true; }
}

/** Counts real usage. Nothing here is simulated — every increment follows a real action. */
class LocalUsageProvider {
  constructor(storage) { this.storage = storage; this.key = 'sccUsage'; }

  static today() { return new Date().toISOString().slice(0, 10); }
  static month() { return new Date().toISOString().slice(0, 7); }

  async read() {
    let raw = {};
    try { raw = (await this.storage.get(this.key))?.[this.key] || {}; } catch {}
    const today = LocalUsageProvider.today();
    const month = LocalUsageProvider.month();
    // Counters roll over on their own period rather than being cleared wholesale.
    if (raw.day !== today) { raw.day = today; raw.daily = {}; }
    if (raw.month !== month) { raw.month = month; raw.monthly = {}; }
    raw.daily = raw.daily || {};
    raw.monthly = raw.monthly || {};
    return raw;
  }

  async get(counter, period) {
    const u = await this.read();
    return (period === 'monthly' ? u.monthly : u.daily)[counter] || 0;
  }

  async increment(counter, period, by) {
    const u = await this.read();
    const bucket = period === 'monthly' ? u.monthly : u.daily;
    bucket[counter] = (bucket[counter] || 0) + (by || 1);
    await this.storage.set({ [this.key]: u });
    return bucket[counter];
  }

  async reset() { await this.storage.set({ [this.key]: {} }); }
}

class ServerUsageProvider {
  constructor(apiBase) { this.apiBase = apiBase; }
  async get() { throw new Error('ServerUsageProvider is not implemented. Track usage server-side against the authenticated user.'); }
  async increment() { throw new Error('ServerUsageProvider is not implemented.'); }
}

/**
 * Billing. The mock provider does not simulate a purchase — it reports that
 * billing is unavailable, which is the truth.
 */
class MockBillingProvider {
  get isConnected() { return false; }
  async startCheckout(planId, interval) {
    return {
      ok: false,
      reason: 'BILLING_NOT_CONNECTED',
      message: 'Payments are not connected yet, so no subscription can be purchased.',
      planId, interval
    };
  }
  async openCustomerPortal() {
    return { ok: false, reason: 'BILLING_NOT_CONNECTED', message: 'There is no subscription to manage yet.' };
  }
}

/**
 * Real Stripe flow, for when a backend exists. Checkout sessions must be
 * created server-side: a session created in the client would let anyone pick
 * their own price.
 */
class StripeBillingProvider {
  constructor(apiBase) { this.apiBase = apiBase; }
  get isConnected() { return false; }
  async startCheckout() {
    throw new Error('StripeBillingProvider is not implemented. Create the Checkout Session at POST ' +
      this.apiBase + '/api/billing/checkout, then redirect to session.url.');
  }
  async openCustomerPortal() {
    throw new Error('StripeBillingProvider is not implemented. Create a Billing Portal session at POST ' +
      this.apiBase + '/api/billing/portal.');
  }
}

/* -------------------------------- facade -------------------------------- */

/**
 * The only thing UI code should touch. Swapping providers here changes the
 * whole app's source of truth without touching a single view.
 */
const SCC_ENTITLEMENTS = {
  _entitlement: null,
  _usage: null,
  _billing: null,

  init(storage) {
    this._entitlement = new LocalEntitlementProvider(storage);
    this._usage = new LocalUsageProvider(storage);
    this._billing = new MockBillingProvider();
    return this;
  },

  get mode() { return SCC_MODE; },
  get billing() { return this._billing; },
  get isAuthoritative() { return !!this._entitlement?.isAuthoritative; },

  async getPlan() {
    const id = await this._entitlement.getPlanId();
    return SCC_PLAN_DEFS[id];
  },

  async setPlan(planId) { return this._entitlement.setPlanId(planId); },

  async getEntitlements() { return (await this.getPlan()).entitlements; },

  async getLimits() { return (await this.getPlan()).limits; },

  /** True when the current plan includes a feature at all. */
  async has(feature) {
    const ents = await this.getEntitlements();
    return !!ents[feature];
  },

  /**
   * Whether an action can be performed right now: the plan must include it and
   * the relevant counter must be under its limit.
   * Returns a reason so the UI can explain rather than just refuse.
   */
  async canUse(action) {
    const meta = SCC_METERED[action];
    if (!meta) {
      const allowed = await this.has(action);
      return { allowed, reason: allowed ? 'OK' : 'PLAN_REQUIRED', feature: action };
    }
    if (meta.feature && !(await this.has(meta.feature))) {
      return { allowed: false, reason: 'PLAN_REQUIRED', feature: meta.feature };
    }
    const limits = await this.getLimits();
    const limit = limits[meta.limitKey];
    if (limit === SCC_LIMIT_UNLIMITED) return { allowed: true, reason: 'UNLIMITED', limit, used: null };
    const used = await this._usage.get(meta.counter, meta.period);
    return used < limit
      ? { allowed: true, reason: 'OK', limit, used, remaining: limit - used }
      : { allowed: false, reason: 'LIMIT_REACHED', limit, used, remaining: 0 };
  },

  /** Records one real use of a metered action. Only ever called after the action succeeded. */
  async record(action, by) {
    const meta = SCC_METERED[action];
    if (!meta) return null;
    return this._usage.increment(meta.counter, meta.period, by || 1);
  },

  /** Everything the usage dashboard needs, in one call. */
  async getUsage() {
    const plan = await this.getPlan();
    const out = [];
    for (const [action, meta] of Object.entries(SCC_METERED)) {
      const limit = plan.limits[meta.limitKey];
      const used = await this._usage.get(meta.counter, meta.period);
      const unlimited = limit === SCC_LIMIT_UNLIMITED;
      out.push({
        action, label: meta.label, period: meta.period,
        used, limit, unlimited,
        remaining: unlimited ? null : Math.max(0, limit - used),
        percent: unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100)),
        nearLimit: !unlimited && limit > 0 && used / limit >= 0.8 && used < limit,
        atLimit: !unlimited && used >= limit
      });
    }
    return { plan, counters: out };
  },

  async getRemainingUsage(action) {
    const r = await this.canUse(action);
    return r.remaining === undefined ? null : r.remaining;
  },

  async resetUsage() { return this._usage.reset(); }
};

/** Metered actions: which counter, which limit, which period. */
const SCC_METERED = {
  pageAudit: { counter: 'pageAudits', period: 'daily', limitKey: 'dailyPageAudits', label: 'Page audits today' },
  pageSpeedCheck: { counter: 'pageSpeedChecks', period: 'daily', limitKey: 'pageSpeedChecksPerDay', label: 'PageSpeed checks today', feature: 'pageSpeed' },
  pdfReport: { counter: 'pdfReports', period: 'monthly', limitKey: 'pdfReportsPerMonth', label: 'PDF reports this month', feature: 'pdfReports' }
};

if (typeof module !== 'undefined') {
  module.exports = {
    SCC_ENTITLEMENTS, SCC_METERED, SCC_MODE,
    LocalEntitlementProvider, ServerEntitlementProvider,
    LocalUsageProvider, ServerUsageProvider,
    MockBillingProvider, StripeBillingProvider
  };
}
