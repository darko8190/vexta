using System.Security.Cryptography;
using System.Text;

namespace Vexta.Api.Services;

/// <summary>
/// The invitation token, shared by every kind of access: an employee, a client, a contact at a
/// client. One implementation because the rule is the same for all three — the raw token is
/// shown once and only its hash is kept, so a leaked database hands out no working links.
/// </summary>
public static class InvitationToken
{
    /// <summary>
    /// Long enough that a person can be reached on a weekend, short enough that a link forwarded
    /// into a mailing list stops working before anyone finds it.
    /// </summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public static string Create() => Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
