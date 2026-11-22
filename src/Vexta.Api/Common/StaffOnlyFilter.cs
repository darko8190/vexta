using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Vexta.Api.Domain;

namespace Vexta.Api.Common;

/// <summary>
/// Closes a module to customers. The query filters already confine a signed-in client to their
/// own records, so nothing here leaks another client's data — but a customer has no business in
/// the client directory, in human resources or in the company's own card, and an empty-looking
/// module is a worse answer than a clear refusal.
///
/// Denied by role rather than by listing who is allowed: a role added later is staff until
/// someone says otherwise, and the one role that must be fenced in is named right here.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class StaffOnlyAttribute : TypeFilterAttribute
{
    public StaffOnlyAttribute() : base(typeof(StaffOnlyFilter))
    {
    }
}

public class StaffOnlyFilter(ICurrentUserService currentUser) : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (currentUser.Role != UserRole.Client) return;

        context.Result = new ObjectResult(new { message = "Ce module est réservé à l'équipe de l'entreprise." })
        {
            StatusCode = StatusCodes.Status403Forbidden
        };
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
    }
}
