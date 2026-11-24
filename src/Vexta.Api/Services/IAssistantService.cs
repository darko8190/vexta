using System.Text;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <param name="Role">"user" or "assistant". The transcript the browser holds, sent back each turn.</param>
public record AssistantMessage(string Role, string Text);

/// <param name="Actions">What it did on the way, in order. Shown under the answer.</param>
public record AssistantReply(string Text, IReadOnlyList<AssistantAction> Actions);

/// <summary>What one provider round trip produced, and what it was billed for.</summary>
public record AssistantRun(string Text, long InputTokens, long OutputTokens);

/// <summary>
/// What the assistant has spent this month, for the header.
///
/// The cost is null until the company has entered its own per-million prices. A figure in
/// dollars that nobody supplied the rate for would be a guess printed beside a currency sign.
/// </summary>
public record AssistantUsageDto(
    long InputTokens,
    long OutputTokens,
    decimal? Cost);

/// <param name="Reason">Why not, in French, for the one case where the button was drawn anyway.</param>
public record AssistantAvailability(
    bool Available,
    string? Reason,
    string Provider,
    string? Model,
    bool CanWrite,
    /// <summary>This month's spend. Null when no assistant is set up.</summary>
    AssistantUsageDto? Usage);

/// <param name="ApiReachable">The application answered its own call. False is a deployment fault.</param>
/// <param name="ModelReachable">The provider accepted the key and the model name.</param>
public record AssistantTestResult(bool ApiReachable, bool ModelReachable, string Message);

public interface IAssistantService
{
    Task<AssistantAvailability> AvailabilityAsync(CancellationToken ct = default);

    /// <summary>
    /// Checks the two things that can be wrong before anybody asks a question: whether the
    /// application can reach itself, and whether the provider accepts the key.
    ///
    /// Worth its own button because the two fail in ways that look identical from inside a
    /// conversation — "je n'ai pas pu répondre" covers a revoked key, a model name that does
    /// not exist and a container that cannot call its own port.
    /// </summary>
    Task<AssistantTestResult> TestAsync(CancellationToken ct = default);

    /// <summary>
    /// Answers one turn, running whatever calls the model decides it needs on the way.
    ///
    /// Never throws for an ordinary failure — a key the provider refused, a model name that does
    /// not exist, a conversation that ran past its own limit. Those come back as a sentence the
    /// person can act on, because a red toast saying "erreur" in front of somebody mid-question
    /// leaves them nothing to do.
    /// </summary>
    Task<AssistantReply> AskAsync(IReadOnlyList<AssistantMessage> history, CancellationToken ct = default);
}

public class AssistantService(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IFeatureService features,
    ISecretProtector protector,
    IHttpContextAccessor accessor,
    IHttpClientFactory httpClientFactory,
    EndpointDataSource endpoints,
    IServer server,
    IConfiguration configuration,
    ILogger<AssistantService> logger) : IAssistantService
{
    /// <summary>
    /// How many times round the loop before the assistant has to say something. Each turn is a
    /// call to the model and up to one call to Vexta, so this is the ceiling on what one
    /// question can cost the company. Eight is enough to read a list, read a record, write a
    /// change and check it; a model still going at eight is a model that is lost.
    /// </summary>
    private const int MaxTurns = 8;

    /// <summary>
    /// Where a Chat Completions request goes for each provider that speaks that shape.
    ///
    /// Three providers, one loop. OpenAI, Google and GitHub all publish an address that takes
    /// the same body and answers the same way, tool calls included, so the only thing that
    /// differs between them is this string. Each one can be overridden by a deployment — an
    /// Azure endpoint, a compatible gateway — which is also what makes the loop testable
    /// without spending anybody's money.
    /// </summary>
    private string EndpointFor(AiProvider provider)
    {
        var (setting, fallback) = provider switch
        {
            AiProvider.Gemini => ("Assistant:GeminiEndpoint", OpenAiAssistant.GeminiEndpoint),
            AiProvider.Copilot => ("Assistant:CopilotEndpoint", OpenAiAssistant.GitHubModelsEndpoint),
            _ => ("Assistant:OpenAiEndpoint", OpenAiAssistant.DefaultEndpoint)
        };

        return configuration[setting] is { Length: > 0 } custom ? custom : fallback;
    }

    /// <summary>
    /// True for every provider served by <see cref="OpenAiAssistant"/>. Anthropic is the one
    /// that is not: it has its own protocol and its own adapter.
    /// </summary>
    private static bool SpeaksChatCompletions(AiProvider provider) =>
        provider is AiProvider.OpenAi or AiProvider.Gemini or AiProvider.Copilot;

    public async Task<AssistantAvailability> AvailabilityAsync(CancellationToken ct = default)
    {
        var settings = await SettingsAsync(ct);
        var provider = (settings?.Provider ?? AiProvider.Anthropic).ToString();

        if (currentUser.TenantId is null)
        {
            return new AssistantAvailability(false, "Aucun espace actif.", provider, settings?.Model, false, null);
        }

        if (!await features.IsEnabledAsync(FeatureKeys.Ai, ct))
        {
            return new AssistantAvailability(
                false, "L'assistant n'est pas inclus dans votre forfait.", provider, settings?.Model, false, null);
        }

        if (settings is null || string.IsNullOrWhiteSpace(settings.EncryptedApiKey))
        {
            return new AssistantAvailability(
                false, "Aucune clé n'est enregistrée. Branchez un compte dans Paramètres → Assistant IA.",
                provider, settings?.Model, false, null);
        }

        if (!settings.IsEnabled)
        {
            return new AssistantAvailability(
                false, "L'assistant est éteint pour cette entreprise.", provider, settings.Model,
                settings.CanWrite, UsageOf(settings));
        }

        return new AssistantAvailability(
            true, null, provider, settings.Model, settings.CanWrite, UsageOf(settings));
    }

    /// <summary>
    /// This month's tokens, and what they cost when the company has told us its rate.
    ///
    /// A counter belonging to an earlier month reads as zero rather than being carried forward:
    /// the reset happens on the next reply, and until then the stored figure is last month's.
    /// Showing it under this month's heading would be the one kind of wrong a money figure must
    /// not be.
    /// </summary>
    private static AssistantUsageDto UsageOf(TenantAiSettings settings)
    {
        var current = settings.UsagePeriod == FirstOfThisMonth();
        var input = current ? settings.InputTokens : 0;
        var output = current ? settings.OutputTokens : 0;

        decimal? cost = settings.InputPricePerMillion is { } inPrice
            && settings.OutputPricePerMillion is { } outPrice
                ? decimal.Round(
                    (input * inPrice + output * outPrice) / 1_000_000m,
                    2,
                    MidpointRounding.AwayFromZero)
                : null;

        return new AssistantUsageDto(input, output, cost);
    }

    private static DateOnly FirstOfThisMonth()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return new DateOnly(today.Year, today.Month, 1);
    }

    /// <summary>
    /// Adds what the exchange was billed for to this month's running total.
    ///
    /// Its own save, and deliberately forgiving: the person already has their answer, and losing
    /// the tally is a worse outcome to force on them than it is to swallow. A failure here must
    /// never turn a successful reply into an error on screen.
    /// </summary>
    private async Task RecordUsageAsync(long inputTokens, long outputTokens, CancellationToken ct)
    {
        if (inputTokens <= 0 && outputTokens <= 0) return;
        if (currentUser.TenantId is not { } tenantId) return;

        try
        {
            var settings = await db.TenantAiSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
            if (settings is null) return;

            var period = FirstOfThisMonth();
            if (settings.UsagePeriod != period)
            {
                settings.UsagePeriod = period;
                settings.InputTokens = 0;
                settings.OutputTokens = 0;
            }

            settings.InputTokens += inputTokens;
            settings.OutputTokens += outputTokens;

            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "La consommation de l'assistant n'a pas pu être enregistrée.");
        }
    }

    public async Task<AssistantTestResult> TestAsync(CancellationToken ct = default)
    {
        var availability = await AvailabilityAsync(ct);
        if (!availability.Available)
        {
            return new AssistantTestResult(false, false, availability.Reason ?? "L'assistant n'est pas disponible.");
        }

        var settings = (await SettingsAsync(ct))!;
        var apiKey = protector.Unprotect(settings.EncryptedApiKey!);

        var http = httpClientFactory.CreateClient("assistant-api");
        http.Timeout = TimeSpan.FromSeconds(30);

        var tool = new AssistantApiTool(
            http,
            SelfBaseAddress(),
            accessor.HttpContext?.Request.Headers.Authorization.ToString() is { Length: > 0 } header ? header : null,
            canWrite: false,
            logger);

        // A read nobody minds and every space can answer, through exactly the path a tool call
        // would take: same base address, same forwarded token, same client.
        var probe = await tool.ExecuteAsync("""{"methode":"GET","chemin":"api/fonctionnalites"}""", ct);
        var apiReachable = probe.StartsWith("HTTP 2", StringComparison.Ordinal);

        if (!apiReachable)
        {
            return new AssistantTestResult(false, false,
                "L'assistant ne peut pas joindre Vexta. C'est une erreur d'installation, pas de configuration — prévenez votre fournisseur.");
        }

        try
        {
            // No tools and a tight ceiling: this is about whether the key works, and it costs
            // a fraction of a cent to find out.
            var answer = settings.Provider switch
            {
                var p when SpeaksChatCompletions(p) =>
                    await OpenAiAssistant.PingAsync(apiKey, settings.Model, http, EndpointFor(p), ct),
                _ => await AnthropicAssistant.PingAsync(apiKey, settings.Model, ct),
            };

            return new AssistantTestResult(true, true,
                $"Tout fonctionne. {settings.Model} a répondu : « {answer} »");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Test de l'assistant refusé par le fournisseur.");
            return new AssistantTestResult(true, false,
                $"Vexta est joignable, mais {settings.Provider} a refusé : {ex.Message}");
        }
    }

    public async Task<AssistantReply> AskAsync(
        IReadOnlyList<AssistantMessage> history, CancellationToken ct = default)
    {
        var availability = await AvailabilityAsync(ct);
        if (!availability.Available)
        {
            return new AssistantReply(availability.Reason ?? "L'assistant n'est pas disponible.", []);
        }

        var settings = (await SettingsAsync(ct))!;
        var apiKey = protector.Unprotect(settings.EncryptedApiKey!);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new AssistantReply(
                "La clé enregistrée n'a pas pu être lue. Ré-enregistrez-la dans Paramètres → Assistant IA.", []);
        }

        var http = httpClientFactory.CreateClient("assistant-api");
        // Long enough for a report that counts a year of invoices, short enough that a hung
        // call gives the person their turn back rather than spinning until they reload.
        http.Timeout = TimeSpan.FromSeconds(60);

        var tool = new AssistantApiTool(
            http,
            SelfBaseAddress(),
            accessor.HttpContext?.Request.Headers.Authorization.ToString() is { Length: > 0 } header ? header : null,
            settings.CanWrite,
            logger);

        var prompt = await SystemPromptAsync(settings.CanWrite, ct);

        try
        {
            var run = settings.Provider switch
            {
                var p when SpeaksChatCompletions(p) => await OpenAiAssistant.RunAsync(
                    apiKey, settings.Model, prompt, history, tool, MaxTurns, http, EndpointFor(p), ct),
                _ => await AnthropicAssistant.RunAsync(
                    apiKey, settings.Model, prompt, history, tool, MaxTurns, ct),
            };

            await RecordUsageAsync(run.InputTokens, run.OutputTokens, ct);

            return new AssistantReply(run.Text, tool.Actions);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            // The provider's own message is kept: "model not found", "invalid api key" and
            // "insufficient quota" are three different jobs for whoever reads this, and
            // flattening them into one sentence sends them to check the wrong thing.
            logger.LogError(ex, "L'assistant a échoué pour le locataire {TenantId}.", currentUser.TenantId);
            return new AssistantReply($"L'assistant n'a pas pu répondre : {ex.Message}", tool.Actions);
        }
    }

    private async Task<TenantAiSettings?> SettingsAsync(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return null;
        return await db.TenantAiSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
    }

    /// <summary>
    /// Where the application answers itself.
    ///
    /// Taken from the server's own listening addresses rather than from the public hostname:
    /// inside a container the public name goes out to the internet, through the reverse proxy
    /// and back, which is three more things that can be down. An http address is preferred over
    /// an https one for the same reason a loopback call does not need a certificate.
    /// </summary>
    private string SelfBaseAddress()
    {
        var addresses = server.Features.Get<IServerAddressesFeature>()?.Addresses ?? [];

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

        var request = accessor.HttpContext?.Request;
        return request is null ? "http://localhost/" : $"{request.Scheme}://{request.Host}/";
    }

    private async Task<string> SystemPromptAsync(bool canWrite, CancellationToken ct)
    {
        var tenantName = currentUser.TenantId is { } tenantId
            ? await db.Tenants.AsNoTracking().Where(t => t.Id == tenantId).Select(t => t.Name).FirstOrDefaultAsync(ct)
            : null;

        var role = currentUser.Role switch
        {
            UserRole.TenantAdmin => "administrateur de l'entreprise",
            UserRole.ProjectManager => "chargé de projet",
            UserRole.Client => "client de l'entreprise",
            _ => "employé",
        };

        var builder = new StringBuilder();
        builder.AppendLine($"""
            Tu es l'assistant de Vexta, un logiciel de gestion pour entrepreneurs québécois.
            Tu travailles pour {tenantName ?? "cette entreprise"} et tu parles à un {role}.

            Nous sommes le {BusinessDay.Today:yyyy-MM-dd} (heure de l'Est). Les montants sont en
            dollars canadiens, les taxes sont la TPS et la TVQ, et tu réponds toujours en français.

            Tu ne sais rien de cette entreprise avant de l'avoir lu. Pour répondre à quoi que ce
            soit — un nombre de clients, le solde d'une facture, l'horaire de quelqu'un — tu
            appelles l'outil {AssistantApiTool.Name}. N'invente jamais une donnée : si un appel
            échoue ou revient vide, dis-le.

            Comment travailler :
            - Lis avant d'écrire. Avant de créer ou de modifier, fais un GET sur la même famille
              de routes pour voir la forme exacte des champs, puis écris.
            - Un seul appel à la fois, et regarde la réponse avant le suivant.
            - Une erreur 400 te dit ce qui ne va pas : corrige et réessaie une fois. Deux échecs
              sur la même chose, tu t'arrêtes et tu expliques.
            - Quand tu as modifié quelque chose, dis en une phrase ce que tu as changé et où la
              personne peut aller le voir.
            - Reste court. Pas de tableau de trente lignes quand trois phrases suffisent.
            """);

        builder.AppendLine();
        builder.AppendLine(canWrite
            ? "Tu peux créer et modifier. Tu ne peux rien supprimer : dis à la personne de le "
              + "faire elle-même depuis l'écran concerné."
            : "Tu es en lecture seule : tous les appels autres que GET seront refusés. Si on te "
              + "demande de créer ou de modifier quelque chose, explique qu'un administrateur "
              + "doit d'abord t'y autoriser dans Paramètres → Assistant IA.");

        builder.AppendLine();
        builder.AppendLine("Les routes disponibles (les {valeurs} entre accolades sont à remplacer) :");
        builder.AppendLine();
        builder.Append(AssistantApiTool.RouteCatalogue(endpoints));

        return builder.ToString();
    }
}
