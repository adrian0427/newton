import Link from "next/link";
import { AppearanceSettings } from "@/components/appearance/Appearance";
import StudentWorkspace from "./StudentWorkspace";

/** Shared presentation; only the separately guarded dev page supplies a capability. */
export default function StudyShell({ developmentVoiceCapability }: { developmentVoiceCapability?: string }) {
  return <div className="study-shell">
    <a className="skip-link" href="#study-main">Skip to workspace</a>
    <header className="study-header"><Link className="study-brand" href="/" aria-label="Newton home"><span aria-hidden="true">n</span>Newton.</Link><span className="study-header-note">A little space for your own discovery.</span><div className="study-header-actions"><AppearanceSettings /></div></header>
    <main id="study-main"><StudentWorkspace developmentVoiceCapability={developmentVoiceCapability} /></main>
  </div>;
}
