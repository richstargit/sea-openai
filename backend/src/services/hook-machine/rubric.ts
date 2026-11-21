export const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D', 'F'] as const
export type Grade = (typeof GRADES)[number]

export function gradeRank(grade: Grade): number {
  return GRADES.indexOf(grade)
}

export type Principle = {
  name: string
  description: string
  source: 'universal' | 'profile'
  evidence?: string
}

export const UNIVERSAL_PRINCIPLES: Principle[] = [
  {
    name: 'Rapid context',
    description:
      'The first sentence says what the video is about, so the right viewer opts in at once.',
    source: 'universal',
  },
  {
    name: 'Clarity',
    description:
      'Zero ambiguity. If two viewers could read the hook two ways, rewrite it.',
    source: 'universal',
  },
  {
    name: 'Contrast and curiosity loop',
    description:
      'A gap between what the viewer believes and what you claim, on a topic they care about. Stated or implied.',
    source: 'universal',
  },
  {
    name: 'Distillation',
    description: 'Fewest words possible. Every word earns its place.',
    source: 'universal',
  },
  {
    name: 'Specificity',
    description:
      'Numbers, names, timeframes and concrete outcomes instead of vague promises.',
    source: 'universal',
  },
  {
    name: 'Absorption rate',
    description:
      'Lands on first listen at speaking speed: plain words first, one idea per sentence, no cold jargon.',
    source: 'universal',
  },
  {
    name: 'Instant value promise',
    description:
      'The hook itself holds the promise of what the viewer gets, not a teaser that needs more watching to decode.',
    source: 'universal',
  },
  {
    name: 'Credibility anchor (bonus)',
    description:
      'A proof point in lines 2 to 3: a result, a case, a stat, a trusted source. Reward it, never require it. Never invent one.',
    source: 'universal',
  },
]

export const ANTI_PATTERNS = [
  'Vague superlatives with no specifics ("the best trick ever")',
  'Topic not clear until sentence two or later',
  'Wording that can be understood more than one way',
  'Throat-clearing openers ("so basically", "I want to talk about")',
  'Several disconnected points crammed into one hook',
  'Jargon or insider language before the viewer is primed',
  'Generic fear kickers that could attach to any topic',
  'Em-dashes. They read as AI-written. Use a period, a comma or a line break',
]

export const GRADE_SCALE = `A+ every applicable principle fires, no real tradeoff
A  nearly all strong, one minor tradeoff
A- strong, one identifiable weakness
B+ good, would perform, 1-2 clear improvements
B  functional, misses significant opportunities
B- right idea, flawed execution
C  weak, several core principles violated
D  broken fundamentals
F  would hurt performance`

export function rubricPrompt(custom: Principle[]): string {
  const universal = UNIVERSAL_PRINCIPLES.map(
    (p, i) => `${i + 1}. ${p.name}: ${p.description}`,
  ).join('\n')
  const profile = custom.length
    ? custom.map((p, i) => `${i + 1}. ${p.name}: ${p.description}`).join('\n')
    : '(none yet)'
  return `UNIVERSAL HOOK PRINCIPLES
${universal}

PRINCIPLES SPECIFIC TO THIS CREATOR PROFILE (found in their reference videos)
${profile}

ANTI-PATTERNS TO FLAG
${ANTI_PATTERNS.map((a) => `- ${a}`).join('\n')}

GRADING
Grading is holistic, not a checklist count. Some principles matter more for some topics.
${GRADE_SCALE}
Never use the em-dash character in any hook you write.`
}

/** Hooks are spoken aloud, so the em-dash is never wanted. */
export function stripEmDash(text: string): string {
  return text.replace(/\s*[—―]\s*/g, ', ')
}
