import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";
import AppleLogo from "@/components/AppleLogo";
import { InkBackground } from "@/components/auth/InkBackground";
import "@/components/auth/sign-in.css";

export function SignInScreen({ oauthFailed = false }: { oauthFailed?: boolean }) {
  return (
    <main className="sign-in-scene">
      <InkBackground />
      <section className="sign-in-content" aria-labelledby="sign-in-title">
        <Link href="/" className="sign-in-logo" aria-label="Newton home"><AppleLogo size={88} /></Link>
        <h1 id="sign-in-title" className="sr-only">Sign in to Newton</h1>
        <p className="sign-in-tagline">Space to think.</p>
        <SignInForm oauthFailed={oauthFailed} />
        <Link href="/study" className="sign-in-workspace">Try the workspace <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  );
}
