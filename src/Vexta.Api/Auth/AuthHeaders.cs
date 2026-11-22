namespace Vexta.Api.Auth;

public static class AuthHeaders
{
    /// <summary>
    /// Carries a freshly issued token back to the Next.js server, which owns the cookie and is
    /// the only thing that can rewrite it. A header rather than a field on the body: every
    /// caller of /api/auth/me already reads that body's shape, and renewal is not their
    /// business. This travels server to server inside the private network and never reaches a
    /// browser — the Next route builds its own response.
    /// </summary>
    public const string RenewedToken = "x-vexta-renewed-token";
}
