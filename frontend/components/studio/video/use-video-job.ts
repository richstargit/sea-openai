"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type CreateVideoInput, forgetJob, recallJob, rememberJob, type VideoJob, VideoApiError, videoApi } from "./api";

const POLL_MS = 2000;
// A few missed reads in a row are normal while the backend restarts; more than that is worth telling the user.
const MISSES_BEFORE_NOTICE = 3;

/** One video job: start it, read it every two seconds while it runs, and pick it up again after a refresh. */
export function useVideoJob() {
  const [job, setJob] = useState<VideoJob | null>(null);
  const [problem, setProblem] = useState("");
  const [starting, setStarting] = useState(false);
  const misses = useRef(0);

  // After a refresh: a running or finished job comes back, a failed one does not.
  useEffect(() => {
    const id = recallJob();
    if (!id) return;
    let cancelled = false;
    videoApi.get(id).then((found) => {
      if (cancelled) return;
      if (found.status === "error") forgetJob();
      else setJob(found);
    }).catch((e: unknown) => {
      if (e instanceof VideoApiError && e.status === 404) forgetJob();
    });
    return () => { cancelled = true; };
  }, []);

  const jobId = job?.id ?? "";
  const running = job?.status === "running";
  useEffect(() => {
    if (!running || !jobId) return;
    const timer = setInterval(() => {
      videoApi.get(jobId).then((next) => {
        misses.current = 0;
        setProblem("");
        setJob(next);
        if (next.status === "error") forgetJob();
      }).catch((e: unknown) => {
        if (e instanceof VideoApiError && e.status === 404) {
          forgetJob();
          setJob(null);
          setProblem("ไม่พบงานนี้แล้ว ลองสร้างใหม่");
        } else if (++misses.current >= MISSES_BEFORE_NOTICE) {
          setProblem(e instanceof Error ? e.message : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
        }
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, jobId]);

  const start = useCallback(async (input: CreateVideoInput) => {
    setStarting(true);
    setProblem("");
    misses.current = 0;
    try {
      const created = await videoApi.create(input);
      rememberJob(created.id);
      setJob(created);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "ลองอีกครั้ง");
    } finally {
      setStarting(false);
    }
  }, []);

  const reset = useCallback(() => {
    forgetJob();
    setJob(null);
    setProblem("");
  }, []);

  return { job, problem, starting, start, reset };
}
