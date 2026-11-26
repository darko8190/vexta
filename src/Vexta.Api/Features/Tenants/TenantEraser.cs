using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;

namespace Vexta.Api.Features.Tenants;

/// <summary>
/// Removes a space's rows from every table, then the space itself. Runs inside the caller's
/// transaction: a space is either entirely gone or untouched.
/// </summary>
public static class TenantEraser
{
    public static async Task EraseAsync(VextaDbContext db, Guid id, CancellationToken ct)
    {
        // A product can name another as its parent, and that link refuses the delete rather
        // than following it, so it is cut first.
        await db.Products.IgnoreQueryFilters()
            .Where(x => x.TenantId == id && x.ParentProductId != null)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.ParentProductId, (Guid?)null), ct);

        // Every table that carries the company's id, read from the database rather than listed
        // here. A hand-kept list was how quotes, purchase orders, schedules and a dozen newer
        // tables were being left behind — or blocked the delete outright — each time a module
        // was added without anyone remembering the list.
        var tables = await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT table_name AS "Value" FROM information_schema.columns
                WHERE table_schema = current_schema() AND column_name = 'TenantId'
                  AND table_name NOT IN ('Tenants', '__EFMigrationsHistory')
                """)
            .ToListAsync(ct);

        // In passes, child tables before the ones they point at, worked out by trying: a delete
        // a foreign key refuses is rolled back to its savepoint and tried again on the next pass,
        // once whatever pointed at it is gone. A pass that clears nothing means a link the order
        // cannot break, and the caller's transaction is abandoned with the tables named.
        var remaining = tables.ToList();
        while (remaining.Count > 0)
        {
            var cleared = new List<string>();
            foreach (var table in remaining)
            {
                await db.Database.ExecuteSqlRawAsync("SAVEPOINT wipe_table", ct);
                try
                {
                    // The name comes from the catalogue, never from a request.
                    await db.Database.ExecuteSqlRawAsync(
                        $"DELETE FROM \"{table}\" WHERE \"TenantId\" = {{0}}", [id], ct);
                    await db.Database.ExecuteSqlRawAsync("RELEASE SAVEPOINT wipe_table", ct);
                    cleared.Add(table);
                }
                catch (Npgsql.PostgresException ex) when (ex.SqlState == Npgsql.PostgresErrorCodes.ForeignKeyViolation)
                {
                    await db.Database.ExecuteSqlRawAsync("ROLLBACK TO SAVEPOINT wipe_table", ct);
                }
            }

            if (cleared.Count == 0)
            {
                throw new InvalidOperationException(
                    $"Suppression impossible : des données d'ailleurs pointent encore vers {string.Join(", ", remaining)}.");
            }

            remaining.RemoveAll(cleared.Contains);
        }

        // What is left cascades from the tenant row itself.
        await db.Tenants.IgnoreQueryFilters().Where(t => t.Id == id).ExecuteDeleteAsync(ct);
    }
}
