using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Common;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireActiveSubscriptionAttribute : TypeFilterAttribute
{
    public RequireActiveSubscriptionAttribute() : base(typeof(RequireActiveSubscriptionFilter))
    {
    }
}

public class RequireActiveSubscriptionFilter(ICurrentUserService currentUser, VextaDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (currentUser.IsSuperAdmin)
        {
            // A super admin reaches tenant modules only by entering a tenant: without a tenant in
            // the token there is nothing to scope the request to. Once inside, the subscription
            // gate is skipped so a past-due tenant stays inspectable.
            if (!currentUser.IsImpersonating)
            {
                context.Result = new ObjectResult(new { message = "Entrez dans un locataire pour accéder à ce module." })
                {
                    StatusCode = StatusCodes.Status403Forbidden
                };
                return;
            }

            await next();
            return;
        }

        if (currentUser.TenantId is null)
        {
            await next();
            return;
        }

        var status = await db.Tenants
            .Where(t => t.Id == currentUser.TenantId)
            .Select(t => t.SubscriptionStatus)
            .FirstOrDefaultAsync();

        if (status != TenantSubscriptionStatus.Active)
        {
            context.Result = new ObjectResult(new { message = "Abonnement requis pour accéder à ce module." })
            {
                StatusCode = StatusCodes.Status402PaymentRequired
            };
            return;
        }

        await next();
    }
}
