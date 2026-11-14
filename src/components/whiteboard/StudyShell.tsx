import Link from "next/link";
import AppleLogo from "@/components/AppleLogo";
import { WorkspaceSettings } from "@/components/settings/WorkspaceSettings";
import StudentWorkspace from "./StudentWorkspace";
import AccountWorkspace, { WorkspaceAccountProvider } from "./WorkspaceAccount";

/** Shared presentation; only the separately guarded dev page supplies a capability. */
export default function StudyShell({ developmentVoiceCapability }: { developmentVoiceCapability?: string }) {
  const shell = <div className="study-shell">
    <a className="skip-link" href="#study-main">Skip to workspace</a>
    <header className="study-header"><Link className="study-brand" href="/" aria-label="Newton home"><span className="brand-symbol" aria-hidden="true"><AppleLogo /></span><span className="brand-wordmark brand-continuation">ewton!</span></Link><span className="study-header-note">A little space for your own discovery.</span><div className="study-header-actions"><WorkspaceSettings /></div></header>
    <main id="study-main">{developmentVoiceCapability ? <StudentWorkspace developmentVoiceCapability={developmentVoiceCapability} /> : <AccountWorkspace />}</main>
  </div>;
  return developmentVoiceCapability ? shell : <WorkspaceAccountProvider>{shell}</WorkspaceAccountProvider>;
}
