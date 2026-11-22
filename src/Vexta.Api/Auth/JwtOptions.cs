namespace Vexta.Api.Auth;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    public required string Issuer { get; set; }
    public required string Audience { get; set; }
    public required string SigningKey { get; set; }
    /// <summary>
    /// How long a token stays good without being used. It is long on purpose: there is no
    /// refresh token, so this single number is the whole session, and a short one meant signing
    /// in every morning — on a phone, where the app is opened for one quick look, that was the
    /// loudest complaint about Vexta. AuthController.Me slides it forward while the app is in
    /// use, so the window is an *idle* window: thirty days without opening Vexta, not thirty
    /// days total.
    ///
    /// The cost of the choice, stated plainly: nothing can revoke a token today, so a lost
    /// phone keeps its access until this runs out. Shortening it is one number here and
    /// SESSION_MAX_AGE_SECONDS in web/src/lib/session.ts, which must stay in step.
    /// </summary>
    public int AccessTokenMinutes { get; set; } = 60 * 24 * 30;
}
