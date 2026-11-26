namespace Vexta.Api.Domain;

/// <summary>
/// Something a plan switches on that is not a tab.
///
/// A <see cref="Module"/> answers "what does this company see in its menu"; a feature answers
/// "what is this company allowed to do inside it". Reading a receipt with a model and talking
/// to an assistant are both bought rather than given — they cost money per use and they are the
/// kind of thing a cheap tier should be able to leave out without losing a screen.
///
/// The key, not the name, is what the code checks. A super admin may rename "Assistant IA" to
/// whatever their marketing says this quarter without turning the assistant off for everyone.
/// </summary>
public class Feature
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Lowercase and stable, such as <c>ocr</c>. Unique across the platform, and the only part
    /// of this row the application is allowed to depend on.
    /// </summary>
    public required string Key { get; set; }

    public required string Name { get; set; }
    public required string Description { get; set; }

    /// <summary>A name from <see cref="ModuleIcons"/>, so features and modules draw the same way.</summary>
    public required string Icon { get; set; }

    public int SortOrder { get; set; }

    /// <summary>Shown on the public pricing page. A feature can exist and be sold quietly.</summary>
    public bool IsPublished { get; set; } = true;

    /// <summary>
    /// True for the two Vexta ships with. Such a row may be renamed and re-described, but not
    /// deleted: the code checks its key, so losing it would turn a feature off everywhere with
    /// no way to put it back short of a migration.
    /// </summary>
    public bool IsBuiltIn { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Plan> Plans { get; set; } = [];
}

/// <summary>The keys the application itself checks. Seeded on startup; see FeatureSeeder.</summary>
public static class FeatureKeys
{
    /// <summary>Reading a photographed receipt. The allowance lives on the plan, not here.</summary>
    public const string Ocr = "ocr";

    /// <summary>The assistant, and the button in the header that opens it.</summary>
    public const string Ai = "ia";

    /// <summary>
    /// Taking money from the company's own customers: a Stripe account connected to the
    /// company, a payment link on the invoices it sends, and later a checkout on its public
    /// page.
    ///
    /// Sold rather than given because it is the one feature that puts Vexta between a company
    /// and its revenue. A company that has it expects the money to arrive, and that is a
    /// promise a cheap tier should be allowed not to make.
    /// </summary>
    public const string Payments = "paiements";

    /// <summary>
    /// Keys that let an outside assistant (Claude, ChatGPT, an automation) read and work in the
    /// company's data through the MCP endpoint.
    /// </summary>
    public const string Mcp = "mcp";

    /// <summary>
    /// Getting paid through PayPal: the company connects its own PayPal business account, and its
    /// invoices can be paid with PayPal beside the card.
    /// </summary>
    public const string PayPal = "paypal";
}
