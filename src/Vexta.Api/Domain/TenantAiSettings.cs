namespace Vexta.Api.Domain;

public enum AiProvider
{
    /// <summary>Claude, through Anthropic's own API.</summary>
    Anthropic = 0,

    /// <summary>ChatGPT, through OpenAI's API.</summary>
    OpenAi = 1
}

/// <summary>
/// The assistant one company connected, with that company's own key.
///
/// The key belongs to the tenant and not to the platform, which is the whole point: a company
/// that wants an assistant pays its own model bill, chooses its own model, and can revoke its
/// own key. Vexta never sees a token of it on its own account.
///
/// Encrypted at rest with the same protector the platform's integration keys use, and never
/// sent back to the browser — the settings screen shows whether a key is on file, never what
/// it is. There is no road from the API back to the plain text except the assistant's own call.
/// </summary>
public class TenantAiSettings
{
    /// <summary>One row per company, so the tenant is the key.</summary>
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public AiProvider Provider { get; set; } = AiProvider.Anthropic;

    /// <summary>
    /// The model id as the provider spells it, such as <c>claude-opus-5-5</c> or <c>gpt-5</c>.
    /// Free text rather than an enum: model names change far faster than this application is
    /// deployed, and a company whose provider shipped something new this morning should not
    /// have to wait for us to add a constant.
    /// </summary>
    public required string Model { get; set; }

    public string? EncryptedApiKey { get; set; }

    /// <summary>
    /// Off until the owner turns it on, even once a key is on file. The two are separate so the
    /// assistant can be stopped in one click without anybody having to find and re-enter a key.
    /// </summary>
    public bool IsEnabled { get; set; }

    /// <summary>
    /// False keeps the assistant to reading. It can look things up and answer questions, and
    /// every call that would write is refused by the server rather than by a sentence in the
    /// prompt — a model that has been talked into ignoring its instructions still cannot reach
    /// past a closed door.
    ///
    /// Starts false deliberately: letting something write to a company's clients and invoices
    /// is a decision its owner makes on purpose, not one they discover having made.
    /// </summary>
    public bool CanWrite { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    /// <summary>
    /// The month the counters below belong to, as its first day. When a reply arrives in a
    /// later month the counters start again from zero: the figure in the header answers "what
    /// is this costing me this month", which is the question somebody watching a bill asks.
    /// Keeping a running total since the key was added answers a question nobody asks, and
    /// grows a number that only ever looks worse.
    /// </summary>
    public DateOnly? UsagePeriod { get; set; }

    public long InputTokens { get; set; }
    public long OutputTokens { get; set; }

    /// <summary>
    /// What the company pays per million tokens, as their provider bills them. Null until they
    /// fill it in, and nothing is guessed on their behalf: a list price baked in here would be
    /// wrong for anybody on a negotiated rate, wrong for everybody the day a provider changes
    /// it, and wrong in a way that reads like a statement of account.
    ///
    /// Without them the header shows tokens, which is true and needs no price list.
    /// </summary>
    public decimal? InputPricePerMillion { get; set; }
    public decimal? OutputPricePerMillion { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
