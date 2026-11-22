using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Vexta.Api.Common;
using Vexta.Api.Domain;

namespace Vexta.Api.Auth;

public interface ITokenService
{
    // impersonatedTenantId scopes a super admin's token to one tenant: the EF query filters and
    // every controller read it from the tenant_id claim, so the whole tenant app works as-is.
    string CreateAccessToken(ApplicationUser user, Guid? impersonatedTenantId = null);

    /// <summary>
    /// The token for a space the person belongs to. The role comes from the membership, not from
    /// the account: the same person owns their personal space and is an employee of the company
    /// they work for, and a token that carried the account's role would hand them the wrong one
    /// in one of the two.
    /// </summary>
    string CreateAccessToken(ApplicationUser user, TenantMembership membership);
}

public class TokenService(IOptions<JwtOptions> options) : ITokenService
{
    private readonly JwtOptions _options = options.Value;

    public string CreateAccessToken(ApplicationUser user, TenantMembership membership) =>
        Write(user, membership.Role, membership.TenantId, impersonating: false);

    public string CreateAccessToken(ApplicationUser user, Guid? impersonatedTenantId = null)
    {
        var tenantId = impersonatedTenantId ?? user.TenantId;
        return Write(user, user.Role, tenantId, impersonating: impersonatedTenantId is not null);
    }

    private string Write(ApplicationUser user, UserRole role, Guid? tenantId, bool impersonating)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new(VextaClaimTypes.Role, role.ToString()),
            new(ClaimTypes.Role, role.ToString()),
            new("name", $"{user.FirstName} {user.LastName}")
        };

        if (tenantId is { } id)
        {
            claims.Add(new Claim(VextaClaimTypes.TenantId, id.ToString()));
        }

        if (impersonating)
        {
            claims.Add(new Claim(VextaClaimTypes.Impersonating, "true"));
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_options.AccessTokenMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
