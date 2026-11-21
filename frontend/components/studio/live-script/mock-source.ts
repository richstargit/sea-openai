// A stand in for the live transcription: it says scripted sentences, a few growing partial results and then a final
// one, with pauses between. It lets the whole panel run and be tested without a microphone or a network. It has no
// imports, so it can be tested on its own, and the timer functions are injected so a test does not have to wait.

export type MockResult = { text: string; final: boolean; tsMs: number };
export type MockHandlers = { onResult: (result: MockResult) => void; onError: (message: string) => void; onClose: () => void };
export type Scheduler = { set: (run: () => void, ms: number) => unknown; clear: (id: unknown) => void };
export type Planned = { at: number; text: string; final: boolean };

export const MOCK_SCRIPT = [
  "สวัสดีครับทุกคน วันนี้มีของดีมาให้ดู",
  "ตัวนี้เป็นปากกาเจล หมึกแห้งไว ไม่เลอะมือ",
  "ลองจับดูนะครับ ด้ามจับถนัดมือ",
  "ราคาวันนี้เดี๋ยวบอกอีกทีนะครับ",
];

/** When each partial and final result of each sentence is heard, in milliseconds from the start. */
export function planUtterances(script: string[], options: { msPerChar?: number; pauseMs?: number; partials?: number; startMs?: number } = {}): Planned[] {
  const { msPerChar = 55, pauseMs = 900, partials = 2, startMs = 800 } = options;
  const out: Planned[] = [];
  let cursor = startMs;
  for (const sentence of script) {
    const chars = Array.from(sentence);
    const duration = Math.max(600, chars.length * msPerChar);
    for (let step = 1; step <= partials; step++) {
      const upTo = Math.max(1, Math.ceil((chars.length * step) / (partials + 1)));
      out.push({ at: Math.round(cursor + (duration * step) / (partials + 1)), text: chars.slice(0, upTo).join(""), final: false });
    }
    out.push({ at: Math.round(cursor + duration), text: sentence, final: true });
    cursor += duration + pauseMs;
  }
  return out;
}

const realScheduler: Scheduler = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createMockSource({ handlers, scheduler = realScheduler, script = MOCK_SCRIPT }: { handlers: MockHandlers; scheduler?: Scheduler; script?: string[] }) {
  const timers: unknown[] = [];
  return {
    start(): Promise<void> {
      for (const event of planUtterances(script)) {
        timers.push(scheduler.set(() => handlers.onResult({ text: event.text, final: event.final, tsMs: event.at }), event.at));
      }
      return Promise.resolve();
    },
    stop() {
      for (const id of timers.splice(0)) scheduler.clear(id);
    },
  };
}
