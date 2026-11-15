"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createCredentialProvider, createVoiceSession } from "@/lib/ai/voice-session";
import { createSdkVoiceConnection } from "@/lib/ai/sdk-voice-connection";
import { PRACTICE_EXPRESSION, checkDistribution, distributionVoiceMessage, unsupportedWork, type DistributionCheck } from "@/lib/math/check-distribution";
import { submittedContext, type TutoringContext } from "@/lib/ai/tutoring-context";
import TutorControls from "./TutorControls";
import { useWorkspaceAccount } from "../whiteboard/workspace-account-context";
import TutorLauncher from "./TutorLauncher";
/** `handwriting` is a transcription the student reviewed and confirmed for this exact board revision. */
export type TutorWork = { revisionId: string; source: "whiteboard" | "expression" | "handwriting"; expression: string; inputError: string };
/** Owns a single A01 session outside the open/closed guidance panel lifecycle. */
export default function WorkspaceTutor({ work, developmentVoiceCapability }: { work: TutorWork; developmentVoiceCapability?: string }) {
  const account = useWorkspaceAccount();
  const accountState = useSyncExternalStore(account?.subscribe ?? noSubscribe, account?.getSnapshot ?? noAccount, account?.getSnapshot ?? noAccount);
  const harness = process.env.NODE_ENV === "development" && !!developmentVoiceCapability;
  const voiceAvailable = process.env.NODE_ENV === "development" && (harness || (!!accountState?.sessionId && !accountState.busy && !accountState.error));
  const [session] = useState(() => createVoiceSession({
    createConnection: () => createSdkVoiceConnection(),
    credentialProvider: harness ? createCredentialProvider({ "X-Newton-Voice-Dev": developmentVoiceCapability! }) : undefined,
  }));
  useEffect(() => account?.registerStop(() => session.stop()), [account, session]);
  const voice = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  // The student's chosen problem. Submitted equations must start from it; another written problem is never adopted silently.
  const [problem, setProblem] = useState(PRACTICE_EXPRESSION);
  const workKey = JSON.stringify([work.revisionId, work.source, work.expression, work.inputError, problem]);
  const [feedback, setFeedback] = useState<{ key: string; result: DistributionCheck; showHint: boolean; delivery: string } | null>(null);
  const spokenHint = useRef<string | null>(null);
  const current = feedback?.key === workKey ? feedback : null;
  const checkable = work.source === "expression" || work.source === "handwriting";
  const submissionSource = work.source === "handwriting" ? "confirmed_handwriting" : "structured_input";
  const context = useMemo<TutoringContext>(() => current && checkable && !work.inputError
    ? submittedContext(work.revisionId, current.result, submissionSource)
    : { revisionId: work.revisionId, problem, submission: null },
  [current, checkable, submissionSource, work.revisionId, work.inputError, problem]);
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
    const result = !checkable
      ? unsupportedWork("", "Your whiteboard hasn't been read yet. Choose Read handwriting on the whiteboard and confirm the transcription, or use Structured input.", problem)
      : work.inputError ? unsupportedWork("", work.inputError, problem) : checkDistribution(work.expression, problem);
    if (showHint && spokenHint.current === workKey) return;
    const nextContext = checkable && !work.inputError
      ? submittedContext(work.revisionId, result, submissionSource)
      : { revisionId: work.revisionId, problem, submission: null };
    // Install context silently even for Check work, so microphone requests know it.
    const delivery = session.updateContext(nextContext);
    const next = { key: workKey, result, showHint, delivery: "" };
    setFeedback(next);
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

  function startVoice() {
    if (!voiceAvailable) return;
    const currentAccount = account?.getSnapshot();
    const sessionId = harness ? "local-study-test" : currentAccount?.sessionId;
    if (!sessionId || (!harness && (currentAccount?.busy || currentAccount?.error))) return;
    void session.updateContext(context);
    void session.start({ sessionId }).catch(() => {});
  }

  return <TutorLauncher indicator={voice.state === "error" ? "error" : current?.result.status === "incorrect" ? "question" : "idle"}
    controls={<TutorControls voice={voice} voiceAvailable={voiceAvailable} feedback={current} problem={problem} onProblemChange={setProblem}
      onStart={startVoice}
      onStop={() => { spokenHint.current = null; void session.stop(); }} onInterrupt={() => session.interrupt()}
      onCheck={() => check(false)} onHint={() => check(true)} />} />;
}

const noSubscribe = () => () => {};
const noAccount = () => null;
