"use client";
import { Component, type ReactNode } from "react";

export default class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="board-loading" role="alert"><p>The whiteboard could not load. You can still use structured input.</p><button className="workspace-button" type="button" onClick={() => this.setState({ failed: false })}>Retry whiteboard</button></div>;
    return this.props.children;
  }
}
