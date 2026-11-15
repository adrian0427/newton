import "server-only";
import { BackendError, type AuthContext } from "@/lib/supabase/auth";
import { requireOwnedSession } from "./sessions";
import { recordLearningEvent } from "./events";
import { checkDistribution } from "@/lib/math/check-distribution";

export type SubmittedWork = {sessionId:string;sourceRevisionId:string;source:"structured_input"|"confirmed_handwriting";problem:string;expression:string};
const fields=new Set(["sessionId","sourceRevisionId","source","problem","expression"]);
const uuid=/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
export function validateSubmittedWork(input:unknown):SubmittedWork {
  if(!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).some(key=>!fields.has(key))) throw invalid();
  const value=input as Record<string,unknown>;
  if(typeof value.sessionId!=="string" || !uuid.test(value.sessionId) || typeof value.sourceRevisionId!=="string" || !uuid.test(value.sourceRevisionId)
    || (value.source!=="structured_input" && value.source!=="confirmed_handwriting")
    || typeof value.problem!=="string" || !value.problem.trim() || value.problem.length>100
    || typeof value.expression!=="string" || !value.expression.trim() || value.expression.length>500) throw invalid();
  return {sessionId:value.sessionId,sourceRevisionId:value.sourceRevisionId,source:value.source,problem:value.problem,expression:value.expression};
}
function invalid(){return new BackendError(400,"invalid-input","Submit a typed or confirmed step, active problem, and valid study-session/revision IDs.");}

/** Recheck student-submitted text, not its claimed image provenance. Never accept a client outcome. */
export async function analyzeSubmittedWork(auth:AuthContext,work:SubmittedWork){
  await requireOwnedSession(auth,work.sessionId);
  const analysis=checkDistribution(work.expression,work.problem);
  if(analysis.status==="unsupported") return {analysis,memory:{status:"not-saved" as const,reason:"unsupported"}};
  const missed=analysis.misconceptionId==="distribution.missed-term";
  const finding=missed ? "The outer factor was not applied to each term." : analysis.status==="correct"
    ? "The submitted expansion was equivalent; this is practice, not a mastery assessment." : "The expansion was not equivalent; no supported misconception was identified.";
  // Preserve a small derived observation, not the submitted step, image, or transcript.
  const evidence=`Server check of ${work.source==="confirmed_handwriting"?"student-confirmed transcription":"typed work"} for ${analysis.problem}: ${finding}`;
  try{
    const event=await recordLearningEvent(auth,{sessionId:work.sessionId,sourceRevisionId:work.sourceRevisionId,conceptId:"algebra.distributive-property",
      outcome:missed?"misconception-observed":"practiced",...(missed?{misconceptionId:"distribution.missed-term"}:{}),evidence});
    return {analysis,memory:{status:"saved" as const,eventId:event.id}};
  }catch(error){
    const retryable=!(error instanceof BackendError) || error.status>=500 || error.status===429;
    return {analysis,memory:{status:"failed" as const,retryable,message:retryable
      ?"Your check is ready, but the learning observation could not be saved. Please retry."
      :"This observation could not be saved. Start a new work revision before trying again."}};
  }
}
