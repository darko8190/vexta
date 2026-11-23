namespace Vexta.Api.Domain;

/// <summary>
/// One receipt read by a model, written down whether or not it found anything.
///
/// The only thing in Vexta that costs money per use. Everything else — the server, Mailgun, R2 —
/// is a fixed monthly bill, so a company that files a thousand receipts costs the same as one
/// that files ten. A scan does not, and a feature whose cost grows silently with somebody else's
/// usage is a feature that is eventually switched off in a hurry.
///
/// So every scan leaves a row. The month's count is a query against this table, the plan says
/// how many are included, and the refusal when the allowance runs out can name the number.
/// </summary>
public class ReceiptScan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>
    /// The photograph that was read. SetNull on delete: deleting the receipt must not erase the
    /// fact that a scan was spent on it, which is what the month's count is built from.
    /// </summary>
    public Guid? MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    /// <summary>Who asked for it. Kept as an id: the account may be gone by the time it is read.</summary>
    public Guid? RequestedByUserId { get; set; }

    /// <summary>
    /// False when the model answered but found nothing usable — a blurred photo, a receipt in
    /// a language it could not read, a picture of something that is not a receipt. It still
    /// counted against the allowance, because it still cost money.
    /// </summary>
    public bool FoundSomething { get; set; }

    /// <summary>
    /// What the model was asked and what it answered, in tokens. Kept so that "pourquoi ça coûte
    /// ça" has an answer that is not a guess, and so a change of model can be compared.
    /// </summary>
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }

    /// <summary>The model that read it. The row outlives any default we change later.</summary>
    public required string Model { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
