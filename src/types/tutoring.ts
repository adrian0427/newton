/** Shared transport contracts. Validate untrusted payloads at runtime in future handlers. */
export type TutorMode = "student-requested" | "proactive";

export type WorkSnapshot = {
  /** Unique within a study session; create a new ID on every edit, including undo. */
  revisionId: string;
  /** ISO 8601 UTC time; revision identity, not clocks, determines freshness. */
  capturedAt: string;
  structuredExpression?: string;
  /** Transient data URL or short-lived reference. Never persist by default. */
  image?: { kind: "data-url" | "temporary-url"; value: string };
};

type AnalysisContext = {
  sourceRevisionId: WorkSnapshot["revisionId"];
  recognizedExpression?: string;
  /** Initial domain: algebra.distributive-property. */
  conceptId: string;
};

/** Uncertain recognition or unsupported verification must not assert a misconception. */
export type WorkAnalysis = AnalysisContext & (
  | {
      correctness: "uncertain";
      confidence: "low" | "unknown";
      suggestedAction: "wait" | "ask-for-clarification";
      misconceptionId?: never;
    }
  | {
      correctness: "correct";
      confidence: "medium" | "high";
      suggestedAction: "wait" | "acknowledge-progress";
      misconceptionId?: never;
    }
  | {
      correctness: "incorrect";
      confidence: "medium" | "high";
      suggestedAction: "wait" | "ask-guiding-question";
      misconceptionId?: string;
    }
);

export type LearningEventInput = {
  sessionId: string;
  sourceRevisionId: WorkSnapshot["revisionId"];
  conceptId: string;
  misconceptionId?: string;
  outcome: "practiced" | "misconception-observed" | "self-corrected" | "corrected-with-guidance";
  /** Short, factual evidence of this observation; not a transcript or ability rating. */
  evidence: string;
  // Ownership and timestamps are assigned by the authenticated server.
};
