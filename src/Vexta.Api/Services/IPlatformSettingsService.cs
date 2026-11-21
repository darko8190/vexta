using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

public interface IPlatformSettingsService
{
    Task<string?> GetAsync(string key, CancellationToken ct = default);
    Task<Dictionary<string, string?>> GetManyAsync(IEnumerable<string> keys, CancellationToken ct = default);
    Task SetAsync(string key, string? value, CancellationToken ct = default);
    Task SetManyAsync(Dictionary<string, string?> values, CancellationToken ct = default);

    /// <summary>
    /// Removes a setting. <see cref="SetManyAsync"/> deliberately ignores blanks so an untouched
    /// password field cannot wipe a secret, which leaves no way to empty an optional value.
    /// </summary>
    Task ClearAsync(string key, CancellationToken ct = default);
}

public class PlatformSettingsService(VextaDbContext db, ISecretProtector protector) : IPlatformSettingsService
{
    public async Task<string?> GetAsync(string key, CancellationToken ct = default)
    {
        var setting = await db.PlatformSettings.FindAsync([key], ct);
        return setting is null ? null : TryUnprotect(setting.EncryptedValue);
    }

    public async Task<Dictionary<string, string?>> GetManyAsync(IEnumerable<string> keys, CancellationToken ct = default)
    {
        var keySet = keys.ToHashSet();
        var settings = await db.PlatformSettings.Where(s => keySet.Contains(s.Key)).ToListAsync(ct);
        var result = keySet.ToDictionary(k => k, _ => (string?)null);
        foreach (var setting in settings)
        {
            result[setting.Key] = TryUnprotect(setting.EncryptedValue);
        }
        return result;
    }

    // A value encrypted under a key that is no longer in the data protection key ring (e.g. the
    // ring was reset) must not take down the whole settings page — treat it as unset instead.
    private string? TryUnprotect(string encryptedValue)
    {
        try
        {
            return protector.Unprotect(encryptedValue);
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    public async Task SetAsync(string key, string? value, CancellationToken ct = default)
    {
        await SetManyAsync(new Dictionary<string, string?> { [key] = value }, ct);
    }

    public async Task ClearAsync(string key, CancellationToken ct = default)
    {
        var setting = await db.PlatformSettings.FindAsync([key], ct);
        if (setting is null)
        {
            return;
        }

        db.PlatformSettings.Remove(setting);
        await db.SaveChangesAsync(ct);
    }

    public async Task SetManyAsync(Dictionary<string, string?> values, CancellationToken ct = default)
    {
        foreach (var (key, value) in values)
        {
            if (string.IsNullOrEmpty(value))
            {
                continue; // don't overwrite an existing secret with a blank field left untouched by the UI
            }

            var setting = await db.PlatformSettings.FindAsync([key], ct);
            var encrypted = protector.Protect(value);
            if (setting is null)
            {
                db.PlatformSettings.Add(new PlatformSetting { Key = key, EncryptedValue = encrypted });
            }
            else
            {
                setting.EncryptedValue = encrypted;
                setting.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }
        await db.SaveChangesAsync(ct);
    }
}
