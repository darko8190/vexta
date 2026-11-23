namespace Vexta.Api.Features.Dashboard;

/// <summary>
/// What the company's own screen shows on opening.
///
/// One request rather than six, because these figures are read together and a page that fills
/// in six waves is a page that moves under the reader. The cheap counts a sidebar badge would
/// give are deliberately not repeated here — this is the money and what needs attention.
/// </summary>
public record DashboardDto(
    /// <summary>What was invoiced this calendar month, taxes in.</summary>
    decimal BilledThisMonth,

    /// <summary>The same month last year's figure is not here: a first-year company has none.</summary>
    decimal BilledLastMonth,

    /// <summary>Invoiced, not cancelled, and not yet paid in full.</summary>
    decimal Outstanding,

    /// <summary>The part of what is owed whose due date has passed.</summary>
    decimal Overdue,

    int OverdueInvoiceCount,

    /// <summary>What the company spent on its jobs this month: expenses and extra charges.</summary>
    decimal SpentThisMonth,

    int ActiveProjects,

    /// <summary>Jobs finished and waiting to be invoiced — money sitting on the table.</summary>
    int ToInvoice,

    /// <summary>Hours filed against the week that is running, company-wide.</summary>
    decimal HoursThisWeek,

    DashboardAttentionDto Attention,

    /// <summary>Up to five, newest first. Enough to recognise the week, not a second list page.</summary>
    List<DashboardInvoiceDto> RecentInvoices,

    /// <summary>The nearest due dates among what is not finished.</summary>
    List<DashboardTaskDto> UpcomingTasks);

/// <summary>
/// The short list of things somebody has to do something about. Each is a number and a place to
/// go; zero means the line is not shown rather than shown as a zero.
/// </summary>
public record DashboardAttentionDto(
    int OverdueInvoices,
    int LateTasks,
    int PendingLeaves,
    /// <summary>Cards and licences already expired, or expiring within thirty days.</summary>
    int ExpiringCredentials,
    /// <summary>Products at or below the minimum the company set for them.</summary>
    int LowStockProducts,
    int NewCandidates);

public record DashboardInvoiceDto(
    Guid Id,
    string Number,
    string ClientName,
    DateOnly IssueDate,
    DateOnly DueDate,
    decimal Total,
    decimal Paid,
    string Status);

public record DashboardTaskDto(
    Guid Id,
    Guid ProjectId,
    int ProjectNumber,
    string Title,
    DateOnly? DueDate,
    bool IsLate);
