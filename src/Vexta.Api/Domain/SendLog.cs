namespace Vexta.Api.Domain;

/// <summary>
/// One message sent about a record: an invoice, a quote, a purchase order, a form. Kept so the
/// record can show when it went out, to whom, and whether it was the first send or a reminder.
/// </summary>
public class SendLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>What was sent about: « facture », « soumission », « commande », « formulaire ».</summary>
    public required string EntityType { get; set; }
    public Guid EntityId { get; set; }

    /// <summary>« Envoi », « Relance », « Renvoi », « Invitation ».</summary>
    public required string Kind { get; set; }

    public required string To { get; set; }
    public string? Cc { get; set; }
    public required string Subject { get; set; }

    /// <summary>Null when the message was sent by the application itself (a scheduled reminder).</summary>
    public Guid? SentByUserId { get; set; }
    public string? SentByName { get; set; }

    public DateTimeOffset SentAt { get; set; } = DateTimeOffset.UtcNow;
}
