namespace Vexta.Api.Common;

/// <summary>
/// How a stretch of clock time becomes hours on a job.
///
/// Rounded to the quarter hour, because that is the unit the trade is paid in: 7 h 52 to
/// 16 h 03 is 8,25 h on the sheet, not 8,183333. Shared by the timesheet screens and by the
/// invoice a project is billed with, so the hours on the sheet and the hours on the invoice
/// cannot drift apart.
/// </summary>
public static class WorkHours
{
    public const int RoundingMinutes = 15;

    /// <summary>
    /// The hours between two moments, to the nearest quarter. Zero when the end is not after
    /// the start — the caller refuses that entry rather than storing a negative shift.
    /// </summary>
    public static decimal Between(DateOnly startDate, TimeOnly startTime, DateOnly endDate, TimeOnly endTime)
    {
        var minutes = (endDate.ToDateTime(endTime) - startDate.ToDateTime(startTime)).TotalMinutes;
        if (minutes <= 0) return 0m;

        return FromMinutes(minutes);
    }

    /// <summary>A number of minutes worked, to the nearest quarter hour. Zero at or below zero.</summary>
    public static decimal FromMinutes(double minutes)
    {
        if (minutes <= 0) return 0m;
        var quarters = Math.Round(minutes / RoundingMinutes, MidpointRounding.AwayFromZero);
        return (decimal)quarters * RoundingMinutes / 60m;
    }
}
