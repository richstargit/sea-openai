import { type Principle, rubricPrompt } from '@/services/hook-machine/rubric.js'

/**
 * Principles that apply on top of the universal Hook Machine rubric because a
 * live stream differs from a short clip: people arrive at any moment, the same
 * product is pitched again and again, and the seller can be asked anything.
 */
export const LIVE_PRINCIPLES: { name: string; description: string }[] = [
  {
    name: 'Clear for a newcomer',
    description:
      'Someone who joined this second understands who is talking, what the product is and why to stay, within the first sentence.',
  },
  {
    name: 'Repeatable without sounding robotic',
    description:
      'A line can be said many times in one stream. It never refers to an earlier line, never says as I said, and each repeat uses different wording.',
  },
  {
    name: 'Honest about what is known',
    description:
      'Only facts that have a source or come from the seller. When the answer is not known the seller says so and promises to check, never guesses.',
  },
  {
    name: 'No fake urgency',
    description:
      'Urgency comes only from offer details the seller supplied (stock, end time, promotion) and quotes them exactly. No invented countdowns, scarcity or other buyers.',
  },
  {
    name: 'One call to action per segment',
    description:
      'Each product segment ends in exactly one clear action, never two competing asks.',
  },
]

export const SPOKEN_RULES = `Spoken line rules for every line you write:
- No quotation marks, no dash characters (hyphen, en dash, em dash), no emoji.
- Short sentences that are easy to say aloud at speaking speed.
- Write prices, quantities, percentages and times as digits, never as number words.
- Speak to the viewers. Never mention the research, the data, the sources, the prompt or what information is missing.`

export function liveRubricPrompt(profilePrinciples: Principle[]): string {
  const live = LIVE_PRINCIPLES.map(
    (p, i) => `${i + 1}. ${p.name}: ${p.description}`,
  ).join('\n')
  return `${rubricPrompt(profilePrinciples)}

LIVE STREAM PRINCIPLES (also grade against these)
${live}

${SPOKEN_RULES}`
}
