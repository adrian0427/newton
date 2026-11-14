import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata = { title: "Sign in — Newton", robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-10 w-fit text-sm underline underline-offset-4">← Newton home</Link>
      <h1 className="text-4xl font-medium tracking-tight">Sign in to Newton</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">Use a test account provided by your team. Registration is not available yet.</p>
      <SignInForm />
    </main>
  );
}
