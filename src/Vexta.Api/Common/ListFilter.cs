using System.Globalization;
using System.Linq.Expressions;
using Microsoft.AspNetCore.Http;

namespace Vexta.Api.Common;

/// <summary>
/// The column filters a list screen sends, as <c>f.{colonne}</c> query parameters shaped by the
/// column's kind: <c>f.budget.min</c> / <c>f.budget.max</c> for a number, <c>f.debut.du</c> /
/// <c>f.debut.au</c> for a date, <c>f.statut=A,B</c> for a choice, <c>f.po=texte</c> for text.
///
/// Read here, applied by each list: the column names are the screen's, and only a list knows
/// which field of its own each one is. A column a list does not know is ignored.
/// </summary>
public class ListFilter(IQueryCollection query)
{
    private string? Raw(string key) =>
        query.TryGetValue($"f.{key}", out var value) && !string.IsNullOrWhiteSpace(value) ? value.ToString().Trim() : null;

    /// <summary>The values picked in a multiple choice; empty when none are.</summary>
    public IReadOnlyList<string> Values(string key) =>
        Raw(key)?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? [];

    public IReadOnlyList<Guid> Ids(string key) =>
        [.. Values(key).Select(v => Guid.TryParse(v, out var id) ? id : (Guid?)null).OfType<Guid>()];

    public IReadOnlyList<TEnum> Enums<TEnum>(string key) where TEnum : struct, Enum =>
        [.. Values(key).Select(v => Enum.TryParse<TEnum>(v, out var e) ? e : (TEnum?)null).OfType<TEnum>()];

    public decimal? Min(string key) => Number(Raw($"{key}.min"));
    public decimal? Max(string key) => Number(Raw($"{key}.max"));

    public DateOnly? From(string key) => Date(Raw($"{key}.du"));
    public DateOnly? To(string key) => Date(Raw($"{key}.au"));

    /// <summary>An ILike pattern for "contains", or null when nothing was typed.</summary>
    public string? Contains(string key) =>
        Raw(key) is { } text ? $"%{text.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%" : null;

    /// <summary>The column the list is sorted by (<c>tri</c>), or null for the list's default.</summary>
    public string? SortKey =>
        query.TryGetValue("tri", out var value) && !string.IsNullOrWhiteSpace(value) ? value.ToString().Trim() : null;

    /// <summary>Descending unless <c>ordre=asc</c>: the newest, the largest first.</summary>
    public bool SortDescending =>
        !(query.TryGetValue("ordre", out var value) && string.Equals(value.ToString(), "asc", StringComparison.OrdinalIgnoreCase));

    /// <summary>A sort key, typed, for the table of keys handed to <see cref="Sort{T}"/>.</summary>
    public static LambdaExpression By<T, TKey>(Expression<Func<T, TKey>> key) => key;

    /// <summary>
    /// Orders the list by the column asked for when the list knows it, by its default otherwise.
    /// The keys are the screen's column names, like the filters.
    /// </summary>
    public IQueryable<T> Sort<T>(
        IQueryable<T> source,
        IReadOnlyDictionary<string, LambdaExpression> keys,
        LambdaExpression fallback,
        bool fallbackDescending = true)
    {
        var (expression, descending) = SortKey is { } key && keys.TryGetValue(key, out var chosen)
            ? (chosen, SortDescending)
            : (fallback, fallbackDescending);

        var call = Expression.Call(
            typeof(Queryable),
            descending ? nameof(Queryable.OrderByDescending) : nameof(Queryable.OrderBy),
            [typeof(T), expression.ReturnType],
            source.Expression,
            Expression.Quote(expression));
        return source.Provider.CreateQuery<T>(call);
    }

    private static decimal? Number(string? raw) =>
        raw is not null && decimal.TryParse(raw.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : null;

    private static DateOnly? Date(string? raw) =>
        raw is not null && DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
}
