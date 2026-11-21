// A stand in for the live transcription: it "hears" scripted sentences, the way the real one reports them. Speech is
// cut after a pause, then the text arrives in growing partial results and a final one. It lets the whole panel run and
// be tested without a microphone or a network. It has no imports, so it can be tested on its own, and the timer
// functions are injected so a test does not have to wait.

export type MockHandlers = {
  onCommitted: (id: string, tsMs: number) => void;
  onResult: (result: { id: string; text: string; final: boolean; tsMs: number }) => void;
  onFailed: (id: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
};
export type Scheduler = { set: (run: () => void, ms: number) => unknown; clear: (id: unknown) => void };
export type Planned = { at: number; kind: "committed" | "partial" | "final"; id: string; text: string };

export const MOCK_SCRIPT = [
  "สวัสดีครับทุกคน วันนี้มีของดีมาให้ดู",
  "ตัวนี้เป็นปากกาเจล หมึกแห้งไว ไม่เลอะมือ",
  "ลองจับดูนะครับ ด้ามจับถนัดมือ",
  "ราคาวันนี้เดี๋ยวบอกอีกทีนะครับ",
];

/** When each event of each sentence is heard, in milliseconds from the start, in the order the server would send them. */
export function planUtterances(script: string[], options: { msPerChar?: number; pauseMs?: number; partials?: number; startMs?: number; commitDelayMs?: number; resultMs?: number } = {}): Planned[] {
  const { msPerChar = 55, pauseMs = 900, partials = 2, startMs = 800, commitDelayMs = 700, resultMs = 300 } = options;
  const out: Planned[] = [];
  let cursor = startMs;
  script.forEach((sentence, n) => {
    const chars = Array.from(sentence);
    const id = `mock-${n}`;
    const speechEnds = cursor + Math.max(600, chars.length * msPerChar);
    const commitAt = speechEnds + commitDelayMs;
    out.push({ at: Math.round(commitAt), kind: "committed", id, text: "" });
    for (let step = 1; step <= partials; step++) {
      const upTo = Math.max(1, Math.ceil((chars.length * step) / (partials + 1)));
      out.push({ at: Math.round(commitAt + (resultMs * step) / (partials + 1)), kind: "partial", id, text: chars.slice(0, upTo).join("") });
    }
    out.push({ at: Math.round(commitAt + resultMs), kind: "final", id, text: sentence });
    cursor = speechEnds + pauseMs;
  });
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
        timers.push(scheduler.set(() => {
          if (event.kind === "committed") handlers.onCommitted(event.id, event.at);
          else handlers.onResult({ id: event.id, text: event.text, final: event.kind === "final", tsMs: event.at });
        }, event.at));
      }
      return Promise.resolve();
    },
    stop(): Promise<void> {
      for (const id of timers.splice(0)) scheduler.clear(id);
      return Promise.resolve();
    },
  };
}
