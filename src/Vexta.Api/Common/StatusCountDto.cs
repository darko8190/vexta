namespace Vexta.Api.Common;

/// <summary>How many records of a list sit in one state, for the row of state pills above it.</summary>
public record StatusCountDto(string Status, int Count);
