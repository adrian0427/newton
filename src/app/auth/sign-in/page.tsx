import { SignInScreen } from "@/components/auth/SignInScreen";

export const metadata = { title: "Sign in | Newton", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ oauth?: string }> }) {
  return <SignInScreen oauthFailed={(await searchParams).oauth === "failed"} />;
}
