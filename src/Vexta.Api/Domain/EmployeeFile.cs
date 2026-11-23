namespace Vexta.Api.Domain;

/// <summary>
/// Where an employee lives. Theirs, not the company's — the yard and the head office are
/// <see cref="CompanyLocation"/> and live on the company's own card.
///
/// Several per person on purpose: a seasonal worker with a winter address, somebody who moved
/// mid-year and whose T4 has to go to the right place.
/// </summary>
public class EmployeeAddress
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>
    /// Required. An address with nobody attached is what the company's locations are for, and
    /// one filed here without a name is one nobody can ever use.
    /// </summary>
    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    /// <summary>What it is to them — "Domicile", "Chalet", "Chez ses parents".</summary>
    public string? Label { get; set; }

    /// <summary>
    /// The one the payroll and the government forms use. At most one per employee, enforced by
    /// the controller rather than the schema: setting a new one has to unset the old one, and a
    /// unique index would refuse the save halfway through that swap.
    /// </summary>
    public bool IsPrimary { get; set; }

    public required string Line1 { get; set; }
    public string? Line2 { get; set; }
    public required string City { get; set; }
    public string? Province { get; set; }
    public required string PostalCode { get; set; }
    public required string Country { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Who to call when something happens to this person on a site.
///
/// The phone number is the only field that is required beyond a name. Everything else about an
/// emergency contact can be missing and the record still does its job at the moment it matters.
/// </summary>
public class EmergencyContact
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public required string Name { get; set; }

    /// <summary>"Conjointe", "Mère", "Voisin". Free text: nobody's family fits a dropdown.</summary>
    public string? Relationship { get; set; }

    public required string Phone { get; set; }
    public string? AltPhone { get; set; }
    public string? Email { get; set; }

    /// <summary>The one called first. Same rule as an address: held by the controller.</summary>
    public bool IsPrimary { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>What an employee is paid by.</summary>
public enum WageKind
{
    /// <summary>Paid for the hours worked. The rate is per hour.</summary>
    Horaire = 0,

    /// <summary>Paid a fixed amount per year. The rate is the annual salary.</summary>
    Annuel = 1
}

/// <summary>
/// A rate, from a date. Never edited into a new rate — a raise is a new row.
///
/// That is the whole point of this table. An hourly rate overwritten in place makes last
/// spring's hours cost what this spring's do, and the invoice they were billed on stops adding
/// up. The rate in force on a day is the most recent row whose date is on or before it.
/// </summary>
public class EmployeeWage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public DateOnly EffectiveOn { get; set; }

    public WageKind Kind { get; set; } = WageKind.Horaire;

    /// <summary>Dollars: per hour when Horaire, per year when Annuel.</summary>
    public decimal Amount { get; set; }

    /// <summary>Why it changed — "Révision annuelle", "Promotion contremaître".</summary>
    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}

/// <summary>
/// One movement in an employee's hour bank: overtime banked, or time taken back.
///
/// Signed, and stored as movements rather than a balance. A balance in a column is a number
/// nobody can argue with and nobody can explain; a list of movements answers "why do I have
/// fourteen hours" without anyone having to remember.
/// </summary>
public class HourBankEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public DateOnly Date { get; set; }

    /// <summary>Positive when banked, negative when taken. Never zero.</summary>
    public decimal Hours { get; set; }

    public required string Reason { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}

/// <summary>Why someone is away.</summary>
public enum LeaveKind
{
    Vacances = 0,
    Maladie = 1,
    SansSolde = 2,
    Parental = 3,

    /// <summary>Taken out of the hour bank. Approving one writes the matching negative movement.</summary>
    BanqueHeures = 4,

    Autre = 5
}

/// <summary>Where a leave request stands.</summary>
public enum LeaveStatus
{
    EnAttente = 0,
    Approuve = 1,
    Refuse = 2,

    /// <summary>Withdrawn by the employee before it was decided.</summary>
    Annule = 3
}

/// <summary>
/// Time off, asked for and answered.
///
/// The employee files it, somebody who runs the company answers it, and both halves stay on the
/// row: a refusal without a reason is the kind of thing that gets asked about again in March.
/// </summary>
public class LeaveRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public LeaveKind Kind { get; set; } = LeaveKind.Vacances;

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    /// <summary>
    /// Null means the whole of every day in the range. Set for a half-day or an afternoon,
    /// which is most of what actually gets asked for.
    /// </summary>
    public decimal? Hours { get; set; }

    public string? Note { get; set; }

    public LeaveStatus Status { get; set; } = LeaveStatus.EnAttente;

    public Guid? DecidedByUserId { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }

    /// <summary>What the answer was based on. Shown to the employee, so it is written for them.</summary>
    public string? DecisionNote { get; set; }

    /// <summary>
    /// The hour-bank movement an approved BanqueHeures leave wrote. Kept so refusing or
    /// cancelling it afterwards can take the hours back out, instead of leaving the bank short.
    /// </summary>
    public Guid? HourBankEntryId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A shift somebody is expected to work. What was planned, not what happened —
/// <see cref="TimesheetEntry"/> is what happened, and the two are deliberately separate so a day
/// that went differently can be read against the day that was planned.
/// </summary>
public class ScheduleShift
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    /// <summary>Where they are expected. Null for a shift that is not on a job.</summary>
    public Guid? ProjectId { get; set; }
    public Project? Project { get; set; }

    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>What kind of paper an employee holds.</summary>
public enum CredentialKind
{
    /// <summary>A course taken — SIMDUT, secourisme, travail en hauteur.</summary>
    Formation = 0,

    /// <summary>A licence — classe 3, cariste, ASP construction.</summary>
    Permis = 1,

    /// <summary>A competency card issued by a body — CCQ, RBQ.</summary>
    Carte = 2
}

/// <summary>
/// A training, a licence or a competency card, with the date it stops counting.
///
/// The expiry is the reason this table exists. A crew sent to a site with an expired card is
/// turned around at the gate, and the only way anyone finds out in time is a list that can be
/// sorted by the day it runs out.
/// </summary>
public class EmployeeCredential
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public CredentialKind Kind { get; set; } = CredentialKind.Formation;

    public required string Name { get; set; }

    /// <summary>Who issued it — "ASP Construction", "SAAQ".</summary>
    public string? Issuer { get; set; }

    /// <summary>The number on the card, when it has one.</summary>
    public string? Reference { get; set; }

    public DateOnly? IssuedOn { get; set; }

    /// <summary>Null for something that does not expire.</summary>
    public DateOnly? ExpiresOn { get; set; }

    /// <summary>A photograph or scan of the card. Null until somebody uploads it.</summary>
    public Guid? MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A section of someone's history.</summary>
public enum CvEntryKind
{
    Experience = 0,
    Formation = 1,

    /// <summary>A skill, named rather than dated — "Soudure TIG", "Lecture de plans".</summary>
    Competence = 2
}

/// <summary>
/// A line on an employee's CV, typed in rather than parsed out of a file.
///
/// The uploaded résumé lives beside this as an ordinary HR document; these rows are what can be
/// searched when somebody asks who has already done this kind of work.
/// </summary>
public class EmployeeCvEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public CvEntryKind Kind { get; set; } = CvEntryKind.Experience;

    /// <summary>The job title, the diploma, or the skill.</summary>
    public required string Title { get; set; }

    /// <summary>The employer or the school. Empty for a skill.</summary>
    public string? Organization { get; set; }

    public DateOnly? StartOn { get; set; }

    /// <summary>Null while it is still going on.</summary>
    public DateOnly? EndOn { get; set; }

    public string? Description { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
