var builder = DistributedApplication.CreateBuilder(args);

var jwtSigningKey = builder.AddParameter("jwt-signing-key", secret: true);
var superAdminEmail = builder.AddParameter("superadmin-email");
var superAdminPassword = builder.AddParameter("superadmin-password", secret: true);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume()
    .WithPgAdmin();

var vextaDb = postgres.AddDatabase("vextadb");

var api = builder.AddProject<Projects.Vexta_Api>("api")
    .WithReference(vextaDb)
    .WaitFor(vextaDb)
    .WithEnvironment("Jwt__SigningKey", jwtSigningKey)
    .WithEnvironment("SuperAdmin__Email", superAdminEmail)
    .WithEnvironment("SuperAdmin__Password", superAdminPassword)
    .WithExternalHttpEndpoints();

// Social sign-in is optional: a machine without provider credentials still runs the whole app,
// the API just reports no providers and the buttons stay hidden. Set these in this project's
// user-secrets (dotnet user-secrets set "Authentication:Google:ClientId" "…").
string[] externalAuthKeys =
[
    "Authentication:Google:ClientId",
    "Authentication:Google:ClientSecret",
    "Authentication:Microsoft:ClientId",
    "Authentication:Microsoft:ClientSecret",
];

foreach (var key in externalAuthKeys)
{
    var value = builder.Configuration[key];
    if (!string.IsNullOrWhiteSpace(value))
    {
        api.WithEnvironment(key.Replace(":", "__"), value);
    }
}

var pnpmCommand = OperatingSystem.IsWindows() ? "pnpm.cmd" : "pnpm";

builder.AddExecutable("web", pnpmCommand, "../../web", ["dev"])
    .WithReference(api)
    .WaitFor(api)
    .WithEnvironment("API_INTERNAL_URL", api.GetEndpoint("http"))
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
