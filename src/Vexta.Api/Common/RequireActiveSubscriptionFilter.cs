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

        var tenant = await db.Tenants
            .Where(t => t.Id == currentUser.TenantId)
            .Select(t => new { t.Kind, t.SubscriptionStatus, t.TrialEndsAt })
            .FirstOrDefaultAsync();

        // A personal space is free and never carries a Stripe subscription, so there is nothing
        // here to check.
        if (tenant?.Kind == TenantKind.Personal)
        {
            await next();
            return;
        }

        // A trial is as good as a subscription until the day it is not. Checked against the
        // date rather than trusting the status, because nothing sweeps expired trials: the row
        // still says Trialing the morning after, and a status nobody re-reads would hand out a
        // free space forever.
        var trialing = tenant?.SubscriptionStatus == TenantSubscriptionStatus.Trialing
            && tenant.TrialEndsAt > DateTimeOffset.UtcNow;

        if (tenant?.SubscriptionStatus != TenantSubscriptionStatus.Active && !trialing)
        {
            context.Result = new ObjectResult(new
            {
                message = tenant?.SubscriptionStatus == TenantSubscriptionStatus.Trialing
                    ? "Votre essai gratuit est terminé. Abonnez-vous depuis Paramètres pour continuer."
                    : "Abonnement requis pour accéder à ce module."
            })
            {
                StatusCode = StatusCodes.Status402PaymentRequired
            };
            return;
        }

        await next();
    }
}
