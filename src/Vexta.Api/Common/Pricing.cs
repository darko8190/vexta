using Vexta.Api.Domain;

namespace Vexta.Api.Common;

/// <summary>
/// Turning a purchase price into a selling price, and back.
///
/// Both conventions are called "la marge" on a job site and give different numbers from the
/// same percentage, so the company states once which one it means — see <see cref="MarginMode"/>.
/// The web app carries the same arithmetic so a form can answer while someone types; this is the
/// copy that prices what actually gets saved.
/// </summary>
public static class Pricing
{
    public static decimal? SellingPrice(decimal? purchasePrice, decimal? marginPercent, MarginMode mode)
    {
        if (purchasePrice is not { } cost) return null;

        var margin = marginPercent ?? 0m;

        if (mode == MarginMode.Division)
        {
            // A margin of 100 % would mean handing the goods over and charging infinity.
            if (margin >= 100m) return null;
            return Round(cost / (1m - margin / 100m));
        }

        return Round(cost * (1m + margin / 100m));
    }

    public static decimal? MarginPercent(decimal? purchasePrice, decimal? sellingPrice, MarginMode mode)
    {
        if (purchasePrice is not { } cost || sellingPrice is not { } price) return null;
        if (cost <= 0 || price <= 0) return null;

        return mode == MarginMode.Division
            ? Round((price - cost) / price * 100m, 3)
            : Round((price - cost) / cost * 100m, 3);
    }

    private static decimal Round(decimal value, int places = 2) =>
        Math.Round(value, places, MidpointRounding.AwayFromZero);
}
