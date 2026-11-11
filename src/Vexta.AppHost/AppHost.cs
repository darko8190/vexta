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

var pnpmCommand = OperatingSystem.IsWindows() ? "pnpm.cmd" : "pnpm";

builder.AddExecutable("web", pnpmCommand, "../../web", ["dev"])
    .WithReference(api)
    .WaitFor(api)
    .WithEnvironment("API_INTERNAL_URL", api.GetEndpoint("http"))
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
