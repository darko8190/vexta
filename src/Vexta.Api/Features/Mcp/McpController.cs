using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Mcp;

/// <summary>
/// Vexta as an MCP server, for an outside system holding one of the company's keys.
///
/// It offers one tool, the assistant's own: calling Vexta's API as the person who made the key.
/// Every rule — the company's walls, the role, the validation, no deletes, no writes unless the
/// key allows them — is the API's, applied the same way as on screen, because the call goes
/// through the same door.
///
/// The transport is MCP's « Streamable HTTP » in its simplest form: one JSON-RPC message per
/// POST, answered with one JSON body. No session and no server-sent stream — Vexta never speaks
/// first, so there is nothing to stream.
/// </summary>
[ApiController]
[Route("api/mcp")]
[AllowAnonymous]
public class McpController(
    VextaDbContext db,
    ITokenService tokens,
    IHttpClientFactory httpClientFactory,
    IServer server,
    IFeatureService features,
    ILogger<McpController> logger) : ControllerBase
{
    private const string LatestProtocol = "2025-06-18";
    private static readonly string[] KnownProtocols = ["2025-06-18", "2025-03-26", "2024-11-05"];

    /// <summary>No stream to open: said in the way the transport expects.</summary>
    [HttpGet]
    [HttpGet("{secret}")]
    public IActionResult Stream() => StatusCode(StatusCodes.Status405MethodNotAllowed);

    [HttpPost]
    public Task<IActionResult> Post(CancellationToken ct) => HandleRequestAsync(null, ct);

    /// <summary>
    /// The same server with the key in the address, for the assistants that cannot send an
    /// Authorization header — ChatGPT's connectors among them, set to « Aucune authentification ».
    /// The address is then the secret, and is shown and revoked like the key it carries.
    /// </summary>
    [HttpPost("{secret}")]
    public Task<IActionResult> PostWithKeyInPath(string secret, CancellationToken ct) => HandleRequestAsync(secret, ct);

    private async Task<IActionResult> HandleRequestAsync(string? pathSecret, CancellationToken ct)
    {
        var key = await AuthenticateAsync(pathSecret, ct);
        if (key is null)
        {
            Response.Headers.WWWAuthenticate = "Bearer";
            return Unauthorized(new { message = "Clé MCP absente, invalide ou révoquée." });
        }

        JsonNode? message;
        try
        {
            message = await JsonNode.ParseAsync(Request.Body, cancellationToken: ct);
        }
        catch (JsonException)
        {
            return Ok(Error(null, -32700, "JSON invalide."));
        }

        if (message is JsonArray batch)
        {
            var answers = new JsonArray();
            foreach (var item in batch)
            {
                if (item is JsonObject single && await HandleAsync(single, key, ct) is { } answer) answers.Add(answer);
            }
            return answers.Count == 0 ? Accepted() : Ok(answers);
        }

        if (message is not JsonObject request) return Ok(Error(null, -32600, "Requête JSON-RPC attendue."));

        var reply = await HandleAsync(request, key, ct);
        // A notification gets no answer, only the acknowledgement the transport asks for.
        return reply is null ? Accepted() : Ok(reply);
    }

    private async Task<JsonObject?> HandleAsync(JsonObject request, McpKey key, CancellationToken ct)
    {
        var id = request["id"]?.DeepClone();
        var method = request["method"]?.GetValue<string>() ?? "";
        var parameters = request["params"] as JsonObject;

        // Notifications carry no id and want no answer.
        if (id is null) return null;

        switch (method)
        {
            case "initialize":
                var asked = parameters?["protocolVersion"]?.GetValue<string>();
                return Result(id, new JsonObject
                {
                    ["protocolVersion"] = asked is not null && KnownProtocols.Contains(asked) ? asked : LatestProtocol,
                    ["capabilities"] = new JsonObject { ["tools"] = new JsonObject() },
                    ["serverInfo"] = new JsonObject { ["name"] = "vexta", ["version"] = "1.0.0" },
                    ["instructions"] =
                        "Vexta est un logiciel de gestion pour entrepreneurs (clients, projets, soumissions, factures, "
                        + "employés, produits). Utilisez l'outil appeler_api : commencez par GET api/clients ou "
                        + "GET api/projects pour découvrir les données. Les réponses sont le JSON de l'application."
                        + (key.CanWrite ? "" : " Cette clé ne permet que la lecture (GET)."),
                });

            case "ping":
                return Result(id, new JsonObject());

            case "tools/list":
                return Result(id, new JsonObject
                {
                    ["tools"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["name"] = AssistantApiTool.Name,
                            ["description"] = AssistantApiTool.Description
                                + (key.CanWrite ? "" : " Cette clé est en lecture seule : seul GET est permis."),
                            ["inputSchema"] = JsonNode.Parse(AssistantApiTool.Schema().GetRawText()),
                        },
                    },
                });

            case "tools/call":
                var name = parameters?["name"]?.GetValue<string>();
                if (name != AssistantApiTool.Name) return Error(id, -32602, $"Outil inconnu : {name}.");

                var text = await CallAsync(key, parameters?["arguments"]?.ToJsonString() ?? "{}", ct);
                return Result(id, new JsonObject
                {
                    ["content"] = new JsonArray { new JsonObject { ["type"] = "text", ["text"] = text } },
                    ["isError"] = false,
                });

            default:
                return Error(id, -32601, $"Méthode non prise en charge : {method}.");
        }
    }

    /// <summary>One API call, as the key's owner in the key's company.</summary>
    private async Task<string> CallAsync(McpKey key, string arguments, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == key.UserId, ct);
        var membership = await db.TenantMemberships.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(m => m.UserId == key.UserId && m.TenantId == key.TenantId, ct);

        // The person who made the key has left the company: the key goes with their access.
        if (user is null || membership is null || membership.Role == UserRole.Client)
            return "Cette clé n'a plus d'accès : la personne qui l'a créée n'est plus membre de l'entreprise.";

        var http = httpClientFactory.CreateClient("assistant-api");
        http.Timeout = TimeSpan.FromSeconds(60);

        var tool = new AssistantApiTool(
            http,
            AssistantApiTool.SelfBaseAddress(server, Request),
            $"Bearer {tokens.CreateAccessToken(user, membership)}",
            key.CanWrite,
            logger);

        return await tool.ExecuteAsync(arguments, ct);
    }

    private async Task<McpKey?> AuthenticateAsync(string? pathSecret, CancellationToken ct)
    {
        var header = Request.Headers.Authorization.ToString();
        var secret = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..].Trim() : pathSecret?.Trim();
        if (secret is null || !secret.StartsWith(McpKeysController.KeyStart, StringComparison.Ordinal)) return null;

        var hash = McpKeysController.Hash(secret);
        var key = await db.McpKeys.IgnoreQueryFilters().FirstOrDefaultAsync(k => k.KeyHash == hash && k.RevokedAt == null, ct);
        if (key is null) return null;

        // The plan decides: a key made before the feature was taken off still stops working.
        if (!await features.IsEnabledAsync(FeatureKeys.Mcp, key.TenantId, ct)) return null;

        // A company that is no longer paying is closed to its integrations as to its people.
        var now = DateTimeOffset.UtcNow;
        var open = await db.Tenants.IgnoreQueryFilters().AnyAsync(t => t.Id == key.TenantId
            && (t.SubscriptionStatus == TenantSubscriptionStatus.Active
                || (t.SubscriptionStatus == TenantSubscriptionStatus.Trialing && t.TrialEndsAt > now)), ct);
        if (!open) return null;

        // At most once a minute, so a busy integration is not a write per call.
        if (key.LastUsedAt is null || now - key.LastUsedAt > TimeSpan.FromMinutes(1))
        {
            key.LastUsedAt = now;
            await db.SaveChangesAsync(ct);
        }

        return key;
    }

    private static JsonObject Result(JsonNode id, JsonObject result) =>
        new() { ["jsonrpc"] = "2.0", ["id"] = id, ["result"] = result };

    private static JsonObject Error(JsonNode? id, int code, string message) =>
        new() { ["jsonrpc"] = "2.0", ["id"] = id, ["error"] = new JsonObject { ["code"] = code, ["message"] = message } };
}
