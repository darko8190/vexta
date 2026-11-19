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
}

public class TokenService(IOptions<JwtOptions> options) : ITokenService
{
    private readonly JwtOptions _options = options.Value;

    public string CreateAccessToken(ApplicationUser user, Guid? impersonatedTenantId = null)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new(VextaClaimTypes.Role, user.Role.ToString()),
            new(ClaimTypes.Role, user.Role.ToString()),
            new("name", $"{user.FirstName} {user.LastName}")
        };

        if (impersonatedTenantId is { } impersonated)
        {
            claims.Add(new Claim(VextaClaimTypes.TenantId, impersonated.ToString()));
            claims.Add(new Claim(VextaClaimTypes.Impersonating, "true"));
        }
        else if (user.TenantId is { } tenantId)
        {
            claims.Add(new Claim(VextaClaimTypes.TenantId, tenantId.ToString()));
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
