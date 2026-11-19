using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Data.Seed;
using Vexta.Api.Domain;
using Vexta.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddControllers()
    .AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();

builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient();

builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(builder.Configuration["DataProtection:KeyPath"] ?? "/data/keys"));

builder.AddNpgsqlDbContext<VextaDbContext>("vextadb");

builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddScoped<ISecretProtector, SecretProtector>();
builder.Services.AddScoped<IPlatformSettingsService, PlatformSettingsService>();
builder.Services.AddScoped<IMailgunService, MailgunService>();
builder.Services.AddScoped<IStripeService, StripeService>();
builder.Services.AddScoped<ITenantSignupService, TenantSignupService>();
builder.Services.AddScoped<ITokenService, TokenService>();

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
    .AddEntityFrameworkStores<VextaDbContext>()
    // SignInManager is what reads the provider's response back out of the external cookie
    // (GetExternalLoginInfoAsync). IdentityCore alone does not register it.
    .AddSignInManager();

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

var app = builder.Build();

app.MapDefaultEndpoints();

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

app.Run();
