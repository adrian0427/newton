export default function TutorControls() {
  return <section className="workspace-panel" aria-labelledby="tutor-title">
    <div className="panel-heading"><span className="panel-symbol" aria-hidden="true">n</span><h2 id="tutor-title">Your thinking partner</h2></div>
    <span className="connection-label">Tutor unavailable</span>
    <p>Keep exploring at your own pace. Voice and guidance will be available when tutoring services are connected.</p>
    <button className="workspace-button" type="button" disabled aria-describedby="tutor-note">Start voice</button>
    <button className="workspace-button secondary" type="button" disabled aria-describedby="tutor-note">Ask for a hint</button>
    <p id="tutor-note" className="helper">No microphone is active. Help will be student-requested by default.</p>
  </section>;
}
