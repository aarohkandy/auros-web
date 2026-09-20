/**
 * Emailing the operator that an order arrived.
 *
 * Prohibition §4.6: never "send an email to a real person… without explicit human approval in that
 * session". An order flow that emails on every submission cannot ask for approval per send, so the
 * approval is given once, deliberately, by setting `OPERATOR_EMAIL_ENABLED` to `"true"` on the
 * deployment. Until somebody does that, this function composes the message, returns it, and sends
 * nothing — and the `/order` response says `operator_notified: false` rather than implying otherwise.
 *
 * The order is not lost when the email is not sent. The pull request *is* the notification: it is in a
 * public repository, it is watchable, and it survives this Worker entirely. The email is a convenience
 * on top of a durable record, which is the right way round — an order flow whose only trace is an email
 * is an order flow that loses orders to a spam filter.
 *
 * MailChannels' free Workers relay closed in 2024, so there is no zero-configuration path any more.
 * This uses Resend's HTTP API, which is one fetch and no SDK. Swapping it for Postmark or SES is a
 * change to `deliver()` and nothing else.
 */

/**
 * @typedef {object} EmailConfig
 * @property {boolean} enabled
 * @property {string|undefined} apiKey
 * @property {string|undefined} from
 * @property {string|undefined} to
 * @property {typeof fetch} [fetchImpl]
 */

/**
 * @param {object} order
 * @param {string} order.recipe
 * @param {string} order.prUrl
 * @param {number} order.devices
 * @param {string} order.tier
 * @param {string|null} order.contactEmail
 * @param {string} order.policy
 * @param {boolean} order.stripeLive
 */
export function composeOperatorEmail (order) {
  const subject = `auros order · ${order.recipe} · ${order.devices} ${order.devices === 1 ? 'machine' : 'machines'} · ${order.tier}`
  const text = [
    `A recipe was submitted through the configurator and is now a pull request.`,
    '',
    `  recipe     ${order.recipe}`,
    `  machines   ${order.devices}`,
    `  tier       ${order.tier}`,
    `  policy     ${order.policy}`,
    `  contact    ${order.contactEmail ?? '(none given)'}`,
    `  pull req   ${order.prUrl}`,
    '',
    'The pull request body is the explain output, so it reads the same way the customer reads it.',
    '',
    order.stripeLive
      ? 'Stripe is LIVE on this deployment. A card has been collected and authenticated. Nothing is charged until the test build passes.'
      : 'Stripe is NOT live on this deployment (STRIPE_LIVE_ENABLED is not "true"). No card was collected. The checkout parameters that would have been sent are recorded on the order.',
    '',
    'Nothing has been built and nothing has been published. Merging the pull request starts the test build.'
  ].join('\n')
  return { subject, text }
}

/**
 * @param {EmailConfig} cfg
 * @param {{ subject: string, text: string }} message
 * @returns {Promise<{ sent: boolean, reason: string }>}
 */
export async function deliver (cfg, message) {
  if (!cfg.enabled) {
    return { sent: false, reason: 'OPERATOR_EMAIL_ENABLED is not "true". Prohibition §4.6 reserves sending mail to a real person for a human decision, so the message was composed and not sent. The pull request is the durable record.' }
  }
  if (!cfg.apiKey || !cfg.from || !cfg.to) {
    return { sent: false, reason: 'email is enabled but RESEND_API_KEY, OPERATOR_EMAIL_FROM or OPERATOR_EMAIL_TO is missing, so nothing was sent. The order itself is unaffected.' }
  }
  const fetchImpl = cfg.fetchImpl ?? fetch
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject: message.subject, text: message.text })
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { sent: false, reason: `the mail provider returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}. The order and the pull request are unaffected.` }
    }
    return { sent: true, reason: 'sent' }
  } catch (e) {
    // A notification that could not be delivered does not undo an order that already exists as a
    // pull request. The PR is the durable record; the email is a convenience on top of it.
    return { sent: false, reason: `could not reach the mail provider (${e instanceof Error ? e.message : String(e)}). The order and the pull request are unaffected.` }
  }
}
