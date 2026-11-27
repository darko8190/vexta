namespace Vexta.Api.Domain;

public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Slug { get; set; }

    public TenantKind Kind { get; set; } = TenantKind.Business;

    /// <summary>The plan this space signed up for. Null for a free personal space.</summary>
    public Guid? PlanId { get; set; }
    public Plan? Plan { get; set; }

    public TenantSubscriptionStatus SubscriptionStatus { get; set; } = TenantSubscriptionStatus.Incomplete;
    public string? StripeCustomerId { get; set; }
    public string? StripeSubscriptionId { get; set; }
    public DateTimeOffset? CurrentPeriodEnd { get; set; }

    /// <summary>
    /// When the free trial runs out, for a space that opened on a plan offering one. Null for
    /// everyone else, including a company that has since subscribed — paying ends the trial, and
    /// a date left behind would make a paid-up space look like it is about to expire.
    /// </summary>
    public DateTimeOffset? TrialEndsAt { get; set; }

    /// <summary>
    /// The company asked to stop. Stripe keeps the subscription running to the end of the
    /// period already paid for, so the space stays open until <see cref="CurrentPeriodEnd"/>
    /// and then lapses on its own.
    ///
    /// Stored here as well as in Stripe because this is what the settings screen reads: asking
    /// Stripe on every page load would make an unsubscribe button that sometimes says nothing
    /// happened, and the webhook keeps the two in step.
    /// </summary>
    public bool CancelAtPeriodEnd { get; set; }

    // ---- The company's own Stripe account, for charging its own customers ----
    //
    // Nothing above this line is about this. StripeCustomerId and StripeSubscriptionId are the
    // company paying Vexta; the four below are the company being paid, through a connected
    // account of its own that Vexta never holds the money in. Keeping both on one row is
    // deliberate — they are both "this company's relationship with Stripe" — but they are read
    // by different code and must never be confused: charging a customer with the subscription
    // id would be billing the wrong party entirely.

    /// <summary>
    /// The connected account, <c>acct_…</c>, or null for a company that has never started.
    ///
    /// Set the moment the account is created at Stripe, before any of the onboarding is done:
    /// an account that exists but is not usable yet is exactly the state the company is in
    /// while it fills Stripe's forms, and losing the id would make it start over.
    /// </summary>
    public string? StripeAccountId { get; set; }

    /// <summary>
    /// Stripe says this account may take card payments. The only flag that decides whether a
    /// payment link goes out, because it is the only one that answers "will the money arrive".
    ///
    /// Stripe's answer, cached. Asking Stripe on every invoice send would make sending depend
    /// on their API being up, and the webhook keeps this in step.
    /// </summary>
    public bool StripeChargesEnabled { get; set; }

    /// <summary>
    /// Stripe may pay out to the company's bank. Shown, never enforced: an account can take
    /// payments before payouts are released, and refusing to collect in the meantime would
    /// hold up money that is already the company's.
    /// </summary>
    public bool StripePayoutsEnabled { get; set; }

    /// <summary>
    /// The company finished Stripe's forms. Distinguishes "has not started" from "started and
    /// Stripe is still reviewing", which are the same thing to <see cref="StripeChargesEnabled"/>
    /// and completely different things to say to somebody.
    /// </summary>
    public bool StripeDetailsSubmitted { get; set; }

    /// <summary>When the three flags above were last taken from Stripe.</summary>
    public DateTimeOffset? StripeAccountCheckedAt { get; set; }

    // ---- The company's own PayPal Business account, for charging its own customers ----

    /// <summary>The REST app's client id, from developer.paypal.com. Null when not connected.</summary>
    public string? PayPalClientId { get; set; }

    /// <summary>The REST app's secret, encrypted. Never sent back to the browser.</summary>
    public string? PayPalSecretProtected { get; set; }

    /// <summary>The sandbox (test) environment rather than live payments.</summary>
    public bool PayPalSandbox { get; set; }

    // ---- The company's own profile, shown on its documents and filled in by its owner ----

    public string? Description { get; set; }
    public string? ContactEmail { get; set; }
    public string? Phone { get; set; }

    /// <summary>
    /// The company's registration number -- the NEQ in Québec, a BN elsewhere.
    ///
    /// Asked for at sign-up but never required. A company registers before it has the number in
    /// hand, and a sole proprietor operating under their own name never gets one at all: making
    /// it mandatory would be refusing the account of somebody who is perfectly legitimate.
    /// </summary>
    public string? BusinessNumber { get; set; }

    /// <summary>
    /// The company's own colour, as #RRGGBB, or null to keep Vexta's blue.
    ///
    /// One colour rather than a palette: it is the only one a company can choose without being
    /// able to produce something unreadable. Every other shade the application and the invoices
    /// use — the hover state, the focus ring, the dark theme's lighter variant, the band at the
    /// top of a PDF — is derived from it, so contrast stays correct by construction.
    /// </summary>
    public string? BrandColor { get; set; }

    public TenantLogo? Logo { get; set; }

    /// <summary>
    /// When the company's starting forms were made, or null if they have not been yet. A flag
    /// rather than a lookup so that a form the company deleted stays deleted — see BaseForms.
    /// </summary>
    public DateTimeOffset? BaseFormsCreatedAt { get; set; }

    /// <summary>
    /// Where the owner is in the setup guide: the answers given and the steps gone through, as
    /// the JSON the screen writes. Opaque to the server, which only keeps it, so a step added to
    /// the guide later needs no migration. Null until the guide is first opened.
    /// </summary>
    public string? SetupGuide { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ApplicationUser> Users { get; set; } = [];
    public List<Client> Clients { get; set; } = [];
}
