import type { HistoryState, SaveState } from "@/lib/learning/tutoring-memory";
export default function LearningMemoryStatus({active,history,save,onRetrySave,onRetryHistory}:{
  active:boolean;history:HistoryState;save:SaveState;onRetrySave():void;onRetryHistory():void;
}){
  if(!active)return <p className="helper">Sign in and start a study session to save checked observations and load previous learning history.</p>;
  return <section aria-label="Learning history" className="learning-memory">
    <h3>Learning history</h3>
    {history.status==="loading"&&<p role="status">Loading previous observations…</p>}
    {history.status==="ready"&&<p role="status">{history.count?`${history.count} previous learning observation${history.count===1?"":"s"} loaded for this session.`:"No previous learning observations yet."}</p>}
    {history.status==="failed"&&<><p role="status">Previous learning history could not be loaded. Tutoring can continue without it.</p><button className="small-button" onClick={onRetryHistory}>Retry history</button></>}
    {save.status==="saving"&&<p role="status">Saving learning observation…</p>}
    {save.status==="saved"&&<p role="status">Learning observation saved for later sessions.</p>}
    {save.status==="not-saved"&&<p role="status">This work is outside the supported check; no learning observation was saved.</p>}
    {save.status==="failed"&&<><p role="alert">{save.message}</p>{save.retryable&&<button className="small-button" onClick={onRetrySave}>Retry saving observation</button>}</>}
  </section>;
}
