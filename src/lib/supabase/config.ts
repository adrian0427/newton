export class SupabaseConfigurationError extends Error {
  readonly status = 503;

  constructor() {
    super("Supabase is not configured. Set the project URL and publishable key in .env.local.");
    this.name = "SupabaseConfigurationError";
  }
}

// Read lazily so importing a helper never makes the homepage require credentials.
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) throw new SupabaseConfigurationError();

  return { url, publishableKey };
}
