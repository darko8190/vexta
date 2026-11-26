using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Routing;

namespace Vexta.Api.Services;

/// <param name="Method">GET, POST, PUT or PATCH. DELETE is refused; see <see cref="AssistantApiTool"/>.</param>
/// <param name="Path">A route under api/, with its query string.</param>
/// <param name="Status">What the application answered, or 0 when the call never left.</param>
public record AssistantAction(string Method, string Path, int Status, string Summary);

/// <summary>
/// The one tool the assistant gets, and the reason it can do anything at all: it calls Vexta's
/// own HTTP API, as the person who is talking to it.
///
/// Going back through the front door rather than reaching into the database is the whole design.
/// Every rule the application has — the tenant filter, the role checks, the validation, the
/// numbering, the side effects a controller runs after a save — applies to the assistant for
/// free and cannot drift away from it, because there is only one copy of each. A tool written
/// against the tables would be a second application that looks like the first until the day it
/// does not.
///
/// Three doors stay shut:
/// <list type="bullet">
/// <item>DELETE, always. Creating something wrong is an afternoon; deleting something that
/// mattered is a telephone call to a client. A person deletes, on the screen, having read it.</item>
/// <item>Everything but GET, when the company has not turned writing on.</item>
/// <item>The platform's own routes — sign-in, super admin, billing, and the assistant itself.
/// Those are not this company's to drive.</item>
/// </list>
/// </summary>
public class AssistantApiTool(
    HttpClient http,
    string baseAddress,
    string? authorization,
    bool canWrite,
    ILogger logger)
{
    /// <summary>
    /// Past this the answer is cut, with a line saying so. A list of four hundred clients would
    /// otherwise spend the company's whole context window on rows the model was not asked about,
    /// and leave no room for the answer.
    /// </summary>
    private const int MaxResponseChars = 12_000;

    /// <summary>
    /// Routes the assistant may not touch, by prefix. Checked after the leading slash is
    /// trimmed, so "api/auth/login" and "/api/auth/login" are the same string here.
    /// </summary>
    private static readonly string[] Forbidden =
    [
        "api/auth",        // signing in, tokens, password resets
        "api/admin",       // the platform's own catalogue, not a company's
        "api/billing",     // money: a subscription is cancelled by a person, not by a sentence
        "api/assistant",   // itself
        "api/public",      // the unauthenticated side of the house
        "api/catalog",
        "api/parametres-plateforme",
        "api/mcp",         // the MCP door, and the keys that open it: a key never mints another
        "api/cles-mcp",
    ];

    /// <summary>
    /// Where this server can call itself. Taken from the server's own listening addresses rather
    /// than from the public hostname: inside a container the public name goes out to the
    /// internet, through the reverse proxy, and back.
    /// </summary>
    public static string SelfBaseAddress(Microsoft.AspNetCore.Hosting.Server.IServer server, Microsoft.AspNetCore.Http.HttpRequest? request)
    {
        var addresses = server.Features.Get<Microsoft.AspNetCore.Hosting.Server.Features.IServerAddressesFeature>()?.Addresses ?? [];

        var candidate =
            addresses.FirstOrDefault(a => a.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            ?? addresses.FirstOrDefault();

        if (candidate is not null)
        {
            // Kestrel reports the wildcard it bound, not somewhere you can connect to.
            var usable = candidate
                .Replace("://[::]", "://localhost", StringComparison.Ordinal)
                .Replace("://0.0.0.0", "://localhost", StringComparison.Ordinal)
                .Replace("://+", "://localhost", StringComparison.Ordinal)
                .Replace("://*", "://localhost", StringComparison.Ordinal);

            return usable.TrimEnd('/') + "/";
        }

        return request is null ? "http://localhost/" : $"{request.Scheme}://{request.Host}/";
    }

    private readonly List<AssistantAction> actions = [];

    public IReadOnlyList<AssistantAction> Actions => actions;

    /// <summary>The tool's JSON schema, shared by both providers because both speak JSON Schema.</summary>
    public static JsonElement Schema() => JsonSerializer.SerializeToElement(new
    {
        type = "object",
        properties = new
        {
            methode = new
            {
                type = "string",
                @enum = new[] { "GET", "POST", "PUT", "PATCH" },
                description = "GET pour lire, POST pour créer, PUT ou PATCH pour modifier.",
            },
            chemin = new
            {
                type = "string",
                description =
                    "La route, par exemple api/clients ou api/projets/<id>. "
                    + "La chaîne de requête est permise : api/clients?recherche=tremblay&taille=10.",
            },
            corps = new
            {
                type = "object",
                description = "Le corps JSON, pour POST, PUT et PATCH. Omis pour un GET.",
                additionalProperties = true,
            },
        },
        required = new[] { "methode", "chemin" },
    });

    public const string Name = "appeler_api";

    public const string Description =
        "Appelle l'API de Vexta au nom de la personne qui parle. C'est le seul moyen de lire ou "
        + "d'écrire quoi que ce soit : clients, projets, factures, employés, produits, fournisseurs, "
        + "dépenses, feuilles de temps. Répond toujours le JSON de l'application, ou le message "
        + "d'erreur qu'elle a donné. La suppression n'est pas permise.";

    /// <param name="argumentsJson">The tool input, as the model wrote it.</param>
    /// <returns>What to hand back to the model. Never throws: a failure is something it can read.</returns>
    public async Task<string> ExecuteAsync(string argumentsJson, CancellationToken ct)
    {
        string method;
        string path;
        JsonElement? body = null;

        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(argumentsJson) ? "{}" : argumentsJson);
            var root = document.RootElement;

            method = root.TryGetProperty("methode", out var m) ? m.GetString()?.ToUpperInvariant() ?? "" : "";
            path = root.TryGetProperty("chemin", out var p) ? p.GetString() ?? "" : "";

            if (root.TryGetProperty("corps", out var b) && b.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
            {
                body = b.Clone();
            }
        }
        catch (JsonException ex)
        {
            return Refuse("?", "?", $"Les arguments ne sont pas du JSON valide : {ex.Message}");
        }

        path = path.Trim().TrimStart('/');
        if (!path.StartsWith("api/", StringComparison.OrdinalIgnoreCase))
        {
            path = "api/" + path;
        }

        if (method is "DELETE")
        {
            return Refuse(method, path,
                "La suppression n'est pas permise à l'assistant. Dis à la personne de supprimer "
                + "elle-même depuis l'écran concerné, après avoir vérifié ce qu'elle supprime.");
        }

        if (method is not ("GET" or "POST" or "PUT" or "PATCH"))
        {
            return Refuse(method, path, $"Méthode « {method} » non permise.");
        }

        if (!canWrite && method != "GET")
        {
            return Refuse(method, path,
                "L'assistant est en lecture seule pour cette entreprise. Un administrateur peut "
                + "l'autoriser à écrire dans Paramètres → Assistant IA.");
        }

        if (Forbidden.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            return Refuse(method, path, "Cette partie de l'application n'est pas accessible à l'assistant.");
        }

        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri(new Uri(baseAddress), path));
        if (authorization is not null)
        {
            request.Headers.TryAddWithoutValidation("Authorization", authorization);
        }

        if (body is { } payload && method != "GET")
        {
            request.Content = new StringContent(payload.GetRawText(), Encoding.UTF8, "application/json");
        }

        var stopwatch = Stopwatch.StartNew();
        try
        {
            using var response = await http.SendAsync(request, ct);
            var text = await response.Content.ReadAsStringAsync(ct);

            var truncated = text.Length > MaxResponseChars;
            if (truncated)
            {
                text = text[..MaxResponseChars];
            }

            actions.Add(new AssistantAction(method, path, (int)response.StatusCode, Summarise(response.StatusCode)));
            logger.LogInformation("Assistant {Method} {Path} -> {Status} en {Ms} ms",
                method, path, (int)response.StatusCode, stopwatch.ElapsedMilliseconds);

            var header = $"HTTP {(int)response.StatusCode} {response.StatusCode}";
            return truncated
                ? $"{header}\n{text}\n\n[Réponse tronquée. Demande une page plus petite ou filtre la recherche.]"
                : $"{header}\n{text}";
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Assistant : l'appel {Method} {Path} a échoué.", method, path);
            actions.Add(new AssistantAction(method, path, 0, "échec"));
            return $"L'appel n'a pas abouti : {ex.Message}";
        }
    }

    private string Refuse(string method, string path, string reason)
    {
        actions.Add(new AssistantAction(method, path, 0, "refusé"));
        return $"Refusé. {reason}";
    }

    private static string Summarise(HttpStatusCode status) => (int)status switch
    {
        >= 200 and < 300 => "ok",
        401 or 403 => "refusé",
        404 => "introuvable",
        >= 400 and < 500 => "invalide",
        _ => "erreur",
    };

    /// <summary>
    /// The routes the application actually has, read off its own endpoint table.
    ///
    /// Generated rather than written down so it cannot go stale: a controller added next month
    /// is in the assistant's hands the day it ships, and one deleted stops being offered. The
    /// shapes of the bodies are not here — the model learns those by reading one record before
    /// it writes one, which is what a person does too.
    /// </summary>
    public static string RouteCatalogue(EndpointDataSource endpoints)
    {
        var rows = new SortedDictionary<string, SortedSet<string>>(StringComparer.Ordinal);

        foreach (var endpoint in endpoints.Endpoints.OfType<RouteEndpoint>())
        {
            var pattern = endpoint.RoutePattern.RawText;
            if (string.IsNullOrWhiteSpace(pattern)) continue;

            var path = pattern.TrimStart('/');
            if (!path.StartsWith("api/", StringComparison.OrdinalIgnoreCase)) continue;
            if (Forbidden.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))) continue;

            var methods = endpoint.Metadata.GetMetadata<Microsoft.AspNetCore.Routing.IHttpMethodMetadata>()?.HttpMethods
                ?? [];

            var allowed = methods.Where(m => m is "GET" or "POST" or "PUT" or "PATCH").ToList();
            if (allowed.Count == 0) continue;

            if (!rows.TryGetValue(path, out var set))
            {
                rows[path] = set = new SortedSet<string>(StringComparer.Ordinal);
            }

            foreach (var m in allowed) set.Add(m);
        }

        var builder = new StringBuilder();
        foreach (var (path, methods) in rows)
        {
            builder.Append(string.Join(' ', methods)).Append(' ').Append('/').AppendLine(path);
        }

        return builder.ToString();
    }
}
