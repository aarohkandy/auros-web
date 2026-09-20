/**
 * The five tiers from spec section 6D.
 *
 * SECTION 9 RESERVED. These numbers are fixed by the spec and a price change is a human
 * decision. Nothing in this file may round them, average them, discount them, or derive a
 * total that reads as a quote. What it does is pick which published tier a set of answers
 * falls into and say so plainly, including when the answers do not fall into one.
 *
 * It also deliberately does NOT print a saving. We have no customers, our real competitor is
 * doing nothing, and doing nothing is free (spec section 4.4). The arithmetic against
 * replacement cost lives on the pricing page, performed with the reader's own numbers.
 */

export type Tier = {
  id: "one-machine" | "school" | "business" | "single-purpose" | "self-serve";
  name: string;
  /** Exactly as published. Mono. */
  priceMono: string;
  unitMono: string;
  /** Device minimum, or null where there is none. */
  minimum: number | null;
};

export const TIERS: Record<Tier["id"], Tier> = {
  "one-machine": { id: "one-machine", name: "One machine", priceMono: "$79", unitMono: "one-time", minimum: null },
  school: { id: "school", name: "School or nonprofit", priceMono: "$15", unitMono: "per device per year", minimum: 25 },
  business: { id: "business", name: "Business fleet", priceMono: "$12", unitMono: "per device per month", minimum: 10 },
  "single-purpose": { id: "single-purpose", name: "Single-purpose", priceMono: "$19", unitMono: "per device per month", minimum: 5 },
  "self-serve": { id: "self-serve", name: "Self-serve", priceMono: "$0", unitMono: "the recipes are public", minimum: null },
};

export type TierVerdict = {
  tier: Tier | null;
  /** One line under the price. Never a total, never a saving. */
  note: string;
  /** True when the answers do not land in a published tier and a person has to be involved. */
  needsAConversation: boolean;
};

export function tierFor(input: {
  machines: number | null;
  orgKind: "school-or-nonprofit" | "business" | "just-me" | null;
  policy: "open" | "managed" | "locked" | "kiosk" | null;
}): TierVerdict {
  const { machines, orgKind, policy } = input;

  if (machines === null || orgKind === null) {
    return { tier: null, note: "Tell us how many machines and what kind of place this is.", needsAConversation: false };
  }

  if (policy === "kiosk") {
    const t = TIERS["single-purpose"];
    if (machines < (t.minimum as number)) {
      return {
        tier: t,
        note: `The single-purpose tier starts at ${t.minimum} devices and you have ${machines}. Below that it is a conversation, not a checkout.`,
        needsAConversation: true,
      };
    }
    return { tier: t, note: "Single-purpose machines are billed monthly because they are watched nightly.", needsAConversation: false };
  }

  if (machines === 1) {
    return { tier: TIERS["one-machine"], note: "One machine, paid once, after the test build passes.", needsAConversation: false };
  }

  if (orgKind === "school-or-nonprofit") {
    const t = TIERS.school;
    if (machines < (t.minimum as number)) {
      return {
        tier: t,
        note: `The school and nonprofit tier starts at ${t.minimum} devices and you have ${machines}. Email us — under the minimum is a conversation, and often the answer is the self-serve build at $0.`,
        needsAConversation: true,
      };
    }
    return { tier: t, note: "Billed yearly. The replacement-cost comparison is on the pricing page, using your numbers.", needsAConversation: false };
  }

  if (orgKind === "business") {
    const t = TIERS.business;
    if (machines < (t.minimum as number)) {
      return {
        tier: t,
        note: `The business tier starts at ${t.minimum} devices and you have ${machines}. Under the minimum, email us.`,
        needsAConversation: true,
      };
    }
    return { tier: t, note: "Billed monthly.", needsAConversation: false };
  }

  // Several machines, not an organisation. There is no published tier for that shape and we are
  // not going to invent one on a web page.
  return {
    tier: null,
    note: `${machines} machines and not an organisation is not one of the five published tiers. That is a conversation with a person, not a number this page can produce. The recipes are public, so building it yourself is $0 and always will be.`,
    needsAConversation: true,
  };
}
