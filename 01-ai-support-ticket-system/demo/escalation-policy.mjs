/** Trusted configuration: no monetary approval limit or currency is assumed. */
export const DEMO_POLICY = Object.freeze({
  version: 'demo-escalation-v2',
  refundThreshold: null,
  refundCurrency: null,
  symbolCurrencies: {},
  rules: {approvalClaims:true, monetaryRefunds:true, policyExceptions:true, fraudAllegations:true, legalThreats:true, seriousDisputes:true},
});

/** Deterministic triage signals, not proof that a customer's claim is true. */
export function evaluateEscalation(message, classification, config) {
  const reasons = new Set();
  const descriptions = {
    UNVERIFIED_APPROVAL: 'Unverified manager or supervisor approval claim.',
    REFUND_POLICY_UNCONFIGURED: 'Monetary refund claim requires review: refund threshold or currency policy is not configured.',
    REFUND_AMOUNT_UNVERIFIABLE: 'Monetary refund amount or currency could not be verified.',
    HIGH_VALUE_REFUND: 'Requested refund exceeds the configured monetary threshold.',
    POLICY_EXCEPTION: 'Request for an exception to company policy.',
    FRAUD_ALLEGATION: 'Fraud or unauthorized-payment allegation.',
    LEGAL_THREAT: 'Legal action threatened or reported.',
    SERIOUS_DISPUTE: 'Formal payment dispute or chargeback.',
    INVALID_AI_OUTPUT: 'AI classification is unsupported, malformed, or uncertain.',
    POLICY_CHECK_FAILED: 'Required business-policy checks could not be completed.',
  };
  const allowed = ['SHIPPING', 'REFUND', 'BILLING', 'GENERAL'];
  const valid = classification?.isValid === true && allowed.includes(classification.category)
    && typeof classification.reason === 'string' && classification.reason.trim().length > 0
    && classification.reason.trim().length <= 500;
  // An unavailable model is an infrastructure failure, never a review fallback.
  if (classification?.errorCode === 'AI_UNAVAILABLE') {
    return { outcome: 'FAILED', requiresReview: false, codes: [], reviewReason: 'AI_UNAVAILABLE' };
  }
  if (!valid) reasons.add('INVALID_AI_OUTPUT');
  try {
    if (typeof message !== 'string' || !config || typeof config.version !== 'string' || !/^[a-zA-Z0-9._-]{1,32}$/.test(config.version)) throw Error('POLICY_CONFIG');
    for (const rule of ['approvalClaims','monetaryRefunds','policyExceptions','fraudAllegations','legalThreats','seriousDisputes']) {
      if (typeof config.rules?.[rule] !== 'boolean') throw Error('POLICY_RULE_CONFIG');
    }
    const thresholdReady = Number.isFinite(config.refundThreshold) && config.refundThreshold >= 0
      && typeof config.refundCurrency === 'string' && /^[A-Z]{3}$/.test(config.refundCurrency);
    // Sentence/contrast scope keeps unrelated and explicitly hypothetical mentions separate.
    const clauses = message.split(/(?<=[.!?])\s+|[\n;]+|\bbut\b|\bhowever\b/i);
    for (const original of clauses) {
      const text = original.toLowerCase().replace(/[’]/g, "'").trim();
      const conditionalThreat = /\b(?:i|we)\s+(?:will|plan to|intend to)\s+(?:sue|file|take legal action)/.test(text);
      if (!text || (!conditionalThreat && (/^(?:if\b|hypothetically\b|suppose\b|for example\b|as an example\b|imagine\b)/.test(text)
          || /\b(?:hypothetical example|hypothetical scenario)\b/.test(text)))) continue;
      const approval = /\b(?:manager|supervisor)\b.{0,65}\b(?:approved|authorized|promised|signed off|agreed to)\b/.test(text)
        || /\b(?:approved|authorized|promised|signed off)\b.{0,40}\bby\s+(?:your |the |a |my |our )?(?:manager|supervisor)\b/.test(text);
      const approvalDenied = /\b(?:not|never|hasn't|hadn't|haven't|didn't|wasn't|weren't)\s+(?:been\s+)?(?:approved|authorized|promised|signed off|agreed)\b/.test(text)
        || /\b(?:no|neither)\s+(?:manager|supervisor)\b/.test(text);
      const approvalQuestion = /^(?:has|have|did|can|could|would|will)\s+(?:your |the |a |my |our )?(?:manager|supervisor)\b/.test(text)
        || /\b(?:whether|if)\s+(?:your |the |a |my |our )?(?:manager|supervisor)\b/.test(text);
      const approvalContext = /\b(?:refund|return|replacement|credit|discount|exception|payment|reimburse|request|claim|waiver)\b/.test(text) || /\b(?:approved|authorized)\s+(?:it|this)\b/.test(text);
      if (config.rules.approvalClaims && approval && approvalContext && !approvalDenied && !approvalQuestion) reasons.add('UNVERIFIED_APPROVAL');
      if (config.rules.fraudAllegations && /\b(?:fraud|fraudulent|scam|scammed|unauthori[sz]ed\s+(?:charge|payment|transaction))\b/.test(text)
          && !/\b(?:not|no|never|isn't|wasn't)\s+(?:a\s+)?(?:fraud|fraudulent|scam|scammed|unauthori[sz]ed)\b/.test(text)
          && !/\b(?:prevent|avoid|prevention|learn about|what is)\b/.test(text)) reasons.add('FRAUD_ALLEGATION');
      if (config.rules.legalThreats && /\b(?:sue|suing|lawsuit|legal action|my lawyer|my attorney)\b/.test(text)
          && /\b(?:i|we|my|our|will|plan|intend|file|filing|take|taking|contact|contacting)\b/.test(text)
          && !/\b(?:not|never|won't|will not|don't|do not)\b.{0,25}\b(?:sue|suing|file|filing|take|taking|legal action|lawyer|attorney)\b/.test(text)) reasons.add('LEGAL_THREAT');
      if (config.rules.seriousDisputes && /\b(?:chargeback|formal dispute|disput(?:e|ing) (?:this|the|a|my) (?:charge|payment|transaction))\b/.test(text)
          && !/\b(?:no|not|never|won't|will not|don't|do not)\b.{0,25}\b(?:chargeback|formal dispute|disput)/.test(text)
          && !/\b(?:what is|explain|definition|prevent|avoid)\b/.test(text)) reasons.add('SERIOUS_DISPUTE');
      if (config.rules.policyExceptions && /\b(?:make|request|grant|allow|want|need|asking for)\b.{0,35}\b(?:an? )?exception\b|\b(?:waive|bypass|ignore|override)\b.{0,25}\b(?:policy|rule|return window|deadline)\b/.test(text)
          && !/\b(?:not|never|don't|do not|no)\b.{0,20}\b(?:request|need|want|asking|make|exception|waive|bypass|ignore|override)\b/.test(text)) reasons.add('POLICY_EXCEPTION');
      // A price mention or a general refund-policy question is not a refund claim.
      const refundIntent = /\brefund\b/.test(text) && /\b(?:request|requesting|want|need|seeking|issue|process|approve|approved|authorized|promised|owed|refund me|refund of)\b/.test(text)
        && !/\b(?:not|never|don't|do not|no)\b.{0,20}\b(?:want|need|request|requesting|seeking|refund|owed)\b/.test(text);
      if (config.rules.monetaryRefunds && refundIntent) {
        const amounts = [...original.matchAll(/(USD|EUR|GBP|CAD|AUD|\$|€|£)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(USD|EUR|GBP|CAD|AUD|dollars?|euros?|pounds?)/gi)];
        for (const match of amounts) {
          if (!thresholdReady) { reasons.add('REFUND_POLICY_UNCONFIGURED'); continue; }
          const token = (match[1] || match[4]).toUpperCase(), raw = match[2] || match[3];
          const currency = /^[A-Z]{3}$/.test(token) ? token : config.symbolCurrencies?.[token];
          if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw) || currency !== config.refundCurrency) {
            reasons.add('REFUND_AMOUNT_UNVERIFIABLE'); continue;
          }
          const amount = Number(raw.replaceAll(',', ''));
          if (!Number.isFinite(amount)) reasons.add('REFUND_AMOUNT_UNVERIFIABLE');
          else if (amount > config.refundThreshold) reasons.add('HIGH_VALUE_REFUND');
        }
        if (!amounts.length && /[$€£]|\b(?:dollars?|euros?|pounds?|USD|EUR|GBP|CAD|AUD)\b/i.test(original)) reasons.add('REFUND_AMOUNT_UNVERIFIABLE');
      }
    }
  } catch { reasons.add('POLICY_CHECK_FAILED'); }
  const codes = [...reasons].sort();
  return { outcome: codes.length ? 'PENDING_REVIEW' : 'AUTO_ROUTED', requiresReview: !!codes.length,
    codes, reviewReason: codes.map(code => descriptions[code]).join(' ').slice(0,500) };
}
