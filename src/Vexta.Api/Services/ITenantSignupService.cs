using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>
/// A business sign-up ends at Stripe, so it carries a CheckoutUrl. A personal one is free and
/// ends signed in, so it carries only the user the caller mints a token for.
/// </summary>
public record TenantSignupResult(
    bool Succeeded,
    ApplicationUser? User = null,
    string? CheckoutUrl = null,
    string? Error = null)
{
    public static TenantSignupResult Paid(ApplicationUser user, string checkoutUrl) =>
        new(true, user, checkoutUrl);

    public static TenantSignupResult Free(ApplicationUser user) => new(true, user);

    public static TenantSignupResult Failed(string error) => new(false, Error: error);
}

public interface ITenantSignupService
{
    /// <summary>
    /// Creates the tenant and its first admin. A business space also gets a Stripe checkout
    /// session for the plan it chose; a personal one is free and never reaches Stripe. Pass a
    /// password for the email form, or an external login for a provider sign-up — never both.
    /// </summary>
    Task<TenantSignupResult> CreateAsync(
        string spaceName,
        TenantKind kind,
        Guid? planId,
        string firstName,
        string lastName,
        string email,
        string? password,
        UserLoginInfo? externalLogin,
        CancellationToken ct = default);
}

public class TenantSignupService(
    UserManager<ApplicationUser> userManager,
    VextaDbContext db,
    IStripeService stripeService,
    IConfiguration configuration,
    ILogger<TenantSignupService> logger) : ITenantSignupService
{
    public async Task<TenantSignupResult> CreateAsync(
        string spaceName,
        TenantKind kind,
        Guid? planId,
        string firstName,
        string lastName,
        string email,
        string? password,
        UserLoginInfo? externalLogin,
        CancellationToken ct = default)
    {
        email = email.Trim();

        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return TenantSignupResult.Failed("Un compte existe déjà avec ce courriel.");
        }

        Plan? plan = null;
        if (kind == TenantKind.Business)
        {
            plan = await db.Plans.FirstOrDefaultAsync(
                p => p.Id == planId && p.IsPublished && p.StripePriceId != null, ct);

            if (plan is null)
            {
                return TenantSignupResult.Failed("Ce forfait n'est plus offert. Choisissez-en un autre.");
            }
        }

        var slug = await TenantSlug.UniqueAsync(
            spaceName,
            candidate => db.Tenants.AnyAsync(t => t.Slug == candidate, ct));

        // SubscriptionStatus is left alone: it describes a Stripe subscription, and a personal
        // space has none. Access is granted on Kind, not by pretending it pays.
        var tenant = new Tenant { Name = spaceName.Trim(), Slug = slug, Kind = kind, PlanId = plan?.Id };
        db.Tenants.Add(tenant);

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FirstName = firstName.Trim(),
            LastName = lastName.Trim(),
            Role = UserRole.TenantAdmin,
            TenantId = tenant.Id,
            // The provider already proved the address; asking the owner to confirm it again
            // would be theatre.
            EmailConfirmed = externalLogin is not null
        };

        var createResult = password is null
            ? await userManager.CreateAsync(user)
            : await userManager.CreateAsync(user, password);

        if (!createResult.Succeeded)
        {
            return TenantSignupResult.Failed(string.Join(" ", createResult.Errors.Select(e => e.Description)));
        }

        if (externalLogin is not null)
        {
            var linkResult = await userManager.AddLoginAsync(user, externalLogin);
            if (!linkResult.Succeeded)
            {
                await userManager.DeleteAsync(user);
                return TenantSignupResult.Failed(string.Join(" ", linkResult.Errors.Select(e => e.Description)));
            }
        }

        if (kind == TenantKind.Business)
        {
            // The person who opened the company works there. Without this row they are absent
            // from their own staff list and cannot be put on a team — which reads as a bug,
            // because the one name everybody expects to find is the owner's.
            db.Employees.Add(new Employee
            {
                TenantId = tenant.Id,
                FirstName = user.FirstName,
                LastName = user.LastName,
                Email = user.Email!.ToLowerInvariant(),
                // The person who opened the company runs it. Their staff record has to say so,
                // or the staff page shows the founder as an ordinary employee.
                Role = UserRole.TenantAdmin,
                UserId = user.Id
            });
        }

        await db.SaveChangesAsync(ct);

        if (kind == TenantKind.Personal)
        {
            // Free: no Stripe customer, no checkout, nothing to pay. The caller signs them in.
            user.Tenant = tenant;
            return TenantSignupResult.Free(user);
        }

        user.Tenant = tenant;

        var frontendUrl = configuration["Frontend:BaseUrl"] ?? "http://localhost:3000";
        try
        {
            var checkoutUrl = await stripeService.CreateCheckoutSessionAsync(
                tenant,
                user.Email!,
                plan!.StripePriceId!,
                successUrl: $"{frontendUrl}/inscription/succes?session_id={{CHECKOUT_SESSION_ID}}",
                cancelUrl: $"{frontendUrl}/inscription/annule",
                ct: ct);

            return TenantSignupResult.Paid(user, checkoutUrl);
        }
        catch (InvalidOperationException ex)
        {
            // The account and tenant are already saved, so failing the request here would strand
            // someone with an address that is taken and no way in. Sign them in instead: the
            // subscription gate keeps the modules shut until they pay from Paramètres.
            logger.LogError(ex, "Stripe indisponible à l'inscription de {Tenant}; compte créé sans paiement.", tenant.Slug);
            return TenantSignupResult.Free(user);
        }
    }
}
