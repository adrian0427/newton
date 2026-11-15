"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createCredentialProvider, createVoiceSession } from "@/lib/ai/voice-session";
import { createSdkVoiceConnection } from "@/lib/ai/sdk-voice-connection";
import { PRACTICE_EXPRESSION, checkDistribution, distributionVoiceMessage, unsupportedWork, type DistributionCheck } from "@/lib/math/check-distribution";
import { submittedContext, type TutoringContext } from "@/lib/ai/tutoring-context";
import TutorControls from "./TutorControls";
import TutorLauncher from "./TutorLauncher";
import { shouldCelebrate } from "./celebration";

export type TutorWork = { revisionId: string; source: "whiteboard" | "expression"; expression: string; inputError: string };

/** Owns a single A01 session outside the open/closed guidance panel lifecycle. */
export default function WorkspaceTutor({ work, developmentVoiceCapability }: { work: TutorWork; developmentVoiceCapability?: string }) {
  const voiceAvailable = process.env.NODE_ENV === "development" && !!developmentVoiceCapability;
  const [session] = useState(() => createVoiceSession({
    createConnection: () => createSdkVoiceConnection(),
    credentialProvider: voiceAvailable ? createCredentialProvider({ "X-Newton-Voice-Dev": developmentVoiceCapability! }) : undefined,
  }));
  const voice = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const workKey = JSON.stringify([work.revisionId, work.source, work.expression, work.inputError]);
  const [feedback, setFeedback] = useState<{ key: string; result: DistributionCheck; showHint: boolean; delivery: string } | null>(null);
  const spokenHint = useRef<string | null>(null);
  // Decoration for a confirmed correct check; rechecking the same revision does not replay it.
  const celebratedKey = useRef<string | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const current = feedback?.key === workKey ? feedback : null;
  const context = useMemo<TutoringContext>(() => current && work.source === "expression" && !work.inputError
    ? submittedContext(work.revisionId, current.result)
    : { revisionId: work.revisionId, problem: PRACTICE_EXPRESSION, submission: null },
  [current, work.revisionId, work.source, work.inputError]);
  const hintGeneration = useRef(0);
  useLayoutEffect(() => { hintGeneration.current++; spokenHint.current = null; }, [workKey]);
  useLayoutEffect(() => {
    // Draft edits invalidate evidence; only Check work / Ask for a hint submit it.
    void session.updateContext(context);
  }, [session, context]);

  useEffect(() => {
    const stop = () => { void session.stop(); };
    window.addEventListener("pagehide", stop);
    return () => { window.removeEventListener("pagehide", stop); stop(); };
  }, [session]);
  useEffect(() => {
    if (["idle", "error"].includes(voice.state)) spokenHint.current = null;
    if (voice.state === "speaking") {
      // Once actual playback has begun, listening marks its eventual completion.
      const unsubscribe = session.subscribe(() => {
        if (session.getState() === "listening") spokenHint.current = null;
      });
      return unsubscribe;
    }
  }, [session, voice.state]);

  function check(showHint: boolean) {
    const result = work.source !== "expression"
      ? unsupportedWork("", "Handwriting and worksheet images are not analyzed. Choose Structured input to check your expansion.")
      : work.inputError ? unsupportedWork("", work.inputError) : checkDistribution(work.expression);
    if (showHint && spokenHint.current === workKey) return;
    const nextContext = work.source === "expression" && !work.inputError
      ? submittedContext(work.revisionId, result)
      : { revisionId: work.revisionId, problem: PRACTICE_EXPRESSION, submission: null };
    // Install context silently even for Check work, so microphone requests know it.
    const delivery = session.updateContext(nextContext);
    const next = { key: workKey, result, showHint, delivery: "" };
    setFeedback(next);
    if (shouldCelebrate(result, showHint, workKey, celebratedKey.current)) {
      celebratedKey.current = workKey;
      setCelebration(workKey);
    }
    if (!showHint || result.status === "unsupported" || !voiceAvailable || !["listening", "interrupted"].includes(session.getState())) return;
    spokenHint.current = workKey;
    // The effect may install the same context; equality in the session coalesces it.
    const requestedKey = workKey;
    const generation = hintGeneration.current;
    void delivery.then((applied) => {
      if (generation !== hintGeneration.current) return;
      if (session.getSnapshot().context?.revisionId !== nextContext.revisionId || session.getSnapshot().context?.status !== "applied") return;
      const message = distributionVoiceMessage(result);
      const sent = applied && !!message && session.sendText(message);
      if (!sent) spokenHint.current = null;
      else spokenHint.current = requestedKey;
      setFeedback((previous) => previous?.key === requestedKey ? { ...previous, delivery: sent
        ? "Spoken hint requested for this submitted step. You can interrupt or ask a follow-up."
        : "Voice is busy or could not accept the hint. Read the hint below; wait or end/start voice to retry." } : previous);
    });
  }

  return <TutorLauncher celebration={celebration} indicator={voice.state === "error" ? "error" : current?.result.status === "incorrect" ? "question" : "idle"}
    controls={<TutorControls voice={voice} voiceAvailable={voiceAvailable} feedback={current}
      onStart={() => { if (voiceAvailable) { void session.updateContext(context); void session.start({ sessionId: "local-study-test" }).catch(() => {}); } }}
      onStop={() => { spokenHint.current = null; void session.stop(); }} onInterrupt={() => session.interrupt()}
      onCheck={() => check(false)} onHint={() => check(true)} />} />;
}
