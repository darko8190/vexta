namespace Vexta.Api.Features.Reports;

/// <summary>One report as the super admin manages it.</summary>
public record AdminReportDto(
    Guid Id,
    Guid ModuleId,
    string ModuleTitle,
    string Key,
    string Title,
    string Description,
    string Icon,
    int SortOrder,
    bool IsPublished);

public record SaveReportRequest(
    Guid ModuleId,
    string Key,
    string Title,
    string Description,
    string Icon,
    int SortOrder = 0,
    bool IsPublished = true);

/// <summary>
/// One calculation the API can run, offered to the super admin as a choice.
///
/// <paramref name="IsImplemented"/> is honest on purpose: a report whose query is not written
/// yet can still be defined and placed, and the page behind it says so rather than drawing an
/// empty table. Hiding the unfinished ones would mean the catalogue grows by deploying rather
/// than by configuring.
/// </summary>
public record ReportKeyDto(string Key, string Label, bool IsImplemented);

/// <summary>One report as a company sees it on the Rapports page.</summary>
public record ReportDto(
    Guid Id,
    string Key,
    string Title,
    string Description,
    string Icon,
    Guid ModuleId,
    string ModuleTitle,
    bool IsImplemented);

/// <summary>
/// A report's result, as a title, a set of columns and rows of already-formatted cells.
///
/// Deliberately shapeless: every report would otherwise need its own DTO, its own hook and its
/// own table on the front end, and adding one would stop being a server-side job. The server
/// decides what a column is called and how a number reads — a date or an amount formatted in
/// two places eventually reads two ways.
/// </summary>
public record ReportResultDto(
    string Title,
    string? Subtitle,
    IReadOnlyList<ReportColumnDto> Columns,
    IReadOnlyList<IReadOnlyList<string>> Rows,
    /// <summary>The bottom line, when the report has one. Same width as the columns.</summary>
    IReadOnlyList<string>? Totals,
    DateTimeOffset GeneratedAt);

/// <summary>
/// <paramref name="Numeric"/> is what makes a column right-aligned and tabular. It is a
/// property of the column, not a guess the browser makes from the first cell it meets.
/// </summary>
public record ReportColumnDto(string Label, bool Numeric = false);
