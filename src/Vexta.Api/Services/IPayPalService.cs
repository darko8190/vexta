using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>What PayPal says about a captured order: its id, the amount and the invoice it was for.</summary>
public record PayPalCapture(string CaptureId, decimal Amount, string Currency, string? InvoiceId);

/// <summary>
/// A company's own PayPal Business account, reached with the REST credentials it pasted in its
/// settings. Orders are created and captured on that account, so the money goes straight to the
/// company — Vexta never holds it.
/// </summary>
public interface IPayPalService
{
    /// <summary>Whether the credentials open a session with PayPal. Null when they do; the reason otherwise.</summary>
    Task<string?> VerifyAsync(string clientId, string secret, bool sandbox, CancellationToken ct = default);

    /// <summary>Creates an order for the amount and returns the page the customer approves it on.</summary>
    Task<(string OrderId, string ApproveUrl)> CreateOrderAsync(
        Tenant tenant, Guid invoiceId, string description, decimal amount, string currency,
        string returnUrl, string cancelUrl, CancellationToken ct = default);

    /// <summary>Captures an approved order. Null when PayPal did not complete it.</summary>
    Task<PayPalCapture?> CaptureOrderAsync(Tenant tenant, string orderId, CancellationToken ct = default);
}

public class PayPalService(IHttpClientFactory httpClientFactory, ISecretProtector protector, ILogger<PayPalService> logger)
    : IPayPalService
{
    private static string BaseUrl(bool sandbox) =>
        sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

    public async Task<string?> VerifyAsync(string clientId, string secret, bool sandbox, CancellationToken ct = default)
    {
        try
        {
            await TokenAsync(clientId, secret, sandbox, ct);
            return null;
        }
        catch (InvalidOperationException ex)
        {
            return ex.Message;
        }
        catch (HttpRequestException)
        {
            return "PayPal ne répond pas. Réessayez dans un instant.";
        }
    }

    public async Task<(string OrderId, string ApproveUrl)> CreateOrderAsync(
        Tenant tenant, Guid invoiceId, string description, decimal amount, string currency,
        string returnUrl, string cancelUrl, CancellationToken ct = default)
    {
        var (client, sandbox) = await ClientAsync(tenant, ct);

        var body = new JsonObject
        {
            ["intent"] = "CAPTURE",
            ["purchase_units"] = new JsonArray
            {
                new JsonObject
                {
                    ["reference_id"] = invoiceId.ToString(),
                    ["custom_id"] = invoiceId.ToString(),
                    ["description"] = description.Length > 120 ? description[..120] : description,
                    ["amount"] = new JsonObject
                    {
                        ["currency_code"] = currency.ToUpperInvariant(),
                        ["value"] = amount.ToString("0.00", CultureInfo.InvariantCulture),
                    },
                },
            },
            ["application_context"] = new JsonObject
            {
                ["brand_name"] = tenant.Name.Length > 127 ? tenant.Name[..127] : tenant.Name,
                ["user_action"] = "PAY_NOW",
                ["shipping_preference"] = "NO_SHIPPING",
                ["return_url"] = returnUrl,
                ["cancel_url"] = cancelUrl,
            },
        };

        using var response = await client.PostAsync(
            $"{BaseUrl(sandbox)}/v2/checkout/orders",
            new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"), ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("PayPal a refusé la commande : {Status} {Body}", (int)response.StatusCode, text);
            throw new InvalidOperationException("PayPal a refusé de créer le paiement.");
        }

        var json = JsonNode.Parse(text)!;
        var orderId = json["id"]!.GetValue<string>();
        var approve = json["links"]?.AsArray()
            .FirstOrDefault(link => link?["rel"]?.GetValue<string>() is "approve" or "payer-action")?["href"]?.GetValue<string>();
        if (approve is null) throw new InvalidOperationException("PayPal n'a pas renvoyé de page de paiement.");
        return (orderId, approve);
    }

    public async Task<PayPalCapture?> CaptureOrderAsync(Tenant tenant, string orderId, CancellationToken ct = default)
    {
        var (client, sandbox) = await ClientAsync(tenant, ct);

        using var response = await client.PostAsync(
            $"{BaseUrl(sandbox)}/v2/checkout/orders/{Uri.EscapeDataString(orderId)}/capture",
            new StringContent("{}", Encoding.UTF8, "application/json"), ct);
        var text = await response.Content.ReadAsStringAsync(ct);

        // Already captured: read the order instead, so a second return from PayPal still records it.
        if (!response.IsSuccessStatusCode)
        {
            using var read = await client.GetAsync($"{BaseUrl(sandbox)}/v2/checkout/orders/{Uri.EscapeDataString(orderId)}", ct);
            text = await read.Content.ReadAsStringAsync(ct);
            if (!read.IsSuccessStatusCode)
            {
                logger.LogWarning("Capture PayPal refusée : {Status} {Body}", (int)response.StatusCode, text);
                return null;
            }
        }

        var json = JsonNode.Parse(text)!;
        if (json["status"]?.GetValue<string>() != "COMPLETED") return null;

        var unit = json["purchase_units"]?.AsArray().FirstOrDefault();
        var capture = unit?["payments"]?["captures"]?.AsArray().FirstOrDefault();
        if (capture is null || capture["status"]?.GetValue<string>() != "COMPLETED") return null;

        var amount = decimal.Parse(capture["amount"]!["value"]!.GetValue<string>(), CultureInfo.InvariantCulture);
        return new PayPalCapture(
            capture["id"]!.GetValue<string>(),
            amount,
            capture["amount"]!["currency_code"]!.GetValue<string>(),
            capture["custom_id"]?.GetValue<string>() ?? unit?["custom_id"]?.GetValue<string>() ?? unit?["reference_id"]?.GetValue<string>());
    }

    private async Task<(HttpClient Client, bool Sandbox)> ClientAsync(Tenant tenant, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(tenant.PayPalClientId) || string.IsNullOrWhiteSpace(tenant.PayPalSecretProtected))
        {
            throw new InvalidOperationException("Cette entreprise n'a pas branché de compte PayPal.");
        }

        var secret = protector.Unprotect(tenant.PayPalSecretProtected);
        var token = await TokenAsync(tenant.PayPalClientId, secret, tenant.PayPalSandbox, ct);
        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, tenant.PayPalSandbox);
    }

    private async Task<string> TokenAsync(string clientId, string secret, bool sandbox, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl(sandbox)}/v1/oauth2/token")
        {
            Content = new FormUrlEncodedContent([new KeyValuePair<string, string>("grant_type", "client_credentials")]),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId.Trim()}:{secret.Trim()}")));

        using var response = await client.SendAsync(request, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                "PayPal a refusé ces identifiants. Vérifiez l'identifiant client, le secret et le mode (test ou réel).");
        }

        using var document = JsonDocument.Parse(text);
        return document.RootElement.GetProperty("access_token").GetString()!;
    }
}
