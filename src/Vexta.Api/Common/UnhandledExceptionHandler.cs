using System.Security.Cryptography;
using Microsoft.AspNetCore.Diagnostics;

namespace Vexta.Api.Common;

/// <summary>
/// Turns a crash into something a person can act on and someone else can find in the log.
///
/// Without this, an unhandled exception leaves ASP.NET to answer 500 with an empty body. The
/// browser then has nothing to read, so every failure of this kind reached the person as the
/// same "Une erreur est survenue." — and nothing on screen connected it to any line in the
/// container's log. Reporting a bug meant reproducing it while someone watched the log.
///
/// Each failure now gets a short reference, printed in the log beside the stack trace and shown
/// on screen. Quoting it is enough to find the exact occurrence.
///
/// The exception's own message is deliberately NOT returned: it can name tables, columns,
/// connection strings and file paths, and the API answers a browser.
/// </summary>
public class UnhandledExceptionHandler(ILogger<UnhandledExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        // Short and unambiguous to read out loud or retype: no 0/O or 1/I to confuse.
        var reference = RandomNumberGenerator.GetString("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

        logger.LogError(
            exception,
            "Erreur non gérée [{Reference}] sur {Method} {Path}",
            reference,
            context.Request.Method,
            context.Request.Path);

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(
            new
            {
                message = $"Une erreur est survenue du côté du serveur. Référence : {reference}",
                reference
            },
            cancellationToken);

        return true;
    }
}
