export default function LearningHistory() {
  return <section className="workspace-panel" aria-labelledby="history-title">
    <h2 id="history-title">Your learning trail</h2>
    <span className="connection-label">History not connected</span>
    <p>Saved observations from your practice will appear here once accounts and learning memory are connected.</p>
    <p className="helper">This workspace stays local. No learning history is being saved.</p>
  </section>;
}
