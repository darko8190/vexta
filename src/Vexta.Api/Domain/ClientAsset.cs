namespace Vexta.Api.Domain;

/// <summary>
/// Something the client owns that work gets done on: a vehicle at a garage, a building for a
/// contractor, a furnace for a refrigeration shop.
///
/// Deliberately not called a vehicle. Vexta is project management for any trade, and the moment
/// one of them gets its own table the next one needs its own too. The fields are the ones every
/// trade actually fills — what you call it, what it is, who made it, which year, and the two
/// numbers stamped on it — and the label is what carries whatever the rest cannot.
///
/// Not "Équipement" either: that word is already the company's own tools in the inventory, and
/// a client's car is not the company's equipment.
/// </summary>
public class ClientAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClientId { get; set; }
    public Client? Client { get; set; }

    /// <summary>
    /// What the shop calls it, in one line: "Corolla 2018 bleue", "Immeuble A — chaufferie".
    /// The only required field, because it is the only one every trade is certain to have.
    /// </summary>
    public required string Label { get; set; }

    /// <summary>
    /// What kind of thing it is — Véhicule, Bâtiment, Appareil, Machinerie. Free text rather
    /// than an enum: the list is different in every trade, and a fixed one would be a list of
    /// somebody else's categories.
    /// </summary>
    public string? Category { get; set; }

    public string? Make { get; set; }
    public string? Model { get; set; }

    /// <summary>The model year, or the year it was installed. Not a date: nobody knows the day.</summary>
    public int? Year { get; set; }

    /// <summary>The number stamped on it: a VIN, a serial number, a unit tag.</summary>
    public string? SerialNumber { get; set; }

    /// <summary>The second number it is known by: a plate, an internal fleet number.</summary>
    public string? Reference { get; set; }

    /// <summary>
    /// How much it has been used, in whatever the trade counts — kilometres, hours, cycles. Two
    /// fields because the number means nothing without its unit, and the unit is the shop's.
    /// </summary>
    public decimal? Usage { get; set; }
    public string? UsageUnit { get; set; }

    /// <summary>
    /// Where it is, for anything that does not move. SetNull on delete: losing an address must
    /// not delete the building that stood at it.
    /// </summary>
    public Guid? AddressId { get; set; }
    public Address? Address { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// False once it is sold, scrapped or no longer serviced. Kept rather than deleted: the
    /// work done on it is history, and history does not stop being true when a car is sold.
    /// </summary>
    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// The one line a list shows: "Toyota Corolla 2018", falling back to the label when the
    /// make and model were never filled.
    /// </summary>
    public string Designation
    {
        get
        {
            var parts = new[] { Make, Model, Year?.ToString() }
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .ToArray();

            return parts.Length == 0 ? Label : string.Join(" ", parts);
        }
    }
}
