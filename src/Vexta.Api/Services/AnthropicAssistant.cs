using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace Vexta.Api.Services;

/// <summary>
/// The loop, for a company that connected Claude.
///
/// Written by hand rather than with the SDK's tool runner because of the ceiling: this spends
/// the company's own money, and a loop that decides for itself when to stop is a loop that can
/// decide wrong. Here, the number of turns is the budget.
/// </summary>
public static class AnthropicAssistant
{
    /// <summary>
    /// Room for an answer with a few paragraphs, and for the thinking that newer models do
    /// whether asked to or not. Too tight truncates the answer rather than saving anything.
    /// </summary>
    private const int MaxTokens = 8192;

    public static async Task<string> RunAsync(
        string apiKey,
        string model,
        string systemPrompt,
        IReadOnlyList<AssistantMessage> history,
        AssistantApiTool tool,
        int maxTurns,
        CancellationToken ct)
    {
        var client = new AnthropicClient { ApiKey = apiKey };

        var messages = history
            .Where(m => !string.IsNullOrWhiteSpace(m.Text))
            .Select(m => m.Role == "assistant"
                ? (MessageParam)new AssistantMessageParam { Content = m.Text }
                : new UserMessageParam { Content = m.Text })
            .ToList();

        if (messages.Count == 0)
        {
            return "Pose-moi une question.";
        }

        var tools = new List<ToolUnion>
        {
            new Tool
            {
                Name = AssistantApiTool.Name,
                Description = AssistantApiTool.Description,
                InputSchema = new()
                {
                    Properties = Properties(),
                    Required = ["methode", "chemin"],
                },
            },
        };

        for (var turn = 0; turn < maxTurns; turn++)
        {
            var response = await client.Messages.Create(new MessageCreateParams
            {
                Model = model,
                MaxTokens = MaxTokens,
                System = systemPrompt,
                Tools = tools,
                Messages = messages,
            }, cancellationToken: ct);

            List<ContentBlockParam> assistantContent = [];
            List<ContentBlockParam> toolResults = [];
            var answer = new System.Text.StringBuilder();

            foreach (var block in response.Content)
            {
                if (block.TryPickText(out var text))
                {
                    assistantContent.Add(new TextBlockParam { Text = text.Text });
                    answer.AppendLine(text.Text);
                }
                else if (block.TryPickThinking(out var thinking))
                {
                    // The signature travels with it or the next call is refused: the API checks
                    // that the reasoning it is shown is the reasoning it produced.
                    assistantContent.Add(new ThinkingBlockParam
                    {
                        Thinking = thinking.Thinking,
                        Signature = thinking.Signature,
                    });
                }
                else if (block.TryPickRedactedThinking(out var redacted))
                {
                    assistantContent.Add(new RedactedThinkingBlockParam { Data = redacted.Data });
                }
                else if (block.TryPickToolUse(out var toolUse))
                {
                    assistantContent.Add(new ToolUseBlockParam
                    {
                        ID = toolUse.ID,
                        Name = toolUse.Name,
                        Input = toolUse.Input,
                    });

                    var result = toolUse.Name == AssistantApiTool.Name
                        ? await tool.ExecuteAsync(JsonSerializer.Serialize(toolUse.Input), ct)
                        : $"Outil inconnu : {toolUse.Name}";

                    toolResults.Add(new ToolResultBlockParam { ToolUseID = toolUse.ID, Content = result });
                }
            }

            if (toolResults.Count == 0)
            {
                var final = answer.ToString().Trim();
                return final.Length > 0 ? final : "Je n'ai rien à répondre à cela.";
            }

            messages.Add(new AssistantMessageParam { Content = assistantContent });
            messages.Add(new UserMessageParam { Content = toolResults });
        }

        return "Je me suis arrêté après plusieurs essais sans arriver au bout. Reformule la "
             + "demande, ou découpe-la en deux.";
    }

    /// <summary>
    /// One short exchange with no tools, to find out whether the key and the model name work.
    /// Throws what the API said, because "model not found", "invalid api key" and "credit
    /// balance too low" are three different jobs for whoever reads it.
    /// </summary>
    public static async Task<string> PingAsync(string apiKey, string model, CancellationToken ct)
    {
        var client = new AnthropicClient { ApiKey = apiKey };

        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = model,
            MaxTokens = 64,
            Messages = [new UserMessageParam { Content = "Réponds exactement : connecté." }],
        }, cancellationToken: ct);

        foreach (var block in response.Content)
        {
            if (block.TryPickText(out var text)) return text.Text.Trim();
        }

        return "(aucun texte)";
    }

    private static Dictionary<string, JsonElement> Properties()
    {
        var schema = AssistantApiTool.Schema();
        var properties = schema.GetProperty("properties");

        return properties.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
    }
}
