import { planVideoMedia } from '@/services/agent-tools/video-media.js'
import { createOpenAIResponse } from '@/services/openai.service.js'
import { storyboardSchema, type VideoBrief } from '@/services/video/brief.js'
import { portraitTimeline } from '@/services/video/portrait.js'

jest.mock('@/services/openai.service.js', () => ({
  createOpenAIResponse: jest.fn(),
}))

const brief: VideoBrief = {
  title: 'Morning',
  subtitle: '',
  color: 'gold',
  motion: 'slide',
  subject: 'none',
  format: 'portrait',
}
const shot = {
  framing: 'medium',
  camera: 'push',
  focusX: 0.5,
  focusY: 0.5,
  copy: 'none',
  placement: 'top',
  seconds: 1.5,
  imageIndex: 1,
  layout: 'bleed',
  transition: 'cut',
  line: '',
} as const

it('retains the original six-second edit for saved briefs', () => {
  expect(portraitTimeline(brief).map(({ start, end }) => [start, end])).toEqual(
    [
      [0, 39],
      [39, 84],
      [84, 144],
    ],
  )
})

it('fits narration without gaps or a truncated last shot', () => {
  const shots = [shot, { ...shot, seconds: 2 }, { ...shot, seconds: 1 }]
  const timeline = portraitTimeline({ ...brief, shots }, 200)
  expect(timeline.map(({ start, end }) => [start, end])).toEqual([
    [0, 67],
    [67, 156],
    [156, 200],
  ])
})

it('requires a timed visual beat for every shot of the storyboard', () => {
  const board = {
    ...brief,
    typeface: 'modern',
    visualMode: 'photographic',
    look: 'Morning light',
    beats: Array(6).fill({
      seconds: 2,
      show: 'Water reflections on glass',
      say: '',
    }),
  }
  expect(storyboardSchema.safeParse(board).success).toBe(true)
  expect(
    storyboardSchema.safeParse({ ...board, beats: board.beats.slice(0, 2) })
      .success,
  ).toBe(false)
})
it('plans distinct image calls and a spoken script in the same video', async () => {
  const call = (name: string, args: object) => ({
    type: 'function_call',
    name,
    arguments: JSON.stringify(args),
  })
  const speech = {
    text: 'Morning light.',
    voice: 'marin',
    direction: 'Warm and soft.',
  }
  jest.mocked(createOpenAIResponse).mockResolvedValueOnce({
    output: [
      call('generate_image', {
        prompt: 'A sunlit bottle',
        referenceImage: 0,
      }),
      call('generate_speech', speech),
      call('generate_image', {
        prompt: 'A coral detail',
        referenceImage: null,
      }),
    ],
  } as Awaited<ReturnType<typeof createOpenAIResponse>>)
  const plan = await planVideoMedia([], 1, new AbortController().signal)
  expect(plan).toEqual({
    images: [
      { prompt: 'A sunlit bottle', referenceImage: 0 },
      { prompt: 'A coral detail', referenceImage: null },
    ],
    speech,
  })
})
