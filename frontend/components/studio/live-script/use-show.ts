"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type CreateShowInput, forgetShow, LiveApiError, liveApi, recallShow, rememberShow, type Show } from "./api";

const POLL_MS = 2000;
// A few missed reads in a row are normal while the backend restarts; more than that is worth telling the user.
const MISSES_BEFORE_NOTICE = 3;

/** One live script: start it, read it every two seconds while it runs, and pick it up again after a refresh. */
export function useShow() {
  const [show, setShow] = useState<Show | null>(null);
  const [problem, setProblem] = useState("");
  const [starting, setStarting] = useState(false);
  const misses = useRef(0);

  // After a refresh: a running or finished show comes back, a failed one does not.
  useEffect(() => {
    const id = recallShow();
    if (!id) return;
    let cancelled = false;
    liveApi.get(id).then((found) => {
      if (cancelled) return;
      if (found.status === "error") forgetShow();
      else setShow(found);
    }).catch((e: unknown) => {
      if (e instanceof LiveApiError && e.status === 404) forgetShow();
    });
    return () => { cancelled = true; };
  }, []);

  const showId = show?.id ?? "";
  const running = show?.status === "running";
  useEffect(() => {
    if (!running || !showId) return;
    const timer = setInterval(() => {
      liveApi.get(showId).then((next) => {
        misses.current = 0;
        setProblem("");
        setShow(next);
        if (next.status === "error") forgetShow();
      }).catch((e: unknown) => {
        if (e instanceof LiveApiError && e.status === 404) {
          forgetShow();
          setShow(null);
          setProblem("ไม่พบงานนี้แล้ว ลองสร้างใหม่");
        } else if (++misses.current >= MISSES_BEFORE_NOTICE) {
          setProblem(e instanceof Error ? e.message : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
        }
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, showId]);

  const start = useCallback(async (input: CreateShowInput) => {
    setStarting(true);
    setProblem("");
    misses.current = 0;
    try {
      const created = await liveApi.create(input);
      rememberShow(created.id);
      setShow(created);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "ลองอีกครั้ง");
    } finally {
      setStarting(false);
    }
  }, []);

  const reset = useCallback(() => {
    forgetShow();
    setShow(null);
    setProblem("");
  }, []);

  return { show, problem, starting, start, reset };
}
