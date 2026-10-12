// The dashboard link used in the email. On Vercel, the production domain is
// provided automatically; otherwise fall back to the address of the request.
export function dashboardUrl(req: Request): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return new URL(req.url).origin;
}
