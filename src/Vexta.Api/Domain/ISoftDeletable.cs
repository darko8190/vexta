namespace Vexta.Api.Domain;

/// <summary>
/// A record that goes to the corbeille when deleted rather than disappearing: the row stays,
/// stamped, and every query leaves it out until it is restored or the corbeille is emptied.
/// </summary>
public interface ISoftDeletable
{
    DateTimeOffset? DeletedAt { get; set; }
    Guid? DeletedByUserId { get; set; }
}
