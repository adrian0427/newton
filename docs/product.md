# Newton product brief

## Mission and audience

Make personalized academic support affordable and accessible to high-school students in grades 9–12, especially those without private tutoring or individualized guidance. Students need help understanding their own steps, not just receiving a finished answer.

Twofold is the three-developer team; Newton is the product and tutor name. Our motivation is to reduce the gap between having a question and receiving patient, contextual support. This is our product intent, not a claim of demonstrated learning outcomes or a personal founder biography. Newton should be modern and approachable, never an imitation of Isaac Newton.

## Experience and differentiation

A student opens a workspace, works on a whiteboard, and speaks naturally with Newton. The tutor can observe completed work, ask a guiding question, and yield when interrupted. Structured mathematical input provides an alternative when handwriting is unclear. Proactive assistance is optional and respects thinking time.

The differentiator is **work-aware tutoring plus persistent, evidence-backed memory**. A traditional prompt-and-answer chatbot lacks this shared view of the student's working process. Newton should participate in that process while leaving discovery to the student. Memory records what happened in context; it does not label ability or assume mastery from one success or mistake.

## Hackathon MVP

For the Cal Poly AI Hackathon, November 13–15, 2026, and its OpenAI Challenge, demonstrate one coherent Algebra I distributive-property journey:

1. The student starts `2(x + 3) = 14` and writes `2x + 3 = 14`.
2. After a pause, Newton captures a versioned snapshot and interprets the completed step.
3. Supported math verification identifies incorrect distribution; unclear input instead prompts clarification.
4. If intervention is appropriate, Newton asks, “When you expanded the parentheses, what happened to the 2 outside?”
5. The student responds by voice and can interrupt Newton naturally.
6. The student corrects the work to `2x + 6 = 14`.
7. Newton records a short observation tied to the work and session, including whether guidance was needed.
8. A later session retrieves that evidence to adapt a follow-up problem.

Prefer student-requested assistance by default until proactive timing has been evaluated. Avoid repeated hints, speech over the student, or hints based on stale work.

## Success criteria

- A demonstrator completes the scenario with real voice, real work capture, and supported mathematical verification.
- Voice starts and stops cleanly, interruption cancels tutor speech, and disconnects are recoverable.
- New edits invalidate earlier analysis; uncertainty never becomes a confident correction.
- A correction creates factual learning evidence retrievable in a later session.
- A second test account cannot read or modify the first account's learning records.
- Students can choose when assistance happens; the demo shows reasoning support without immediately giving the solution.

These are feature acceptance goals. The present scaffold delivers only the homepage, contracts, development conventions, and validation infrastructure.

## Non-goals

No full high-school curriculum, animated avatars, payments, teacher dashboards, native mobile apps, fully local inference, complex recommendations, analytics platform, vector database, custom MCP infrastructure, or multi-agent orchestration. No claim that the prototype measures mastery or is ready for unsupervised deployment to minors.

## Longer-term direction

Expand to more concepts after validating the tutoring loop. Improve accessible input methods, student control over memory, and contextual practice across sessions. Evaluate usefulness, affordability, and interruption timing with appropriate feedback before broadening scope.
