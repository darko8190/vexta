# syntax=docker/dockerfile:1

# Build context is the REPOSITORY ROOT, not this folder: the API references
# Vexta.ServiceDefaults, which lives in a sibling directory. The compose files set
# `context: .` and `dockerfile: src/Vexta.Api/Dockerfile` for that reason.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Project files first, on their own layer: restore is the slow step and only has to run
# again when a dependency actually changes, not on every source edit.
COPY src/Vexta.Api/Vexta.Api.csproj src/Vexta.Api/
COPY src/Vexta.ServiceDefaults/Vexta.ServiceDefaults.csproj src/Vexta.ServiceDefaults/
RUN dotnet restore src/Vexta.Api/Vexta.Api.csproj

COPY src/Vexta.Api/ src/Vexta.Api/
COPY src/Vexta.ServiceDefaults/ src/Vexta.ServiceDefaults/
RUN dotnet publish src/Vexta.Api/Vexta.Api.csproj \
      --configuration Release \
      --no-restore \
      --output /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final

# curl is for the container healthcheck. The runtime image ships without it, and without a
# healthcheck Docker reports the container "up" the instant the process starts, so the web
# container would be let through before migrations have finished running.
RUN apt-get update \
 && apt-get install --yes --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# The data protection key ring lives here. It MUST be a persisted volume: these keys decrypt
# every API key the super admin saved (Stripe, Mailgun, R2). Lose them and those settings
# become unreadable and have to be entered again.
#
# The directory is created and chowned in the image on purpose. Docker copies the ownership of
# an existing image directory onto a fresh named volume mounted over it, which is what lets the
# non-root `app` user write there.
RUN mkdir -p /data/keys && chown --recursive app:app /data
VOLUME /data/keys

WORKDIR /app
COPY --from=build --chown=app:app /app ./

USER app
EXPOSE 8080
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=1

ENTRYPOINT ["dotnet", "Vexta.Api.dll"]
