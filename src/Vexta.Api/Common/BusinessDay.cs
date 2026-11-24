namespace Vexta.Api.Common;

/// <summary>
/// What day it is where the company is.
///
/// Not <c>DateTime.Today</c>. The API runs in a container whose clock is UTC, so from 19 h in
/// Québec the server is already on tomorrow — and for those five hours every single evening, a
/// task due today reads as late and "cette semaine" means next week. Somebody checking their
/// hours on a Sunday evening would be shown an empty week.
///
/// The zone is resolved once and cached. Both identifiers are tried because they differ by
/// platform — Windows answers to the first and Linux to the second — and a failure falls back
/// to UTC rather than throwing: a missing time-zone database must not take down the task list.
/// </summary>
public static class BusinessDay
{
    private static readonly TimeZoneInfo Zone = Resolve();

    /// <summary>Today, in the company's own calendar.</summary>
    public static DateOnly Today =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Zone).DateTime);

    /// <summary>Now, in the company's own calendar, for the rare caller that needs the clock too.</summary>
    public static DateTimeOffset Now => TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Zone);

    /// <summary>A moment stored in UTC, on the company's clock.</summary>
    public static DateTimeOffset ToLocal(DateTimeOffset moment) => TimeZoneInfo.ConvertTime(moment, Zone);

    /// <summary>The company's calendar date of a moment stored in UTC.</summary>
    public static DateOnly DateOf(DateTimeOffset moment) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(moment, Zone).DateTime);

    private static TimeZoneInfo Resolve()
    {
        foreach (var id in new[] { "America/Toronto", "Eastern Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (Exception)
            {
                // Tried the next spelling. Both failing means no time-zone data, which the
                // fallback below answers for.
            }
        }

        return TimeZoneInfo.Utc;
    }
}
