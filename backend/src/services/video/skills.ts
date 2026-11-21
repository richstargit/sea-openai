import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { model, Schema } from 'mongoose'
import { parseDocument } from 'yaml'
import { z } from 'zod'
import { mongo } from '@/models/mongo.js'
import { AppError } from '@/services/error.service.js'
import { skillName } from '@/services/skill.service.js'

const central = [
  {
    name: 'motion-graphics',
    description:
      'Motion graphics, kinetic titles and animated promotional overlays',
    reference: 'motion-graphics/SKILL.md',
    guidance:
      'Use a short entrance, one readable focal point, a hold and a clean exit.',
  },
  {
    name: 'hyperframes-animation',
    description: 'Animation timing, layered reveals and easing for video',
    reference: 'hyperframes-animation/SKILL.md',
    guidance:
      'Stage the reveal in beats. Choose slide, pulse or wipe to support the message.',
  },
  ...(
    [
      [
        'explainer-default',
        'A clear, paced explainer title',
        'Use one subject and a short supporting line with a gentle slide.',
      ],
      [
        'explainer-engaging',
        'An explainer with an emphatic reveal',
        'Build a setup and a contrasting payoff using the supporting line.',
      ],
      [
        'explainer-high-energy',
        'A punchy, high-energy promotional video',
        'Use bold short copy, a bright accent and a fast pulse.',
      ],
      [
        'motion-broll',
        'A visual cutaway to support a live segment',
        'Choose a single visual focal point and a clean wipe.',
      ],
    ] as const
  ).map(([name, description, guidance]) => ({
    name,
    description,
    guidance,
    reference: `${name}/SKILL.md`,
  })),
  {
    name: 'blender-3d',
    description:
      'A rotating 3D hero object rendered by the local Blender application',
    reference: 'hyperframes/references/types/3d.md',
    guidance:
      'Choose a box, cylinder or torus. Keep one hero in frame with a legible silhouette.',
  },
]

const style = z.object({
  name: skillName,
  description: z.string().trim().min(1).max(512),
  instructions: z.string().trim().min(1).max(16000),
})
export const skillUpload = z.strictObject({
  markdown: z.string().min(1).max(18000),
})
const PersonalStyle = model(
  'VideoStyle',
  new Schema(
    {
      _id: { type: String, required: true },
      styles: {
        type: [
          new Schema(
            {
              name: { type: String, required: true },
              description: { type: String, required: true },
              instructions: { type: String, required: true },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },
    { versionKey: false, collection: 'video_skills' },
  ),
)

export async function saveStyle(userId: string, markdown: string) {
  const parts = /^---\r?\n([\s\S]+?)\r?\n---\s*\n([\s\S]+)$/.exec(markdown)
  const doc = parseDocument(parts?.[1] || '')
  let header: unknown
  try {
    header = doc.errors.length ? null : doc.toJS({ maxAliasCount: 0 })
  } catch {
    throw new AppError('BAD_REQUEST', { key: 'so-skill-frontmatter' })
  }
  const entry = style.parse({
    ...(typeof header === 'object' && header ? header : {}),
    instructions: parts?.[2],
  })
  if (central.some((item) => item.name === entry.name))
    throw new AppError('CONFLICT', { key: 'so-skill-reserved' })
  await mongo(() =>
    PersonalStyle.updateOne(
      { _id: userId },
      { $setOnInsert: { styles: [] } },
      { upsert: true },
    ),
  )
  const saved = await mongo(() =>
    PersonalStyle.updateOne(
      {
        _id: userId,
        'styles.name': { $ne: entry.name },
        'styles.19': { $exists: false },
      },
      { $push: { styles: entry } },
    ),
  )
  if (!saved.modifiedCount)
    throw new AppError('CONFLICT', {
      key: 'so-skill-duplicate-or-full',
      message: 'Choose a unique name. Each account can store 20 styles.',
    })
  return { name: entry.name, description: entry.description }
}
export async function videoSkills(userId: string) {
  const saved = await mongo(() => PersonalStyle.findById(userId).lean())
  return [
    ...central.map((item) => ({
      name: item.name,
      description: item.description,
      source: 'central' as const,
    })),
    ...(saved?.styles ?? []).map((item) => ({
      name: item.name,
      description: item.description,
      source: 'personal' as const,
    })),
  ]
}
export async function styleInstructions(userId: string, name: string) {
  const item = central.find((entry) => entry.name === name)
  if (item) {
    const folder =
      process.env.VIDEO_SKILLS_DIR || join(homedir(), '.agents', 'skills')
    const text = await readFile(join(folder, item.reference), 'utf8').catch(
      () => '',
    )
    return `${item.guidance}\n${text.slice(0, 12000)}`
  }
  const saved = await mongo(() => PersonalStyle.findById(userId).lean())
  const custom = saved?.styles.find((entry) => entry.name === name)
  if (!custom)
    throw new AppError('NOT_FOUND', { key: 'so-video-skill-unavailable' })
  return custom.instructions || ''
}
