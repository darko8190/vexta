using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Common;

/// <summary>
/// Creating records is reserved for business spaces. A personal space is free, so it reads but
/// does not fill up. Applied per action rather than per controller: reading stays open.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireBusinessTenantAttribute : TypeFilterAttribute
{
    public RequireBusinessTenantAttribute() : base(typeof(RequireBusinessTenantFilter))
    {
    }
}

public class RequireBusinessTenantFilter(ICurrentUserService currentUser, VextaDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        // A super admin outside a tenant never gets this far — RequireActiveSubscription stops
        // them first. Inside one, they play by that tenant's rules.
        if (currentUser.TenantId is not { } tenantId)
        {
            await next();
            return;
        }

        var kind = await db.Tenants
            .IgnoreQueryFilters()
            .Where(t => t.Id == tenantId)
            .Select(t => t.Kind)
            .FirstOrDefaultAsync();

        if (kind == TenantKind.Personal)
        {
            context.Result = new ObjectResult(new
            {
                message = "Passez à un compte entreprise pour créer des fiches."
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        await next();
    }
}
