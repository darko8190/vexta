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
    /// What kind of thing it is, chosen from the company's own list: Véhicule, Maison, Bloc
    /// appartements, Machinerie. A row rather than an enum, and for the same reason expenses
    /// have one — the list is different in every trade and grows as the trade meets new work.
    ///
    /// Nullable because a type is a convenience and not a condition: somebody filing a car at
    /// the counter must not be stopped to go and define a category first.
    /// </summary>
    public Guid? AssetTypeId { get; set; }
    public ClientAssetType? AssetType { get; set; }

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

/// <summary>
/// One of the company's kinds of asset: Véhicule, Maison, Bloc appartements, Machinerie.
///
/// Created from the dropdown that uses it, like an expense category. A garage will end up with
/// one entry and a property manager with four, and neither should have had to visit a settings
/// screen to get there.
/// </summary>
public class ClientAssetType
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    /// <summary>
    /// A lucide icon name, so a list of types reads as a list of things rather than of words.
    /// Null falls back to the generic one the web app uses for an asset.
    /// </summary>
    public string? Icon { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ClientAsset> Assets { get; set; } = [];
}

/// <summary>
/// Work that comes back on a schedule for one asset: the furnace's yearly cleaning, the
/// truck's oil change every six months. Vexta keeps the next date, and — when the company asks
/// for it — writes to the client ahead of it so the appointment is booked rather than forgotten.
///
/// Counted in months because that is how every trade says it ("aux six mois", "une fois par
/// année"); a date the trade counts in hours of use goes in the label and is moved by hand.
/// </summary>
public class AssetMaintenance
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClientAssetId { get; set; }
    public ClientAsset? ClientAsset { get; set; }

    /// <summary>The asset's owner, kept here so the client's own filter can narrow these rows.</summary>
    public Guid ClientId { get; set; }

    /// <summary>What is done: "Entretien annuel", "Changement d'huile".</summary>
    public required string Label { get; set; }

    /// <summary>Months between two visits. The next date moves by this much when one is marked done.</summary>
    public int IntervalMonths { get; set; } = 12;

    /// <summary>When the next one is due.</summary>
    public DateOnly NextDue { get; set; }

    /// <summary>
    /// Days before <see cref="NextDue"/> to write to the client. Null for no email: some
    /// companies call their clients themselves and only want the date kept.
    /// </summary>
    public int? RemindDaysBefore { get; set; }

    /// <summary>
    /// The due date the last reminder was about. One reminder per due date: marking it done or
    /// moving the date makes the next one eligible.
    /// </summary>
    public DateOnly? RemindedFor { get; set; }
    public DateTimeOffset? RemindedAt { get; set; }

    /// <summary>When it was last marked done.</summary>
    public DateOnly? LastDoneOn { get; set; }

    public string? Notes { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
