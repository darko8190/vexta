using Vexta.Api.Domain;

namespace Vexta.Api.Common;

/// <summary>
/// Whether a company's public side is up: a paid subscription, or a free trial that has not
/// ended. A company in its trial has to be able to try its public page, forms and shop too —
/// the trial is for trying the product, and the public page is part of it.
/// </summary>
public static class TenantLive
{
    public static bool IsLive(TenantSubscriptionStatus status, DateTimeOffset? trialEndsAt) =>
        status == TenantSubscriptionStatus.Active
        || (status == TenantSubscriptionStatus.Trialing && trialEndsAt > DateTimeOffset.UtcNow);
}
