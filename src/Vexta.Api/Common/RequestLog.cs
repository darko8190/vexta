using System.Diagnostics;

namespace Vexta.Api.Common;

/// <summary>
/// One line per request, so a deployment has something to show.
///
/// The configured levels silence Microsoft.AspNetCore at Warning, which is sensible for noise
/// and terrible for diagnosis: a request that was refused with a 401 produced no output at all,
/// so the container's log stayed empty while people were being signed out. Chasing that took
/// several rounds of deploying things just to find out what had happened.
///
/// A refusal is logged as a warning and a failure as an error, so the two stand out in a page
/// of ordinary traffic. The host name is included because two stacks of this application run on
/// one machine: it is what shows, at a glance, that an answer came from the instance that was
/// supposed to give it.
/// </summary>
public class RequestLog(RequestDelegate next, ILogger<RequestLog> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            await next(context);
        }
        finally
        {
            var elapsed = Stopwatch.GetElapsedTime(started);
            var status = context.Response.StatusCode;

            var level = status switch
            {
                >= 500 => LogLevel.Error,
                >= 400 => LogLevel.Warning,
                _ => LogLevel.Information
            };

            logger.Log(
                level,
                "{Method} {Path} → {Status} en {Milliseconds} ms [{Instance}]",
                context.Request.Method,
                context.Request.Path.Value,
                status,
                (int)elapsed.TotalMilliseconds,
                Environment.MachineName);
        }
    }
}
