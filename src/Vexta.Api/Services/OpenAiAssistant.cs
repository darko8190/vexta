using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Vexta.Api.Services;

/// <summary>
/// The same loop, for a company that connected ChatGPT.
///
/// Raw HTTP rather than a second SDK. Chat Completions is the one shape every OpenAI-compatible
/// provider speaks, including the ones a company might point this at instead, and adding a
/// package to the server for one JSON body is a dependency to keep patched forever.
///
/// The endpoint is a parameter for that reason: a deployment that puts an Azure endpoint or a
/// compatible gateway in <c>Assistant:OpenAiEndpoint</c> gets the same loop, and it is also
/// what makes this loop testable without spending anybody's money.
/// </summary>
public static class OpenAiAssistant
{
    public const string DefaultEndpoint = "https://api.openai.com/v1/chat/completions";

    /// <summary>
    /// Google's OpenAI-compatible address. The key is a Gemini key from AI Studio, carried in
    /// the same Authorization header — Google accepts it there rather than requiring its own.
    /// </summary>
    public const string GeminiEndpoint =
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

    /// <summary>
    /// GitHub Models, which is what "Copilot" means when there is a token to paste. The token
    /// is a GitHub one with the <c>models</c> scope, and it goes in the same header.
    /// </summary>
    public const string GitHubModelsEndpoint = "https://models.github.ai/inference/chat/completions";

    public static async Task<AssistantRun> RunAsync(
        string apiKey,
        string model,
        string systemPrompt,
        IReadOnlyList<AssistantMessage> history,
        AssistantApiTool tool,
        int maxTurns,
        HttpClient http,
        string endpoint,
        CancellationToken ct)
    {
        long inputTokens = 0;
        long outputTokens = 0;

        var messages = new JsonArray
        {
            new JsonObject { ["role"] = "system", ["content"] = systemPrompt },
        };

        foreach (var message in history.Where(m => !string.IsNullOrWhiteSpace(m.Text)))
        {
            messages.Add(new JsonObject
            {
                ["role"] = message.Role == "assistant" ? "assistant" : "user",
                ["content"] = message.Text,
            });
        }

        if (messages.Count == 1) return new AssistantRun("Pose-moi une question.", 0, 0);

        var schema = JsonNode.Parse(AssistantApiTool.Schema().GetRawText())!;

        var tools = new JsonArray
        {
            new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"] = AssistantApiTool.Name,
                    ["description"] = AssistantApiTool.Description,
                    ["parameters"] = schema,
                },
            },
        };

        for (var turn = 0; turn < maxTurns; turn++)
        {
            var body = new JsonObject
            {
                ["model"] = model,
                ["messages"] = messages.DeepClone(),
                ["tools"] = tools.DeepClone(),
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            using var response = await http.SendAsync(request, ct);
            var text = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                // OpenAI says what is wrong in error.message — a model that does not exist, a
                // key that was revoked, a balance at zero. Three different jobs for whoever
                // reads it, so the sentence is passed through rather than replaced.
                var reason = TryReadError(text) ?? $"HTTP {(int)response.StatusCode}";
                throw new InvalidOperationException(reason);
            }

            var root = JsonNode.Parse(text)?.AsObject();

            // Across every turn, for the same reason as on the Anthropic side: a question
            // answered through tool calls is billed for each exchange it took.
            inputTokens += root?["usage"]?["prompt_tokens"]?.GetValue<long>() ?? 0;
            outputTokens += root?["usage"]?["completion_tokens"]?.GetValue<long>() ?? 0;

            var message = root?["choices"]?.AsArray().FirstOrDefault()?["message"]?.AsObject();
            if (message is null)
            {
                return new AssistantRun("Je n'ai rien reçu du modèle.", inputTokens, outputTokens);
            }

            var toolCalls = message["tool_calls"]?.AsArray();
            if (toolCalls is null || toolCalls.Count == 0)
            {
                var content = message["content"]?.GetValue<string>()?.Trim();
                return new AssistantRun(
                    string.IsNullOrWhiteSpace(content) ? "Je n'ai rien à répondre à cela." : content,
                    inputTokens,
                    outputTokens);
            }

            // The assistant turn goes back exactly as it came, tool calls included: the API
            // matches each result to the call by id and refuses a turn that is missing one.
            messages.Add(message.DeepClone());

            foreach (var call in toolCalls)
            {
                var id = call?["id"]?.GetValue<string>() ?? "";
                var name = call?["function"]?["name"]?.GetValue<string>() ?? "";
                var arguments = call?["function"]?["arguments"]?.GetValue<string>() ?? "{}";

                var result = name == AssistantApiTool.Name
                    ? await tool.ExecuteAsync(arguments, ct)
                    : $"Outil inconnu : {name}";

                messages.Add(new JsonObject
                {
                    ["role"] = "tool",
                    ["tool_call_id"] = id,
                    ["content"] = result,
                });
            }
        }

        return new AssistantRun(
            "Je me suis arrêté après plusieurs essais sans arriver au bout. Reformule la "
            + "demande, ou découpe-la en deux.",
            inputTokens,
            outputTokens);
    }

    /// <summary>The same short exchange, for a company on ChatGPT.</summary>
    public static async Task<string> PingAsync(
        string apiKey, string model, HttpClient http, string endpoint, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["model"] = model,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "user", ["content"] = "Réponds exactement : connecté." },
            },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var response = await http.SendAsync(request, ct);
        var text = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(TryReadError(text) ?? $"HTTP {(int)response.StatusCode}");
        }

        var content = JsonNode.Parse(text)?["choices"]?.AsArray().FirstOrDefault()?["message"]?["content"];
        return content?.GetValue<string>()?.Trim() ?? "(aucun texte)";
    }

    private static string? TryReadError(string payload)
    {
        try
        {
            return JsonNode.Parse(payload)?["error"]?["message"]?.GetValue<string>();
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
