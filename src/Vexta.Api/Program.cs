using System.Globalization;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Data.Seed;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Services;

// Everything this API writes for a person to read is in French: the date on an invitation, the
// note a form leaves on a client it created, the month in a report's title. A container has no
// culture of its own, so without this the application would say "23 November 2026" to a Québec
// contractor — in the middle of a French sentence. Fixed rather than negotiated per request:
// there is one language here, and a browser's Accept-Language must not be able to change what
// is written into the database.
var quebec = CultureInfo.GetCultureInfo("fr-CA");
CultureInfo.DefaultThreadCurrentCulture = quebec;
CultureInfo.DefaultThreadCurrentUICulture = quebec;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddControllers()
    .AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();

builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient();

// Behind Traefik the API only ever sees a plain HTTP request from the proxy. Without this it
// builds its own absolute URLs as http://, which breaks the one flow that depends on them:
// an OAuth provider will refuse a redirect_uri that does not match the https one registered.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;

    // The proxy's address is assigned by Docker and changes on every deploy, so it cannot be
    // pinned. Nothing else can reach this container: it publishes no port to the host and is
    // only on the proxy's own network.
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// The keys that sign session-sliding tokens, password-reset links and the platform's stored
// secrets. They have to outlive the container: a fresh key ring means every reset link in
// flight stops working and every saved API key reads as unset.
//
// /data/keys and nothing else by default. A relative path used to be configured here, which
// inside a container resolves to /app — owned by root, while the app runs as a non-root user —
// so the directory could not be created, the ring fell back to memory, and the only sign of it
// was one failed log line at startup. The compose files mount a volume at this path.
var keyPath = builder.Configuration["DataProtection:KeyPath"] ?? "/data/keys";
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keyPath));

builder.AddNpgsqlDbContext<VextaDbContext>("vextadb");

builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddScoped<ISecretProtector, SecretProtector>();
builder.Services.AddScoped<IPlatformSettingsService, PlatformSettingsService>();
builder.Services.AddScoped<IMailgunService, MailgunService>();
builder.Services.AddScoped<IStripeService, StripeService>();
builder.Services.AddScoped<IStripeConnectService, StripeConnectService>();
builder.Services.AddScoped<ITenantSignupService, TenantSignupService>();
builder.Services.AddScoped<ISupplierLinkService, SupplierLinkService>();
builder.Services.AddScoped<IR2StorageService, R2StorageService>();
builder.Services.AddScoped<IBrandingService, BrandingService>();
builder.Services.AddScoped<IEmployeeAccessService, EmployeeAccessService>();
builder.Services.AddScoped<IClientAccessService, ClientAccessService>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IWorkspaceService, WorkspaceService>();
builder.Services.AddScoped<IInvoicePdfService, InvoicePdfService>();
builder.Services.AddScoped<IPasswordResetService, PasswordResetService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddScoped<IFormActionRunner, FormActionRunner>();
builder.Services.AddScoped<IReceiptScanner, ReceiptScanner>();
builder.Services.AddScoped<IFeatureService, FeatureService>();
builder.Services.AddScoped<IWorkbookService, WorkbookService>();
builder.Services.AddScoped<IAssistantService, AssistantService>();

builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        options.Password.RequiredLength = 10;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
        options.Lockout.MaxFailedAccessAttempts = 8;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddRoles<IdentityRole<Guid>>()
    // Identity's refusals are shown to the person word for word, and its own are in English.
    .AddErrorDescriber<FrenchIdentityErrors>()
    .AddEntityFrameworkStores<VextaDbContext>()
    // SignInManager is what reads the provider's response back out of the external cookie
    // (GetExternalLoginInfoAsync). IdentityCore alone does not register it.
    .AddSignInManager()
    // What signs a password-reset token. Without it GeneratePasswordResetTokenAsync throws
    // "No IUserTwoFactorTokenProvider named 'Default'" — and the reset mail never goes out.
    .AddDefaultTokenProviders();

// Two hours. A reset link sits in an inbox, so it should not still open the door tomorrow; the
// sentence in the email quotes this number, from PasswordResetService.ResetLifetime.
//
// The tokens are signed with the data-protection keys, so the key folder has to be a volume
// that survives a redeploy or every link in flight stops working.
builder.Services.Configure<DataProtectionTokenProviderOptions>(options =>
{
    options.TokenLifespan = PasswordResetService.ResetLifetime;
});

// A rejected body answered with ValidationProblemDetails, which has no "message" field — so
// the browser fell back to its generic sentence and the person was told nothing about which
// field was wrong. The errors are joined into the one field every client here already reads.
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var problems = context.ModelState
            .SelectMany(entry => entry.Value?.Errors ?? [])
            .Select(error => FrenchValidationMessage.For(error.ErrorMessage))
            .Where(message => !string.IsNullOrWhiteSpace(message))
            .Distinct()
            .ToArray();

        return new BadRequestObjectResult(new
        {
            message = problems.Length > 0
                ? string.Join(" ", problems)
                : "La demande est incomplète ou mal formée."
        });
    };
});

builder.Services.AddExceptionHandler<UnhandledExceptionHandler>();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException("Configuration Jwt manquante.");

var authenticationBuilder = builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    // Only the external handshake signs in with a cookie, and only for the one redirect
    // between the provider and our callback. Every API request still authenticates with
    // the bearer token.
    options.DefaultSignInScheme = IdentityConstants.ExternalScheme;
});

authenticationBuilder.AddIdentityCookies(_ => { });

authenticationBuilder
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

// Each provider is registered only when its credentials are configured, so a deployment that
// has not set them up yet still boots. ExternalAuthController reports which ones are live.
var googleAuth = builder.Configuration.GetSection("Authentication:Google");
if (!string.IsNullOrWhiteSpace(googleAuth["ClientId"]))
{
    authenticationBuilder.AddGoogle(options =>
    {
        options.ClientId = googleAuth["ClientId"]!;
        options.ClientSecret = googleAuth["ClientSecret"]
            ?? throw new InvalidOperationException("Authentication:Google:ClientSecret manquant.");
    });
}

var microsoftAuth = builder.Configuration.GetSection("Authentication:Microsoft");
if (!string.IsNullOrWhiteSpace(microsoftAuth["ClientId"]))
{
    authenticationBuilder.AddMicrosoftAccount(options =>
    {
        options.ClientId = microsoftAuth["ClientId"]!;
        options.ClientSecret = microsoftAuth["ClientSecret"]
            ?? throw new InvalidOperationException("Authentication:Microsoft:ClientSecret manquant.");
    });
}

builder.Services.AddAuthorization();

const string FrontendCorsPolicy = "FrontendCors";
builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCorsPolicy, policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["http://localhost:3000"];
        policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    });
});

// Fonts and licence, once per process rather than per document.
InvoiceDocument.Configure();

var app = builder.Build();

// Before anything that can throw. Without it a crash answers 500 with an empty body, which the
// browser can only report as a generic failure with nothing tying it to the log.
app.UseExceptionHandler(_ => { });

// A refusal decided by the pipeline rather than by a controller — 401 from the bearer handler,
// 403 from an authorization policy, 404 for an address that matches nothing — answers with no
// body whatsoever. The browser has nothing to read, so all of them reached the person as the
// same "Une erreur est survenue.", with no way to tell a dead session from a missing right.
// Only responses that wrote nothing of their own are filled in; a controller's own refusal,
// with its own wording, passes through untouched.
app.UseStatusCodePages(async context =>
{
    var response = context.HttpContext.Response;
    var message = response.StatusCode switch
    {
        StatusCodes.Status401Unauthorized => "Votre session n'est plus valide. Reconnectez-vous.",
        StatusCodes.Status403Forbidden => "Vous n'avez pas les droits nécessaires pour cette action.",
        StatusCodes.Status404NotFound => "Cette ressource est introuvable.",
        StatusCodes.Status405MethodNotAllowed => "Cette action n'est pas permise sur cette adresse.",
        StatusCodes.Status415UnsupportedMediaType => "Le format de la demande n'est pas accepté.",
        _ => $"La demande a échoué (code {response.StatusCode})."
    };

    await response.WriteAsJsonAsync(new { message, status = response.StatusCode });
});

// First in the pipeline: everything downstream that reads the scheme, host or client IP has to
// see the real ones, not the proxy's.
app.UseForwardedHeaders();

// After the forwarded headers so the path is the real one, and before everything that can
// refuse a request, so a refusal is logged too.
app.UseMiddleware<RequestLog>();

app.MapDefaultEndpoints();

// MapDefaultEndpoints only maps the health endpoints in development. Docker needs one in every
// environment, otherwise a container counts as healthy the moment the process starts and the
// web container is let through before migrations have finished. /alive answers only "is this
// process responding" and says nothing about dependencies, so exposing it leaks nothing.
if (!app.Environment.IsDevelopment())
{
    app.MapHealthChecks("/alive", new HealthCheckOptions
    {
        Predicate = registration => registration.Tags.Contains("live")
    });
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// No HTTPS redirect: the API is an internal service called server-side by the Next.js
// proxy over plain HTTP inside the trusted network/container network. The browser never
// talks to it directly, and a redirect to the dev HTTPS cert breaks that server-to-server fetch.
app.UseCors(FrontendCorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

var startupLogger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
await SuperAdminSeeder.SeedAsync(app.Services, startupLogger);

// After the migrations the line above runs, and after the super admin, because both the
// modules and the features are ordinary rows in tables those migrations create.
await CatalogSeeder.SeedAsync(app.Services, startupLogger);

app.Run();
