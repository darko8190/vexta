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

/// <summary>
/// What a company must say about itself to open a space: where it is, and its registration
/// number when it has one.
///
/// The address is required for a company and absent for a personal space. A company invoices,
/// and an invoice without the issuer's address on it is not a document anybody can use -- so it
/// is collected once at sign-up rather than left for a settings page nobody visits until the
/// first invoice is already going out wrong.
/// </summary>
public record CompanySignupProfile(
    string Line1,
    string? Line2,
    string City,
    string? Province,
    string PostalCode,
    string Country,
    string? BusinessNumber);

/// <summary>
/// A company opened by somebody who already has an account. Carries the new company so the
/// browser can switch into it, and a checkout address when the plan has to be paid first.
/// </summary>
public record CompanyCreationResult(bool Succeeded, Guid? TenantId = null, string? CheckoutUrl = null, string? Error = null)
{
    public static CompanyCreationResult Failed(string error) => new(false, Error: error);
}

public interface ITenantSignupService
{
    /// <summary>
    /// Opens a company for an account that already exists — somebody in their personal space
    /// starting a business of their own. The same company a sign-up makes (address, first
    /// location, the founder on staff, a plan and its trial or its checkout), without making
    /// a second account: the company is added to their space switcher beside the ones they have.
    /// </summary>
    Task<CompanyCreationResult> CreateForExistingUserAsync(
        ApplicationUser user,
        string companyName,
        Guid? planId,
        CompanySignupProfile? profile,
        CancellationToken ct = default);

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
        CompanySignupProfile? profile = null,
        CancellationToken ct = default);
}

public class TenantSignupService(
    UserManager<ApplicationUser> userManager,
    VextaDbContext db,
    IStripeService stripeService,
    ISupplierLinkService supplierLinks,
    IConfiguration configuration,
    ILogger<TenantSignupService> logger) : ITenantSignupService
{
    public async Task<CompanyCreationResult> CreateForExistingUserAsync(
        ApplicationUser user,
        string companyName,
        Guid? planId,
        CompanySignupProfile? profile,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(companyName)) return CompanyCreationResult.Failed("Le nom de l'entreprise est requis.");
        if (companyName.Trim().Length > 200) return CompanyCreationResult.Failed("Le nom de l'entreprise est trop long.");

        if (profile is null
            || string.IsNullOrWhiteSpace(profile.Line1)
            || string.IsNullOrWhiteSpace(profile.City)
            || string.IsNullOrWhiteSpace(profile.PostalCode)
            || string.IsNullOrWhiteSpace(profile.Country))
        {
            return CompanyCreationResult.Failed("L'adresse de l'entreprise est requise.");
        }

        var plan = await db.Plans.FirstOrDefaultAsync(
            p => p.Id == planId && p.IsPublished && p.StripePriceId != null, ct);

        if (plan is null) return CompanyCreationResult.Failed("Ce forfait n'est plus offert. Choisissez-en un autre.");

        var slug = await TenantSlug.UniqueAsync(
            companyName,
            candidate => db.Tenants.AnyAsync(t => t.Slug == candidate, ct));

        var tenant = new Tenant
        {
            Name = companyName.Trim(),
            Slug = slug,
            Kind = TenantKind.Business,
            PlanId = plan.Id,
            BusinessNumber = Trimmed(profile.BusinessNumber)
        };

        if (plan.TrialDays > 0)
        {
            tenant.SubscriptionStatus = TenantSubscriptionStatus.Trialing;
            tenant.TrialEndsAt = DateTimeOffset.UtcNow.AddDays(plan.TrialDays);
        }

        db.Tenants.Add(tenant);

        db.CompanyLocations.Add(new CompanyLocation
        {
            TenantId = tenant.Id,
            Label = "Siège social",
            IsPrimary = true,
            Line1 = profile.Line1.Trim(),
            Line2 = Trimmed(profile.Line2),
            City = profile.City.Trim(),
            Province = Trimmed(profile.Province),
            PostalCode = profile.PostalCode.Trim(),
            Country = profile.Country.Trim()
        });

        // A membership, not a move: their home stays where it is, and the company joins the
        // spaces they can switch to. Administrator of it, because it is theirs.
        db.TenantMemberships.Add(new TenantMembership
        {
            UserId = user.Id,
            TenantId = tenant.Id,
            Role = UserRole.TenantAdmin
        });

        // On their own staff list, like a founder who signed up — see CreateAsync.
        db.Employees.Add(new Employee
        {
            TenantId = tenant.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = (user.Email ?? "").ToLowerInvariant(),
            Role = UserRole.TenantAdmin,
            UserId = user.Id
        });

        await db.SaveChangesAsync(ct);

        await supplierLinks.LinkOnSignupAsync(tenant.Id, ct);

        if (tenant.SubscriptionStatus == TenantSubscriptionStatus.Trialing)
        {
            return new CompanyCreationResult(true, tenant.Id);
        }

        var frontendUrl = configuration["Frontend:BaseUrl"] ?? "http://localhost:3000";
        try
        {
            var checkoutUrl = await stripeService.CreateCheckoutSessionAsync(
                tenant,
                user.Email!,
                plan.StripePriceId!,
                successUrl: $"{frontendUrl}/inscription/succes?session_id={{CHECKOUT_SESSION_ID}}",
                cancelUrl: $"{frontendUrl}/mes-entreprises",
                couponId: plan.StripeCouponId,
                ct: ct);

            return new CompanyCreationResult(true, tenant.Id, checkoutUrl);
        }
        catch (InvalidOperationException ex)
        {
            // Same reasoning as a sign-up: the company exists now, and the subscription gate
            // keeps its modules shut until it is paid from Paramètres.
            logger.LogError(ex, "Stripe indisponible à la création de {Tenant}; entreprise créée sans paiement.", tenant.Slug);
            return new CompanyCreationResult(true, tenant.Id);
        }
    }

    /// <summary>An empty box and an absent answer are the same thing here.</summary>
    private static string? Trimmed(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public async Task<TenantSignupResult> CreateAsync(
        string spaceName,
        TenantKind kind,
        Guid? planId,
        string firstName,
        string lastName,
        string email,
        string? password,
        UserLoginInfo? externalLogin,
        CompanySignupProfile? profile = null,
        CancellationToken ct = default)
    {
        email = email.Trim();

        // A personal space takes the person's name when none was given. The browser works this
        // out too, but the endpoint is reachable without it, and a blank name produced a tenant
        // with no name at all and a random slug -- a record nobody can recognise, at a public
        // address nobody can read.
        if (string.IsNullOrWhiteSpace(spaceName) && kind == TenantKind.Personal)
        {
            spaceName = $"{firstName} {lastName}".Trim();
        }

        if (string.IsNullOrWhiteSpace(spaceName))
        {
            return TenantSignupResult.Failed("Le nom de l'espace est requis.");
        }

        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return TenantSignupResult.Failed("Un compte existe déjà avec ce courriel.");
        }

        // Checked before the account is made rather than after: a tenant and a user created
        // and then abandoned because the address was missing would hold the email address
        // hostage, and the second attempt would be told the account already exists.
        if (kind == TenantKind.Business)
        {
            if (profile is null
                || string.IsNullOrWhiteSpace(profile.Line1)
                || string.IsNullOrWhiteSpace(profile.City)
                || string.IsNullOrWhiteSpace(profile.PostalCode)
                || string.IsNullOrWhiteSpace(profile.Country))
            {
                return TenantSignupResult.Failed("L'adresse de l'entreprise est requise.");
            }
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
        var tenant = new Tenant
        {
            Name = spaceName.Trim(),
            Slug = slug,
            Kind = kind,
            PlanId = plan?.Id,
            BusinessNumber = Trimmed(profile?.BusinessNumber)
        };

        // A plan that grants a trial opens the space on it: no Stripe customer, no checkout, no
        // card. The banner in the header counts the days down and sends them to Paramètres to
        // subscribe when they are ready.
        if (plan is { TrialDays: > 0 })
        {
            tenant.SubscriptionStatus = TenantSubscriptionStatus.Trialing;
            tenant.TrialEndsAt = DateTimeOffset.UtcNow.AddDays(plan.TrialDays);
        }
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

        if (kind == TenantKind.Business && profile is not null)
        {
            // The address becomes the company's first location, flagged primary, rather than a
            // set of columns on the tenant. There is already one place in the model for "a place
            // the company occupies", and a second one would mean two answers to what goes at the
            // top of an invoice.
            db.CompanyLocations.Add(new CompanyLocation
            {
                TenantId = tenant.Id,
                Label = "Siège social",
                IsPrimary = true,
                Line1 = profile.Line1.Trim(),
                Line2 = Trimmed(profile.Line2),
                City = profile.City.Trim(),
                Province = Trimmed(profile.Province),
                PostalCode = profile.PostalCode.Trim(),
                Country = profile.Country.Trim()
            });
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

        // After the account exists and is saved, never as part of it. This looks outside the new
        // company -- into the supplier lists its future customers keep -- and it must not be able
        // to cost somebody their sign-up. It swallows its own failures and returns zero.
        if (kind == TenantKind.Business)
        {
            await supplierLinks.LinkOnSignupAsync(tenant.Id, ct);
        }

        if (kind == TenantKind.Personal)
        {
            // Free: no Stripe customer, no checkout, nothing to pay. The caller signs them in.
            user.Tenant = tenant;
            return TenantSignupResult.Free(user);
        }

        user.Tenant = tenant;

        // Already inside a trial: nothing to pay today, so nothing to send them to Stripe for.
        if (tenant.SubscriptionStatus == TenantSubscriptionStatus.Trialing)
        {
            return TenantSignupResult.Free(user);
        }

        var frontendUrl = configuration["Frontend:BaseUrl"] ?? "http://localhost:3000";
        try
        {
            var checkoutUrl = await stripeService.CreateCheckoutSessionAsync(
                tenant,
                user.Email!,
                plan!.StripePriceId!,
                successUrl: $"{frontendUrl}/inscription/succes?session_id={{CHECKOUT_SESSION_ID}}",
                cancelUrl: $"{frontendUrl}/inscription/annule",
                couponId: plan!.StripeCouponId,
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
